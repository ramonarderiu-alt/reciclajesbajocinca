import {readFile,readdir} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {errorCodes} from '../lib/errors.js'

// Only reads schema metadata and migration names; never returns accounting data.
export async function checkAccounting({query,migrationFiles,tables}){
 const checks=[]
 const check=async(name,work)=>{
  try{const details=await work();checks.push({check:name,ok:true,...details});return true}
  catch(error){checks.push({check:name,ok:false,...errorCodes(error)});return false}
 }
 if(await check('mysql.connection',async()=>{await query('SELECT 1')})){
  await check('accounting.migrations',async()=>{
   const [rows]=await query('SELECT name FROM schema_migrations ORDER BY name')
   const pending=migrationFiles.filter(name=>!rows.some(row=>row.name===`migrate:${name}`))
   return {ok:pending.length===0,applied:rows.length,expected:migrationFiles.length,pending}
  })
  for(const table of tables){
   if(!/^[a-z_]+$/.test(table))throw new Error('Invalid schema identifier')
   await check(`table.${table}`,async()=>{await query(`SELECT 1 FROM \`${table}\` LIMIT 0`)})
  }
  for(const [name,sql] of [
   ['columns.companies','SELECT id,name,subaccount_length,business_format FROM companies LIMIT 0'],
   ['columns.exercises','SELECT id,company_id,name,start_date,end_date,status,is_default FROM accounting_exercises LIMIT 0'],
   ['columns.journal_entries','SELECT id,company_id,exercise_id,number,entry_date,status,entry_type,source_journal_code,source_entry_reference FROM journal_entries LIMIT 0'],
   ['columns.journal_lines','SELECT id,company_id,entry_id,account_id,position,description,debit,credit,source_account_name,source_page,source_line_number FROM journal_lines LIMIT 0']
  ])await check(name,async()=>{await query(sql)})
 }
 return {ok:checks.every(item=>item.ok),checks}
}

async function main(){
 const {env,environmentSource}=await import('../config/env.js')
 const {accountingConfig,accountingDatabaseName}=await import('../config/accounting.js')
 const {accountingDatabase}=await import('../repositories/accountingSqlNamespace.js')
 const mysql=(await import('mysql2/promise')).default
 const directory=new URL('../../../modules/accounting/database/migrations/',import.meta.url)
 const migrationFiles=(await readdir(directory)).filter(name=>name.endsWith('.sql')).sort()
 const {tables}=JSON.parse(await readFile(new URL('../../../modules/accounting/database/objects.json',import.meta.url),'utf8'))
 const db=accountingDatabase(mysql.createPool({...accountingConfig.database,connectionLimit:1}))
 try{
  const report=await checkAccounting({query:sql=>db.query({sql,timeout:5000}),migrationFiles,tables})
  console.log(JSON.stringify({...environmentSource,host:env.DB_HOST,port:env.DB_PORT,database:accountingDatabaseName,...report},null,2))
  if(!report.ok)process.exitCode=1
 }finally{await db.end()}
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 main().catch(error=>{console.log(JSON.stringify({ok:false,check:'diagnostic',...errorCodes(error)},null,2));process.exitCode=1})
}
