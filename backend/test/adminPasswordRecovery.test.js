import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import {resetAdministratorPassword} from '../src/scripts/resetAdminPassword.js'

function fixture(user={id:9,username:'admin',is_active:1,role_name:'Administrador'},{auditFailure=false}={}){
 const calls=[]
 const connection={
  beginTransaction:async()=>calls.push({operation:'begin'}),
  commit:async()=>calls.push({operation:'commit'}),
  rollback:async()=>calls.push({operation:'rollback'}),
  release:()=>calls.push({operation:'release'}),
  execute:async(sql,params)=>{
   calls.push({operation:'execute',sql,params})
   if(sql.startsWith('SELECT'))return [user?[user]:[]]
   if(auditFailure&&sql.startsWith('INSERT INTO audit_logs'))throw new Error('Audit unavailable')
   return [{affectedRows:1}]
  }
 }
 return {calls,db:{getConnection:async()=>connection}}
}

test('recupera només l’administrador indicat, desa un hash vàlid i revoca les seves sessions de renovació',async()=>{
 const {db,calls}=fixture(),password='TemporaryPassword123!'
 assert.deepEqual(await resetAdministratorPassword(db,{username:' admin ',password}),{id:9,username:'admin'})
 const queries=calls.filter(call=>call.operation==='execute')
 assert.deepEqual(queries[0].params,['admin'])
 assert.match(queries[0].sql,/deleted_at IS NULL FOR UPDATE/)
 assert.match(queries[1].sql,/UPDATE users SET password_hash=\?,must_change_password=TRUE WHERE id=\?/)
 assert.equal(queries[1].params[1],9)
 assert.equal(await bcrypt.compare(password,queries[1].params[0]),true)
 assert.deepEqual(queries[2].params,[9])
 assert.match(queries[2].sql,/WHERE user_id=\?/)
 assert.match(queries[3].sql,/INSERT INTO audit_logs/)
 assert.equal(queries[3].params[0],'9')
 assert.ok(!JSON.stringify(queries[3]).includes(password))
 assert.ok(queries.every(query=>!query.sql.includes('sales_import')&&!query.sql.includes('UPDATE roles')))
 assert.deepEqual(calls.slice(-2).map(call=>call.operation),['commit','release'])
})

test('no crea comptes ni eleva permisos si l’usuari no existeix, no és administrador o està inactiu',async()=>{
 for(const user of [null,{id:9,username:'admin',is_active:1,role_name:'Usuari'},{id:9,username:'admin',is_active:0,role_name:'Administrador'}]){
  const {db,calls}=fixture(user)
  await assert.rejects(()=>resetAdministratorPassword(db,{username:'admin',password:'TemporaryPassword123!'}))
  assert.equal(calls.filter(call=>call.operation==='execute').length,1)
  assert.deepEqual(calls.slice(-2).map(call=>call.operation),['rollback','release'])
 }
})

test('reverteix el restabliment si no es pot registrar l’auditoria',async()=>{
 const {db,calls}=fixture(undefined,{auditFailure:true})
 await assert.rejects(()=>resetAdministratorPassword(db,{username:'admin',password:'TemporaryPassword123!'}),/Audit unavailable/)
 assert.equal(calls.some(call=>call.operation==='commit'),false)
 assert.deepEqual(calls.slice(-2).map(call=>call.operation),['rollback','release'])
})

test('valida el compte i la nova contrasenya abans d’accedir a la base de dades',async()=>{
 const db={getConnection:async()=>assert.fail('No ha d’accedir a la base de dades')}
 for(const params of [{username:'',password:'TemporaryPassword123!'},{username:'admin',password:undefined},{username:'admin',password:'short'}])await assert.rejects(()=>resetAdministratorPassword(db,params))
})
