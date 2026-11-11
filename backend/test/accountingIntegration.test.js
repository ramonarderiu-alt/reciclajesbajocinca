import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import {createAccountingRouter} from '../src/routes/accountingRoutes.js'
import {accountingUser,assertAccountingScope,ensureAccountingCompany} from '../src/services/accountingIntegration.js'

const user={id:7,company_id:1,name:'Usuari de prova',username:'prova',permissions:['accounting.view']}

test('consulta de comptabilitat no concedeix escriptura ni administració d’usuaris',()=>{
 const view=accountingUser(user)
 assert.deepEqual(view.company_ids,[1])
 assert.equal(view.role,'user')
 assert.ok(Object.values(view.permissions).every(value=>value===false))
 const manage=accountingUser({...user,permissions:['accounting.view','accounting.manage']})
 assert.equal(manage.permissions.accounting_write,true)
 assert.equal(manage.permissions.data_import,true)
 assert.equal(manage.permissions.exercise_operations,true)
 assert.equal(manage.permissions.companies_manage,false)
 assert.equal(manage.permissions.users_manage,false)
})

test('l’empresa de l’usuari preval sobre headers i identificadors de ruta',()=>{
 for(const value of [undefined,'1',1])assert.doesNotThrow(()=>assertAccountingScope(user,value))
 for(const value of ['2','01','1,2','1/../2','',null])assert.throws(()=>assertAccountingScope(user,value),error=>error.status===403&&error.code==='ACCESS_COMPANY_DENIED')
})

test('la preparació d’empresa bloqueja la fila i conserva els exercicis existents',async()=>{
 const operations=[]
 const connection={
  async beginTransaction(){operations.push('begin')},
  async execute(sql){operations.push(sql);return sql.startsWith('SELECT id FROM accounting_exercises')?[[{id:42}]]:[[]]},
  async commit(){operations.push('commit')},async rollback(){operations.push('rollback')},release(){operations.push('release')}
 }
 await ensureAccountingCompany({getConnection:async()=>connection},{id:1,trade_name:'Reciclajes'})
 assert.ok(operations.some(sql=>sql.includes('FOR UPDATE')))
 assert.ok(!operations.some(sql=>sql.startsWith('INSERT INTO accounting_exercises')))
 assert.deepEqual(operations.slice(-2),['commit','release'])
})

test('una fallada en crear l’exercici reverteix tota la preparació',async()=>{
 const operations=[]
 const connection={
  async beginTransaction(){operations.push('begin')},
  async execute(sql){if(sql.startsWith('INSERT INTO accounting_exercises'))throw new Error('failure');return [[]]},
  async commit(){operations.push('commit')},async rollback(){operations.push('rollback')},release(){operations.push('release')}
 }
 await assert.rejects(ensureAccountingCompany({getConnection:async()=>connection},{id:1,trade_name:'Reciclajes'}),/failure/)
 assert.deepEqual(operations,['begin','rollback','release'])
})

async function fixture(t,{permissions=user.permissions,missingDatabase=false,databaseError}={}){
 const companies=[{id:1,name:'Reciclajes',subaccount_length:8,business_format:'general'},{id:2,name:'Altra empresa',subaccount_length:8,business_format:'general'}]
 const exercises=[{id:10,name:'2026',start_date:'2026-01-01',end_date:'2026-12-31',status:'open',is_default:1},{id:11,name:'2025',start_date:'2025-01-01',end_date:'2025-12-31',status:'closed',is_default:0}]
 const connection={async beginTransaction(){},async commit(){},async rollback(){},release(){},async query(){return [[]]},execute:(sql,values)=>db.execute(sql,values)}
 const db={async getConnection(){if(missingDatabase||databaseError)throw Object.assign(new Error('missing'),{code:databaseError||'ER_BAD_DB_ERROR'});return connection},async execute(sql,values){
  if(sql.includes('AS generated_result'))return [[{generated_result:'0.00'}]]
  if(sql.includes('AS previous_activity'))return [[{previous_activity:0,first_day_patrimonial:0}]]
  if(sql.includes('AS present'))return [[{present:0}]]
  if(sql.includes('FROM companies c'))return [values?companies.filter(company=>company.id===Number(values[0])):companies]
  if(sql.includes('FROM companies WHERE'))return [[companies[0]]]
  if(sql.includes('FROM accounting_exercises')){
   if(sql.includes('DATE_SUB'))return [[]]
   if(sql.includes('end_date=?'))return [exercises.filter(exercise=>exercise.end_date===values[1])]
   if(sql.includes('AND id=?'))return [exercises.filter(exercise=>exercise.id===Number(values[1]))]
   return [exercises]
  }
  return [[]]
 }}
 const router=createAccountingRouter({db,host:{execute:async()=>[[{id:1,trade_name:'Reciclajes'}]]},backups:{start(){},async stop(){},forCompany(){return {}}},recordAudit:async()=>{},
  authenticateUser(req,res,next){if(req.get('authorization')!=='Bearer allowed')return res.status(401).json({error:{code:'AUTH_REQUIRED'}});req.user={...user,permissions};next()}
 })
 const app=express();app.use(cookieParser());app.use('/api/accounting',router)
 const server=app.listen(0,'127.0.0.1')
 await new Promise(resolve=>server.once('listening',resolve))
 t.after(async()=>{await router.stop();await new Promise(resolve=>server.close(resolve))})
 const base=`http://127.0.0.1:${server.address().port}/api/accounting`
 return (path,options={})=>fetch(base+path,{...options,headers:{Authorization:'Bearer allowed',...options.headers}})
}

test('l’API valida sessió i permís abans d’accedir a la base comptable',async t=>{
 const anonymous=await fixture(t)
 assert.equal((await anonymous('/context',{headers:{Authorization:''}})).status,401)
 const noPermission=await fixture(t,{permissions:['dashboard.view']})
 assert.equal((await noPermission('/context')).status,403)
})

test('pont de sessió HttpOnly i ús de la mateixa identitat al mòdul',async t=>{
 const request=await fixture(t)
 const session=await request('/session',{method:'POST'})
 assert.equal(session.status,200)
 const cookie=session.headers.get('set-cookie')
 assert.match(cookie,/rbc_accounting_access=allowed/)
 assert.match(cookie,/HttpOnly/i)
 assert.match(cookie,/SameSite=Strict/i)
 assert.match(cookie,/Path=\/api\/accounting/)
 const state=await request('/access/session',{headers:{Authorization:'',Cookie:cookie.split(';')[0]}})
 assert.equal(state.status,200)
 assert.equal((await state.json()).user.key,'rbc:7')
 assert.equal((await request('/access/login',{method:'POST'})).status,403)
})

test('consulta de context i empreses no revela cap altra empresa',async t=>{
 const request=await fixture(t)
 const list=await request('/companies')
 assert.equal(list.status,200)
 assert.deepEqual((await list.json()).map(company=>company.id),[1])
 const context=await request('/context')
 assert.equal(context.status,200)
 const data=await context.json()
 assert.equal(data.company.id,1)
 assert.equal(data.exercises[0].name,'2026')
 for(const path of ['/context','/companies/2','/companies/2/logo','/invoices/123/pdf','/data-backups/export']){
  const response=await request(path,{headers:{'X-Company-Id':'2'}})
  assert.equal(response.status,403,path)
 }
 assert.equal((await request('/companies/2/logo')).status,403)
})

test('els permisos de consulta rebutgen totes les escriptures i operacions especials',async t=>{
 const request=await fixture(t)
 for(const [path,method] of [['/entries','POST'],['/accounts/1','PATCH'],['/invoices','POST'],['/portfolio/1/settle','POST'],['/bank-import/preview','POST'],['/companies/1','PATCH'],['/exercises/10/clear/preview','GET']]){
  assert.equal((await request(path,{method})).status,403,`${method} ${path}`)
 }
 const manage=await fixture(t,{permissions:['accounting.view','accounting.manage']})
 assert.equal((await manage('/companies',{method:'POST'})).status,403)
 assert.equal((await manage('/master/company-evolution')).status,403)
})

test('una base encara pendent de preparar retorna un error accionable',async t=>{
 const request=await fixture(t,{missingDatabase:true})
 const response=await request('/context')
 assert.equal(response.status,503)
 const body=await response.json()
 assert.equal(body.error.code,'ACCOUNTING_NOT_INITIALIZED')
 assert.match(body.error.message,/db:migrate:accounting/)
})

test('la manca de permisos MySQL informa de la configuració pendent sense exposar credencials',async t=>{
 const request=await fixture(t,{databaseError:'ER_DBACCESS_DENIED_ERROR'})
 const response=await request('/context')
 assert.equal(response.status,503)
 const body=await response.json()
 assert.equal(body.error.code,'ACCOUNTING_DATABASE_ACCESS')
 assert.match(body.error.message,/permisos/)
 assert.ok(!JSON.stringify(body).includes('password'))
})

test('els informes accepten les rutes del frontend antic i les rutes amb el prefix complet',async t=>{
 const request=await fixture(t)
 for(const report of ['balance-sheet','profit-loss','trial-balance','ledger','review'])await t.test(report,async()=>{
  const query='?company_id=1&exercise_id=10&date=2026-12-31&model=abbreviated&digits=0&compare_previous=true&latest=true'
  const legacy=await request('/'+report+query),current=await request('/accounting/'+report+query)
  assert.equal(legacy.status,200)
  assert.equal(current.status,200)
  const legacyBody=await legacy.json(),currentBody=await current.json()
  // Review includes a timestamp generated independently for each request.
  delete legacyBody.generated_at;delete currentBody.generated_at
  assert.deepEqual(legacyBody,currentBody)
  assert.equal(legacyBody.exercise.id,10)
  if(report==='balance-sheet'){
   assert.equal(legacyBody.comparison.available,true)
   assert.equal(legacyBody.comparison.previous.exercise.id,11)
   assert.equal(legacyBody.date,'2026-12-31')
  }
 })
})

test('les rutes compatibles mantenen sessió, permisos i empresa, i només admeten consulta',async t=>{
 const request=await fixture(t),noPermission=await fixture(t,{permissions:['dashboard.view']})
 for(const report of ['balance-sheet','profit-loss','trial-balance','ledger','review']){
  const path='/'+report+'?exercise_id=10'
  assert.equal((await request(path,{headers:{Authorization:''}})).status,401,report)
  assert.equal((await noPermission(path)).status,403,report)
  assert.equal((await request(path,{headers:{'X-Company-Id':'2'}})).status,403,report)
 }
 const wrongCompany=await request('/balance-sheet?company_id=2&exercise_id=10')
 assert.equal(wrongCompany.status,400)
 assert.equal((await wrongCompany.json()).error.code,'INVALID_COMPANY')
 const missing=await request('/balance-sheet?exercise_id=99999')
 assert.equal(missing.status,404)
 assert.equal((await missing.json()).error.code,'EXERCISE_NOT_FOUND')
 assert.equal((await request('/balance-sheet/extra?exercise_id=10')).status,404)
 const manage=await fixture(t,{permissions:['accounting.view','accounting.manage']})
 assert.equal((await manage('/balance-sheet?exercise_id=10',{method:'POST'})).status,404)
})
