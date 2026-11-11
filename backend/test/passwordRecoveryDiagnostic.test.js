import test from 'node:test'
import assert from 'node:assert/strict'
import {diagnosePasswordRecovery} from '../src/scripts/diagnosePasswordRecovery.js'

const config={NODE_ENV:'production',APP_PUBLIC_URL:'https://app.example.test',PASSWORD_RECOVERY_TO:'recovery@example.test',SMTP_HOST:'smtp.example.test',SMTP_USER:'sender@example.test',SMTP_PASSWORD:'private-password',MAIL_FROM:'sender@example.test'}

test('diagnòstic: només comprova l’esquema amb consultes sense files i verifica SMTP',async()=>{
 const queries=[];let verified=false
 const result=await diagnosePasswordRecovery({config,query:async sql=>{queries.push(sql)},verifySmtp:async()=>{verified=true}})
 assert.equal(result.ok,true);assert.equal(verified,true)
 assert.equal(queries.length,5)
 assert.ok(queries.every(sql=>sql==='SELECT 1'||/^SELECT .* LIMIT 0$/.test(sql)))
 assert.ok(!JSON.stringify(result).includes(config.SMTP_PASSWORD))
})

test('diagnòstic: identifica la taula absent i l’autenticació SMTP sense filtrar missatges sensibles',async()=>{
 const result=await diagnosePasswordRecovery({config,query:async sql=>{
  if(sql.includes('FROM password_reset_tokens'))throw Object.assign(new Error('private-token'),{code:'ER_NO_SUCH_TABLE',errno:1146,sql:'private-token'})
 },verifySmtp:async()=>{throw Object.assign(new Error('private-password'),{code:'EAUTH',responseCode:535,response:'private-password'})}})
 assert.equal(result.ok,false)
 assert.deepEqual(result.checks.find(item=>item.check==='mysql.password_reset_tokens'),{check:'mysql.password_reset_tokens',ok:false,code:'ER_NO_SUCH_TABLE',errno:1146})
 assert.deepEqual(result.checks.find(item=>item.check==='smtp.authentication'),{check:'smtp.authentication',ok:false,code:'EAUTH',responseCode:535})
 assert.ok(!JSON.stringify(result).includes('private-'))
})

test('diagnòstic: rebutja localhost en producció i omet autenticació quan falta la credencial',async()=>{
 const result=await diagnosePasswordRecovery({config:{...config,APP_PUBLIC_URL:'http://localhost:5174',SMTP_PASSWORD:''},query:async()=>{},verifySmtp:async()=>assert.fail('No hi ha credencial SMTP')})
 assert.equal(result.ok,false)
 assert.deepEqual(result.checks[0],{check:'configuration',ok:false,missingMailFields:['SMTP_PASSWORD'],resetUrlValid:false})
 assert.equal(result.checks.at(-1).code,'SMTP_NOT_CONFIGURED')
})
