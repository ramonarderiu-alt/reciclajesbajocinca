import nodemailer from 'nodemailer'
import {env} from '../config/env.js'
import {AppError,errorCodes} from '../lib/errors.js'

function configuredMailStatus(config,recipient,{allowLocal=false}={}){
 let publicUrlReady=false
 try{
  const url=new URL(config.APP_PUBLIC_URL)
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.hostname.endsWith('.localhost')
  publicUrlReady=['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.hostname!=='0.0.0.0'&&(!local||allowLocal)
 }catch{}
 const ready=Boolean(publicUrlReady&&config.SMTP_HOST&&config.SMTP_USER&&config.SMTP_PASSWORD&&config.MAIL_FROM&&recipient)
 return {ready,from:config.MAIL_FROM||'',recipient:recipient||'',publicUrlReady,message:ready?'':!publicUrlReady?'Cal configurar l’adreça pública del programa per incloure-la al correu.':'L’enviament de correus encara no està activat. Cal completar la configuració del compte emissor al servidor.'}
}

export function passwordRecoveryMailStatus(config=env){
 const allowLocal=['development','test'].includes(config.NODE_ENV)
 const status=configuredMailStatus(config,config.PASSWORD_RECOVERY_TO||'',{allowLocal})
 if(config.NODE_ENV==='production'&&!/^https:\/\//i.test(config.APP_PUBLIC_URL||''))return {...status,ready:false,message:'Cal configurar una adreça pública HTTPS per recuperar contrasenyes.'}
 return status
}

async function sendConfiguredEmail(message,status,{config=env,createTransport=nodemailer.createTransport}={}){
 if(!status.ready)throw new AppError(422,'MAIL_NOT_CONFIGURED',status.message)
 const transport=createTransport({host:config.SMTP_HOST,port:config.SMTP_PORT,secure:config.SMTP_SECURE,requireTLS:!config.SMTP_SECURE,
  auth:{user:config.SMTP_USER,pass:config.SMTP_PASSWORD},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true})
 try{
  const result=await transport.sendMail({from:config.MAIL_FROM,to:status.recipient,subject:message.subject,text:message.text})
  if(!result.accepted?.some(address=>String(address).toLowerCase()===status.recipient.toLowerCase()))throw new Error('Recipient not accepted')
  return {messageId:result.messageId||null}
 }catch(error){
  const failure=new AppError(422,'MAIL_SEND_FAILED','No s’ha pogut confirmar l’enviament del correu. Revisa el compte emissor i els correus enviats abans de tornar-ho a intentar.')
  failure.cause=errorCodes(error)
  throw failure
 }finally{transport.close?.()}
}

export function sendPasswordRecoveryEmail(message,options={}){return sendConfiguredEmail(message,passwordRecoveryMailStatus(options.config||env),options)}
