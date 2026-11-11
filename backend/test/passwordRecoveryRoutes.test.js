import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import nodemailer from 'nodemailer'
import {env} from '../src/config/env.js'
import {pool} from '../src/config/db.js'
import authRoutes from '../src/routes/authRoutes.js'
import {errorHandler} from '../src/middleware/errorHandler.js'

test('rutes públiques de recuperació: resposta genèrica, correu central, validació i límits',async t=>{
 const config={NODE_ENV:'production',APP_PUBLIC_URL:'https://programa.example.test',SMTP_HOST:'smtp.example.test',SMTP_USER:'sender@example.test',SMTP_PASSWORD:'test-only',MAIL_FROM:'sender@example.test',PASSWORD_RECOVERY_TO:'recovery@example.test'}
 const previous=Object.fromEntries(Object.keys(config).map(key=>[key,env[key]]))
 Object.assign(env,config)
 t.after(()=>Object.assign(env,previous))
 const sent=[],audits=[]
 let finishDelivery
 const delivery=new Promise(resolve=>{finishDelivery=resolve})
 t.after(()=>finishDelivery())
 t.mock.method(nodemailer,'createTransport',()=>({sendMail:async message=>{sent.push(message);await delivery;return {accepted:[config.PASSWORD_RECOVERY_TO]}},close(){}}))
 t.mock.method(pool,'execute',async(sql,params)=>{audits.push({sql,params});return [{affectedRows:1}]})
 t.mock.method(pool,'getConnection',async()=>({
  beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},
  execute:async(sql,params)=>{
   if(sql.startsWith('SELECT id,username'))return [params[0]==='existent'?[{id:9,username:'existent',name:'Usuari',password_hash:'stored-hash'}]:[]]
   if(sql.startsWith('SELECT'))return [[]]
   return [{affectedRows:1}]
  }
 }))
 const app=express();app.use(express.json());app.use('/api/auth',authRoutes);app.use(errorHandler)
 const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server))})
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}))
 const base=`http://127.0.0.1:${server.address().port}/api/auth`
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(2000)})
 const existing=await post('/forgot-password',{username:'existent'})
 // SMTP is deliberately blocked: the HTTP response must already be complete.
 assert.equal(existing.status,202)
 const known=await existing.json()
 const unknown=await post('/forgot-password',{username:'inexistent'})
 assert.equal(unknown.status,202);assert.deepEqual(await unknown.json(),known)
 assert.equal(existing.headers.get('cache-control'),'no-store')
 assert.ok(!JSON.stringify(known).includes(config.PASSWORD_RECOVERY_TO))
 finishDelivery()
 for(let tries=0;!audits.length&&tries<100;tries++)await new Promise(resolve=>setTimeout(resolve,10))
 assert.equal(sent.length,1);assert.equal(sent[0].to,config.PASSWORD_RECOVERY_TO)
 assert.ok(audits.some(call=>call.sql.includes('INSERT INTO audit_logs')))

 const injection=await post('/forgot-password',{username:'existent',to:'attacker@example.test'})
 assert.equal(injection.status,422)
 assert.equal((await injection.json()).error.code,'VALIDATION_ERROR')
 const malformed=await post('/reset-password',{token:'short',password:'password123',confirmPassword:'password123'})
 assert.equal(malformed.status,422);assert.equal((await malformed.json()).error.code,'VALIDATION_ERROR')
 const missing=await post('/reset-password',{token:'a'.repeat(43),password:'password123',confirmPassword:'password123'})
 assert.equal(missing.status,422);assert.equal((await missing.json()).error.code,'INVALID_RESET_TOKEN')

 env.PASSWORD_RECOVERY_TO=''
 const disabled=await post('/forgot-password',{username:'existent'})
 assert.equal(disabled.status,422);assert.equal((await disabled.json()).error.code,'RECOVERY_NOT_CONFIGURED')
 env.PASSWORD_RECOVERY_TO=config.PASSWORD_RECOVERY_TO
 assert.equal((await post('/forgot-password',{username:'inexistent'})).status,202)
 const limited=await post('/forgot-password',{username:'inexistent'})
 assert.equal(limited.status,429);assert.equal((await limited.json()).error.code,'RECOVERY_RATE_LIMIT')
 assert.equal(sent.length,1)
})
