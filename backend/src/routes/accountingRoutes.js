import {Router,json,raw} from 'express'
import {authenticate,requirePermission} from '../middleware/auth.js'
import {env} from '../config/env.js'
import {accountingConfig} from '../config/accounting.js'
import {pool as hostDb} from '../config/db.js'
import {audit} from '../repositories/dataRepository.js'
import {errorCodes,AppError} from '../lib/errors.js'
import {accountingCookieName,accountingCookieOptions,accountingUser,assertAccountingScope,ensureAccountingCompany} from '../services/accountingIntegration.js'
import {pool as accountingDb} from '../../../modules/accounting/backend/src/db/pool.js'
import {createContextService} from '../../../modules/accounting/backend/src/services/context.js'
import {createAccountingService} from '../../../modules/accounting/backend/src/services/accounting.js'
import {companyScope} from '../../../modules/accounting/backend/src/middleware/company-scope.js'
import {requiredPermission} from '../../../modules/accounting/backend/src/middleware/access.js'
import {apiRouter} from '../../../modules/accounting/backend/src/routes/api.js'
import {reportController} from '../../../modules/accounting/backend/src/controllers/reports.js'
import {errorHandler} from '../../../modules/accounting/backend/src/middleware/errors.js'
import {createAutomaticBackupManager} from '../../../modules/accounting/backend/src/services/automatic-backups.js'

export function createAccountingRouter({db=accountingDb,host=hostDb,authenticateUser=authenticate,recordAudit=audit,backups=createAutomaticBackupManager(db,{directory:accountingConfig.backupDirectory})}={}){
 const router=Router(),readyCompanies=new Map()
 let backupsStarted=false
 router.use((req,res,next)=>{
  res.set('Cache-Control','no-store')
  if(!req.get('authorization')&&req.cookies?.[accountingCookieName])req.headers.authorization=`Bearer ${req.cookies[accountingCookieName]}`
  next()
 },authenticateUser,requirePermission('accounting.view'))
 router.post('/session',(req,res)=>{
  res.cookie(accountingCookieName,req.get('authorization').slice(7),{...accountingCookieOptions,secure:env.COOKIE_SECURE})
  res.json({ready:true})
 })
 router.use(async(req,res,next)=>{
  const hostUser=req.user
  req.hostUser=hostUser
  assertAccountingScope(hostUser,req.get('X-Company-Id'))
  const companyMatch=req.path.match(/^\/companies\/([^/]+)/i)
  if(companyMatch)assertAccountingScope(hostUser,companyMatch[1])
  if(req.path.toLowerCase()==='/companies'&&req.method==='POST')throw new AppError(403,'PERMISSION_DENIED','Les empreses es gestionen des de la configuració general')
  const permission=requiredPermission(req.method,req.path)
  req.user=accountingUser(hostUser)
  if(permission&&!req.user.permissions[permission])throw new AppError(403,'PERMISSION_DENIED','No teniu permisos per fer aquesta acció')
  if(!readyCompanies.has(hostUser.company_id)){
   const preparation=(async()=>{
    const [[company]]=await host.execute('SELECT id,trade_name,legal_name FROM companies WHERE id=?',[hostUser.company_id])
    if(!company)throw new AppError(404,'COMPANY_NOT_FOUND','Empresa no trobada')
    await ensureAccountingCompany(db,company)
   })()
   readyCompanies.set(hostUser.company_id,preparation)
   preparation.catch(()=>readyCompanies.delete(hostUser.company_id))
  }
  try{await readyCompanies.get(hostUser.company_id)}catch(error){
   if(['ER_BAD_DB_ERROR','ER_NO_SUCH_TABLE'].includes(error.code))throw new AppError(503,'ACCOUNTING_NOT_INITIALIZED','Cal executar npm run db:migrate:accounting per preparar la comptabilitat')
   if(error.code==='ER_DBACCESS_DENIED_ERROR')throw new AppError(503,'ACCOUNTING_DATABASE_ACCESS','L’usuari MySQL no té permisos sobre la base de Comptabilitat. Cal donar-hi accés i executar npm run db:migrate:accounting.')
   throw error
  }
  req.headers['x-company-id']=String(hostUser.company_id)
  if(!backupsStarted){backups.start();backupsStarted=true}
  if(!['GET','HEAD','OPTIONS'].includes(req.method))res.on('finish',()=>{
   if(res.statusCode>=400)return
   recordAudit({userId:hostUser.id,action:'accounting.change',entity:'accounting',recordId:hostUser.company_id,newValues:{method:req.method,path:req.path},ip:req.ip}).catch(error=>console.error('Auditoria de comptabilitat',errorCodes(error)))
  })
  next()
 })
 router.use('/tax/vat',json({limit:'2mb'}))
 router.use('/companies',json({limit:'3mb'}))
 router.post('/documentation',json({limit:'15mb'}))
 router.post('/data-backups/preview',raw({type:'application/octet-stream',limit:'100mb'}))
 router.use(json({limit:'32kb'}))
 router.get('/access/session',(req,res)=>res.json({user:req.user,users:[],master_setup_required:false}))
 router.use('/access',(req,res)=>res.status(403).json({error:{code:'PERMISSION_DENIED'}}))
 router.use(companyScope(db,1,{automaticBackups:backups}))
 // Older compiled clients omit the module's /accounting report segment.
 // Keep their URLs on the same authenticated, company-scoped controllers.
 router.get('/balance-sheet',reportController.balanceSheet)
 router.get('/profit-loss',reportController.profitLoss)
 router.get('/trial-balance',reportController.trialBalance)
 router.get('/ledger',reportController.ledger)
 router.get('/review',async(req,res)=>res.json(await req.accountingReview.review(req.query)))
 router.use(apiRouter(createContextService(db,1),createAccountingService(db,1)))
 router.use((req,res)=>res.status(404).json({error:{code:'NOT_FOUND'}}))
 router.use((error,req,res,next)=>{
  if(error instanceof AppError)return res.status(error.status).json({error:{code:error.code,message:error.message}})
  errorHandler(error,req,res,next)
 })
 router.start=async()=>{
  await db.execute('SELECT 1 FROM backup_schedules LIMIT 0')
  if(!backupsStarted){backups.start();backupsStarted=true}
 }
 router.stop=async()=>{await backups.stop()}
 return router
}
const router=createAccountingRouter()
export async function startAccounting(){
 try{await router.start()}catch(error){console.warn('Còpies automàtiques de comptabilitat pendents de configurar.',errorCodes(error))}
}
export async function stopAccounting(){await router.stop();await accountingDb.end()}
export default router
