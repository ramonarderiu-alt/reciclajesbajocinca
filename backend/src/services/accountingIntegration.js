import {AppError} from '../lib/errors.js'

export const accountingCookieName='rbc_accounting_access'
export const accountingCookieOptions={httpOnly:true,sameSite:'strict',path:'/api/accounting'}
const writablePermissions=['accounting_write','exercise_create','exercise_operations','data_import','exercise_clear','invoice_delete','entries_delete']

export function accountingUser(user){
 const manage=user.permissions.includes('accounting.manage')
 return {id:user.id,key:`rbc:${user.id}`,name:user.name,username:user.username,role:'user',company_ids:[Number(user.company_id)],
  permissions:{...Object.fromEntries(writablePermissions.map(key=>[key,manage])),companies_manage:false,users_manage:false}}
}

export function assertAccountingScope(user,requestedCompanyId){
 if(requestedCompanyId!==undefined&&String(requestedCompanyId)!==String(user.company_id))throw new AppError(403,'ACCESS_COMPANY_DENIED','No teniu accés a aquesta empresa')
}

export async function ensureAccountingCompany(db,company){
 const connection=await db.getConnection()
 try{
  await connection.beginTransaction()
  await connection.execute('INSERT IGNORE INTO companies(id,name) VALUES(?,?)',[company.id,(company.legal_name||company.trade_name).slice(0,160)])
  await connection.execute('SELECT id FROM companies WHERE id=? FOR UPDATE',[company.id])
  const [[existing]]=await connection.execute('SELECT id FROM accounting_exercises WHERE company_id=? LIMIT 1',[company.id])
  if(!existing){
   const year=new Intl.DateTimeFormat('en',{timeZone:'Europe/Madrid',year:'numeric'}).format(new Date())
   await connection.execute("INSERT INTO accounting_exercises(company_id,name,start_date,end_date,status,is_default) VALUES(?,?,?,?,'open',1)",[company.id,year,`${year}-01-01`,`${year}-12-31`])
  }
  await connection.commit()
 }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

export async function ensureAccountingPermissions(db){
 for(const [key,action,description] of [['accounting.view','view','Consultar la comptabilitat i els informes'],['accounting.manage','manage','Gestionar la comptabilitat, els exercicis i les importacions']]){
  await db.execute("INSERT INTO permissions(permission_key,module_key,action_key,description) VALUES(?,'accounting',?,?) ON DUPLICATE KEY UPDATE description=VALUES(description)",[key,action,description])
 }
 await db.query("INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.module_key='accounting' WHERE r.name='Administrador'")
}
