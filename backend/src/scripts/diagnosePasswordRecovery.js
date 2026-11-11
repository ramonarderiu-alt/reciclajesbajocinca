// Standalone production diagnostic: upload this file without replacing the running API.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'

const codes=error=>({
 code:typeof error?.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:'UNKNOWN',
 ...(Number.isInteger(error?.errno)?{errno:error.errno}:{}),
 ...(Number.isInteger(error?.responseCode)?{responseCode:error.responseCode}:{})
})

export async function diagnosePasswordRecovery({config,query,verifySmtp}){
 const checks=[]
 const check=async(name,work)=>{
  try{await work();checks.push({check:name,ok:true});return true}
  catch(error){checks.push({check:name,ok:false,...codes(error)});return false}
 }
 const required=['APP_PUBLIC_URL','PASSWORD_RECOVERY_TO','SMTP_HOST','SMTP_USER','SMTP_PASSWORD','MAIL_FROM']
 const missingMailFields=required.filter(key=>!config[key]?.trim())
 let urlReady=false
 try{
  const url=new URL(config.APP_PUBLIC_URL)
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.hostname.endsWith('.localhost')
  urlReady=['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.hostname!=='0.0.0.0'&&(!local||['development','test'].includes(config.NODE_ENV))&&(config.NODE_ENV!=='production'||url.protocol==='https:')
 }catch{}
 checks.push({check:'configuration',ok:missingMailFields.length===0&&urlReady,missingMailFields,resetUrlValid:urlReady})
 if(await check('mysql.connection',()=>query('SELECT 1'))){
  for(const [name,sql] of [
   ['mysql.users','SELECT id,username,name,password_hash,is_active,deleted_at,auth_version FROM users LIMIT 0'],
   ['mysql.refresh_tokens','SELECT id,user_id,auth_version,revoked_at FROM refresh_tokens LIMIT 0'],
   ['mysql.password_reset_tokens','SELECT id,user_id,token_hash,credentials_hash,created_at,expires_at,used_at FROM password_reset_tokens LIMIT 0'],
   ['mysql.audit_logs','SELECT id,user_id,action,entity,record_id,new_values,ip_address FROM audit_logs LIMIT 0']
  ])await check(name,()=>query(sql))
 }
 if(['SMTP_HOST','SMTP_USER','SMTP_PASSWORD','MAIL_FROM'].every(key=>config[key]?.trim()))await check('smtp.authentication',verifySmtp)
 else checks.push({check:'smtp.authentication',ok:false,code:'SMTP_NOT_CONFIGURED'})
 return {ok:checks.every(item=>item.ok),checks}
}

async function main(){
 const dependencies={}
 for(const name of ['dotenv','mysql2/promise','nodemailer']){
  try{dependencies[name]=(await import(name)).default}
  catch(error){console.log(JSON.stringify({ok:false,check:'dependency',package:name,...codes(error)},null,2));process.exitCode=1;return}
 }
 const envFile=process.env.RBC_ENV_FILE?path.resolve(process.env.RBC_ENV_FILE):fileURLToPath(new URL('../../.env',import.meta.url))
 let fileValues
 try{fileValues=dependencies.dotenv.parse(fs.readFileSync(envFile))}
 catch(error){console.log(JSON.stringify({ok:false,check:'envFile',envFile,...codes(error)},null,2));process.exitCode=1;return}
 const config={NODE_ENV:'development',...fileValues,...process.env}
 const overriddenKeys=Object.keys(fileValues).filter(key=>process.env[key]!==undefined&&process.env[key]!==fileValues[key]).sort()
 const db=dependencies['mysql2/promise'].createPool({host:config.DB_HOST||'127.0.0.1',port:Number(config.DB_PORT||3306),user:config.DB_USER||'root',password:config.DB_PASSWORD||'',database:config.DB_NAME||'reciclajes_bajo_cinca',connectTimeout:5000,connectionLimit:1,charset:'utf8mb4',timezone:'Z'})
 try{
  const report=await diagnosePasswordRecovery({config,query:sql=>db.query({sql,timeout:5000}),verifySmtp:async()=>{
   const secure=config.SMTP_SECURE!=='false'
   const transport=dependencies.nodemailer.createTransport({host:config.SMTP_HOST,port:Number(config.SMTP_PORT||465),secure,requireTLS:!secure,auth:{user:config.SMTP_USER,pass:config.SMTP_PASSWORD},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:10000,disableFileAccess:true,disableUrlAccess:true})
   try{await transport.verify()}finally{transport.close()}
  }})
  console.log(JSON.stringify({envFile,overriddenKeys,...report},null,2))
  if(!report.ok)process.exitCode=1
 }finally{await db.end()}
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 main().catch(error=>{console.log(JSON.stringify({ok:false,check:'diagnostic',...codes(error)},null,2));process.exitCode=1})
}
