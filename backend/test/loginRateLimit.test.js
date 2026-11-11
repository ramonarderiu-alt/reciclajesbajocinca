import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {loginLimit} from '../src/routes/authRoutes.js'

test('login rate limiting counts failed attempts and separates clients behind one trusted proxy',async t=>{
 const app=express()
 app.set('trust proxy',1)
 app.use(express.json())
 // Simulate authentication results; no user accounts or database are involved.
 app.post('/login',loginLimit,(req,res)=>res.status(req.body.valid?200:401).json({ok:!!req.body.valid}))
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance))})
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}))
 const url=`http://127.0.0.1:${server.address().port}/login`
 const post=(ip,valid)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':ip},body:JSON.stringify({valid}),signal:AbortSignal.timeout(2000)})

 await t.test('successful logins do not consume the failed-attempt allowance',async()=>{
  for(let attempt=0;attempt<12;attempt++){
   const response=await post('192.0.2.1',true)
   assert.equal(response.status,200);await response.json()
  }
 })
 await t.test('ten failed attempts block that IP with a structured retry time',async()=>{
  for(let attempt=0;attempt<10;attempt++){
   const response=await post('192.0.2.1',false)
   assert.equal(response.status,401);await response.json()
  }
  const blocked=await post('192.0.2.1',true),body=await blocked.json()
  assert.equal(blocked.status,429)
  assert.equal(body.error.code,'LOGIN_RATE_LIMIT')
  assert.ok(body.error.details.retryAfterSeconds>0&&body.error.details.retryAfterSeconds<=900)
  assert.equal(Number(blocked.headers.get('retry-after')),body.error.details.retryAfterSeconds)
  assert.equal(blocked.headers.get('cache-control'),'no-store')
  assert.match(body.error.message,/minuts?\./)
 })
 await t.test('another client can log in through the same proxy',async()=>{
  const other=await post('192.0.2.2',true)
  assert.equal(other.status,200);await other.json()
 })
})
