import test from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import {pool} from '../src/config/db.js'
import {env} from '../src/config/env.js'
import {authenticate} from '../src/middleware/auth.js'
import {login,refresh} from '../src/services/authService.js'
import {passwordRecoveryMailStatus,sendPasswordRecoveryEmail} from '../src/services/mailService.js'
import {forgotPasswordSchema,resetPasswordSchema} from '../src/validations/passwordRecoveryValidation.js'

const config={NODE_ENV:'production',APP_PUBLIC_URL:'https://programa.example.test',SMTP_HOST:'smtp.example.test',SMTP_PORT:465,SMTP_SECURE:true,SMTP_USER:'sender@example.test',SMTP_PASSWORD:'private-app-password',MAIL_FROM:'sender@example.test',PASSWORD_RECOVERY_TO:'recovery@example.test'}

test('recuperació: destinatari central obligatori i HTTPS en producció',()=>{
 assert.equal(passwordRecoveryMailStatus(config).ready,true)
 for(const change of [{PASSWORD_RECOVERY_TO:''},{PASSWORD_RECOVERY_TO:undefined},{SMTP_PASSWORD:''},{APP_PUBLIC_URL:'http://programa.example.test'},{APP_PUBLIC_URL:'https://localhost'},{APP_PUBLIC_URL:'https://user:secret@example.test'}])assert.equal(passwordRecoveryMailStatus({...config,...change}).ready,false)
})

test('recuperació: permet localhost en desenvolupament i el bloqueja en producció',()=>{
 for(const APP_PUBLIC_URL of ['http://localhost:5174','http://127.0.0.1:5174','http://[::1]:5174','http://app.localhost:5174','https://localhost:5174']){
  const local={...config,NODE_ENV:'development',APP_PUBLIC_URL}
  assert.equal(passwordRecoveryMailStatus(local).ready,true)
  assert.equal(passwordRecoveryMailStatus({...local,NODE_ENV:'test'}).ready,true)
  assert.equal(passwordRecoveryMailStatus({...local,NODE_ENV:'production'}).ready,false)
 }
 for(const APP_PUBLIC_URL of ['','http://0.0.0.0:5174','ftp://localhost:5174','http://user:secret@localhost:5174'])assert.equal(passwordRecoveryMailStatus({...config,NODE_ENV:'development',APP_PUBLIC_URL}).ready,false)
})

test('recuperació: SMTP envia només al correu del .env i ignora qualsevol destinatari del missatge',async()=>{
 let sent,options,closed=false
 await sendPasswordRecoveryEmail({subject:'Recuperació',text:'Enllaç temporal',to:'attacker@example.test',from:'attacker@example.test'},{config,createTransport:value=>{
  options=value
  return {sendMail:async message=>{sent=message;return {accepted:[config.PASSWORD_RECOVERY_TO]}},close:()=>{closed=true}}
 }})
 assert.deepEqual(sent,{from:config.MAIL_FROM,to:config.PASSWORD_RECOVERY_TO,subject:'Recuperació',text:'Enllaç temporal'})
 assert.equal(options.secure,true)
 assert.equal(options.disableFileAccess,true)
 assert.equal(options.disableUrlAccess,true)
 assert.equal(closed,true)
 await assert.rejects(()=>sendPasswordRecoveryEmail({subject:'Recuperació',text:'Text'},{config:{...config,PASSWORD_RECOVERY_TO:''},createTransport:()=>assert.fail('No ha de contactar amb SMTP')}),error=>error.code==='MAIL_NOT_CONFIGURED')
})

test('recuperació: els errors SMTP no exposen credencials i tanquen el transport',async()=>{
 for(const sendMail of [async()=>({accepted:[],rejected:[config.PASSWORD_RECOVERY_TO]}),async()=>{throw new Error(config.SMTP_PASSWORD)}]){
  let closed=false
  await assert.rejects(()=>sendPasswordRecoveryEmail({subject:'Recuperació',text:'Enllaç temporal'},{config,createTransport:()=>({sendMail,close:()=>{closed=true}})}),error=>error.code==='MAIL_SEND_FAILED'&&!JSON.stringify(error).includes(config.SMTP_PASSWORD))
  assert.equal(closed,true)
 }
})

test('recuperació: valida el compte, la confirmació, el token i el límit real de bcrypt; rebutja canvis de destinatari',()=>{
 const valid={token:'a'.repeat(43),password:'nova-contrasenya',confirmPassword:'nova-contrasenya'}
 assert.equal(forgotPasswordSchema.parse({username:' usuari '}).username,'usuari')
 assert.equal(resetPasswordSchema.safeParse(valid).success,true)
 for(const body of [{username:''},{username:'usuari',to:'attacker@example.test'},{username:'usuari',publicUrl:'https://attacker.example'}])assert.equal(forgotPasswordSchema.safeParse(body).success,false)
 for(const body of [{...valid,confirmPassword:'una-altra'},{...valid,token:'a'.repeat(42)},{...valid,token:'a'.repeat(42)+'/'},{...valid,password:'curta',confirmPassword:'curta'},{...valid,password:'é'.repeat(37),confirmPassword:'é'.repeat(37)},{...valid,to:'attacker@example.test'}])assert.equal(resetPasswordSchema.safeParse(body).success,false)
})

test('recuperació: rebutja access tokens anteriors al canvi, inclosos els antics sense versió',async t=>{
 t.mock.method(pool,'execute',async sql=>sql.includes('role_permissions')?[[{permission_key:'dashboard.view'}]]:[[{id:9,is_active:1,auth_version:1,role_id:1}]])
 for(const ver of [undefined,0,1]){
  const payload={sub:'9',type:'access',...(ver===undefined?{}:{ver})}
  const token=jwt.sign(payload,env.JWT_ACCESS_SECRET,{expiresIn:'1m'})
  const req={get:()=>`Bearer ${token}`}
  let result='not-called'
  await authenticate(req,{},error=>{result=error})
  if(ver===1){assert.equal(result,undefined);assert.equal(req.user.id,9)}
  else{assert.equal(result.code,'INVALID_TOKEN');assert.equal(req.user,undefined)}
 }
})

test('recuperació: una renovació concurrent amb una contrasenya antiga no pot reobrir la sessió',async t=>{
 const calls=[]
 t.mock.method(pool,'execute',async(sql,params)=>{
  calls.push({sql,params})
  if(sql.startsWith('SELECT'))return [[{id:'refresh-id',user_id:9,is_active:1,revoked_at:null,expires_at:new Date(Date.now()+60000),auth_version:0,user_auth_version:1}]]
  return [{affectedRows:1}]
 })
 await assert.rejects(()=>refresh('old-refresh-token',{ip:'127.0.0.1',userAgent:'test'}),error=>error.code==='INVALID_REFRESH')
 assert.ok(!calls.some(call=>call.sql.startsWith('INSERT')))
 assert.deepEqual(calls.at(-1).params,[9,0])
 assert.match(calls.at(-1).sql,/AND auth_version=\?/)
})

test('recuperació: un inici de sessió nou i la seva renovació conserven la versió actual de les credencials',async t=>{
 const password='nova-contrasenya',passwordHash=await bcrypt.hash(password,4),inserted=[]
 t.mock.method(pool,'execute',async(sql,params)=>{
  if(sql.startsWith('SELECT u.*'))return [[{id:9,username:'usuari',is_active:1,password_hash:passwordHash,auth_version:3}]]
  if(sql.startsWith('SELECT t.*'))return [[{id:'refresh-id',user_id:9,is_active:1,revoked_at:null,expires_at:new Date(Date.now()+60000),auth_version:3,user_auth_version:3}]]
  if(sql.startsWith('SELECT u.id'))return [[{id:9,is_active:1,role_id:1,auth_version:3}]]
  if(sql.includes('role_permissions'))return [[]]
  if(sql.startsWith('INSERT INTO refresh_tokens'))inserted.push(params)
  return [{affectedRows:1}]
 })
 const meta={ip:'127.0.0.1',userAgent:'test'}
 for(const session of [await login('usuari',password,meta),await refresh('new-refresh-token',meta)])assert.equal(jwt.verify(session.accessToken,env.JWT_ACCESS_SECRET).ver,3)
 assert.equal(inserted.length,2)
 assert.ok(inserted.every(params=>params.at(-1)===3))
})
