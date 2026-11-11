import test from 'node:test'
import assert from 'node:assert/strict'
import {checkAccounting} from '../src/scripts/checkAccounting.js'

const migrationFiles=['001_schema.sql','002_journal.sql']
const tables=['companies','accounting_exercises','journal_entries','journal_lines']
const applied=migrationFiles.map(name=>({name:`migrate:${name}`}))

test('diagnòstic comptable: comprova l’esquema sense escriure ni llegir dades comptables',async()=>{
 const queries=[]
 const report=await checkAccounting({migrationFiles,tables,query:async sql=>{
  queries.push(sql)
  return [sql.includes('schema_migrations')?applied:[]]
 }})
 assert.equal(report.ok,true)
 assert.ok(queries.every(sql=>sql==='SELECT 1'||sql==='SELECT name FROM schema_migrations ORDER BY name'||/^SELECT .* LIMIT 0$/.test(sql)))
 assert.deepEqual(report.checks.find(item=>item.check==='accounting.migrations').pending,[])
})

test('diagnòstic comptable: identifica migracions pendents i columnes absents sense mostrar SQL ni secrets',async()=>{
 const report=await checkAccounting({migrationFiles,tables,query:async sql=>{
  if(sql.includes('source_line_number'))throw Object.assign(new Error('private-password'),{code:'ER_BAD_FIELD_ERROR',errno:1054,sqlState:'42S22',sql:'private-token'})
  return [sql.includes('schema_migrations')?applied.slice(0,1):[]]
 }})
 assert.equal(report.ok,false)
 assert.deepEqual(report.checks.find(item=>item.check==='accounting.migrations').pending,['002_journal.sql'])
 assert.deepEqual(report.checks.find(item=>item.check==='columns.journal_lines'),{check:'columns.journal_lines',ok:false,code:'ER_BAD_FIELD_ERROR',errno:1054,sqlState:'42S22'})
 assert.ok(!JSON.stringify(report).includes('private-'))
})

test('diagnòstic comptable: una connexió refusada atura les consultes d’esquema',async()=>{
 let calls=0
 const report=await checkAccounting({migrationFiles,tables,query:async()=>{
  calls++;throw Object.assign(new Error('private-password'),{code:'ECONNREFUSED'})
 }})
 assert.equal(calls,1)
 assert.deepEqual(report,{ok:false,checks:[{check:'mysql.connection',ok:false,code:'ECONNREFUSED'}]})
})

test('diagnòstic comptable: detecta un registre de migracions absent i continua comprovant les taules',async()=>{
 const report=await checkAccounting({migrationFiles,tables,query:async sql=>{
  if(sql.includes('schema_migrations'))throw Object.assign(new Error('missing'),{code:'ER_NO_SUCH_TABLE'})
  return [[]]
 }})
 assert.equal(report.ok,false)
 assert.equal(report.checks.find(item=>item.check==='accounting.migrations').code,'ER_NO_SUCH_TABLE')
 assert.equal(report.checks.find(item=>item.check==='columns.journal_lines').ok,true)
})
