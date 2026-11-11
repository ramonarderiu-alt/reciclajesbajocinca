import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import express from 'express'
import {pool} from '../src/config/db.js'
import adminRoutes from '../src/routes/adminRoutes.js'
import {errorHandler} from '../src/middleware/errorHandler.js'

const body={name:'Usuari de prova',username:'prova',email:'prova@example.test',role_id:'3',is_active:true}

async function fixture(t,permissions=['users.manage']){
 const calls=[],user={id:9,name:body.name,username:body.username,email:body.email,role_id:1,is_active:1,password_hash:await bcrypt.hash('contrasenya-original',4)}
 t.mock.method(pool,'execute',async(sql,params)=>{
  calls.push({sql,params})
  if(sql.startsWith('SELECT id,name,username,email,role_id,is_active')){
   const {password_hash,...profile}=user
   return [[profile]]
  }
  if(sql.startsWith('UPDATE users SET name=')){
   user.role_id=params[3]
   if(sql.includes('password_hash=?'))user.password_hash=params[5]
   return [{affectedRows:1}]
  }
  if(sql.startsWith('INSERT INTO audit_logs'))return [{affectedRows:1}]
  throw Error('Unexpected query in user editing test')
 })
 const app=express()
 app.use(express.json())
 app.use((req,res,next)=>{req.user={id:99,permissions,role_name:'Administrador'};next()})
 app.use('/api',adminRoutes);app.use(errorHandler)
 const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server))})
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}))
 const request=(method,path,data)=>fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)})
 return {user,calls,request}
}

test('canvi de rol: accepta la contrasenya buida de l’antic formulari i conserva el hash',async t=>{
 const {user,calls,request}=await fixture(t),original=user.password_hash
 const response=await request('PUT','/users/9',{...body,password:''})
 assert.equal(response.status,204)
 assert.equal(user.role_id,3)
 assert.equal(user.password_hash,original)
 const update=calls.find(call=>call.sql.startsWith('UPDATE'))
 assert.ok(!update.sql.includes('password_hash'))
 assert.ok(!update.sql.includes('must_change_password'))
 const audit=calls.find(call=>call.sql.startsWith('INSERT INTO audit_logs'))
 assert.equal(JSON.parse(audit.params[5]).role_id,3)
 assert.ok(!JSON.stringify(audit).includes(original))
})

test('edició: conserva la contrasenya quan s’omet i la canvia quan s’introdueix expressament',async t=>{
 const {user,calls,request}=await fixture(t),original=user.password_hash
 assert.equal((await request('PUT','/users/9',body)).status,204)
 assert.equal(user.password_hash,original)
 assert.equal((await request('PUT','/users/9',{...body,password:'contrasenya-nova'})).status,204)
 assert.equal(await bcrypt.compare('contrasenya-nova',user.password_hash),true)
 assert.ok(calls.some(call=>call.sql.includes('password_hash=?,must_change_password=TRUE')))
 assert.ok(calls.filter(call=>call.sql.startsWith('INSERT INTO audit_logs')).every(call=>!JSON.stringify(call).includes('contrasenya-nova')))
})

test('creació: continua exigint una contrasenya encara que el formulari l’enviï buida',async t=>{
 const {calls,request}=await fixture(t)
 const response=await request('POST','/users',{...body,password:''})
 assert.equal(response.status,422)
 assert.equal((await response.json()).error.code,'PASSWORD_REQUIRED')
 assert.equal(calls.length,0)
})

test('canvi de rol: conserva la validació de correu, rol i contrasenya',async t=>{
 const {calls,request}=await fixture(t)
 for(const invalid of [{email:'invalid'},{role_id:0},{password:null},{password:'a'.repeat(201)}]){
  const response=await request('PUT','/users/9',{...body,...invalid})
  assert.equal(response.status,422)
  assert.equal((await response.json()).error.code,'VALIDATION_ERROR')
 }
 assert.equal(calls.length,0)
})

test('canvi de rol: rebutja qui no té permís de gestió sense modificar el compte',async t=>{
 const {calls,request}=await fixture(t,['users.view'])
 const response=await request('PUT','/users/9',{...body,password:''})
 assert.equal(response.status,403)
 assert.equal((await response.json()).error.code,'FORBIDDEN')
 assert.equal(calls.length,0)
})
