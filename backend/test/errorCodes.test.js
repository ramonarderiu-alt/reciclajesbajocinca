import test from 'node:test'
import assert from 'node:assert/strict'
import {errorCodes} from '../src/lib/errors.js'
import {sendPasswordRecoveryEmail} from '../src/services/mailService.js'

test('registres: conserva els codis SQL i omet consultes, missatges i dades sensibles',()=>{
 const error={code:'ER_NO_SUCH_TABLE',errno:1146,sqlState:'42S02',message:'private-password',sql:"INSERT INTO tokens VALUES('private-token')",sqlMessage:'private-password',parameters:['private-token']}
 const details=errorCodes(error)
 assert.deepEqual(details,{code:'ER_NO_SUCH_TABLE',errno:1146,sqlState:'42S02'})
 assert.ok(!JSON.stringify(details).includes('private-'))
 assert.deepEqual(errorCodes(null),{code:'UNKNOWN'})
 assert.deepEqual(errorCodes({code:'invalid code private-password',sqlState:'private-password'}),{code:'UNKNOWN'})
})

test('registres: un error SMTP conserva EAUTH i 535 sense exposar la credencial ni la resposta completa',async()=>{
 const config={NODE_ENV:'production',APP_PUBLIC_URL:'https://example.test',SMTP_HOST:'smtp.example.test',SMTP_USER:'sender@example.test',SMTP_PASSWORD:'private-password',MAIL_FROM:'sender@example.test',PASSWORD_RECOVERY_TO:'recovery@example.test'}
 const createTransport=()=>({sendMail:async()=>{throw Object.assign(new Error('private-password'),{code:'EAUTH',responseCode:535,response:'private-password',command:'AUTH private-password'})},close(){}})
 await assert.rejects(()=>sendPasswordRecoveryEmail({subject:'Recuperació',text:'private-token'},{config,createTransport}),error=>{
  assert.deepEqual(errorCodes(error),{code:'MAIL_SEND_FAILED',causeCode:'EAUTH',causeResponseCode:535})
  assert.ok(!JSON.stringify(error).includes('private-'))
  assert.ok(!error.message.includes('private-'))
  return true
 })
})
