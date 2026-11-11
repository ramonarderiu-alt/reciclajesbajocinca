import {createHash,randomBytes} from 'node:crypto'
import bcrypt from 'bcryptjs'
import {env} from '../config/env.js'
import {pool} from '../config/db.js'
import {AppError} from '../lib/errors.js'
import {passwordRecoveryMailStatus,sendPasswordRecoveryEmail} from './mailService.js'

export const recoveryMessage='Si el compte existeix i està actiu, es tramitarà la recuperació al correu de recuperació de l’empresa. Contacta amb la persona que el gestiona.'
const hash=value=>createHash('sha256').update(value).digest('hex')
const invalidLink=()=>new AppError(422,'INVALID_RESET_TOKEN','L’enllaç de recuperació no és vàlid o ha caducat. Demana’n un de nou des de l’inici de sessió.')

export function assertPasswordRecoveryConfigured(config=env){
 if(!passwordRecoveryMailStatus(config).ready)throw new AppError(422,'RECOVERY_NOT_CONFIGURED','La recuperació de contrasenyes encara no està activada. Contacta amb l’administrador.')
}

export async function requestPasswordRecovery(username,{ip}={}, {config=env,db=pool,sendEmail=sendPasswordRecoveryEmail}={}){
 assertPasswordRecoveryConfigured(config)
 const connection=await db.getConnection()
 let user,token
 try{
  await connection.beginTransaction()
  const [[found]]=await connection.execute('SELECT id,username,name,password_hash FROM users WHERE LOWER(username)=LOWER(?) AND is_active=TRUE AND deleted_at IS NULL FOR UPDATE',[username])
  if(found){
   const [[recent]]=await connection.execute('SELECT id FROM password_reset_tokens WHERE user_id=? AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE) LIMIT 1',[found.id])
   if(!recent){
    user=found;token=randomBytes(32).toString('base64url')
    await connection.execute('DELETE FROM password_reset_tokens WHERE user_id=? AND expires_at<UTC_TIMESTAMP(3)',[user.id])
    await connection.execute('INSERT INTO password_reset_tokens(user_id,token_hash,credentials_hash,expires_at,created_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE),UTC_TIMESTAMP(3))',[user.id,hash(token),hash(user.password_hash)])
   }
  }
  await connection.commit()
 }catch(error){await connection.rollback();throw error}finally{connection.release()}
 if(!token)return
 // Put the secret in the fragment so that proxies and access logs never receive it.
 const link=new URL('reset-password',`${config.APP_PUBLIC_URL.replace(/\/+$/,'')}/`)
 link.search='';link.hash=new URLSearchParams({token}).toString()
 const message={subject:'Recuperació de contrasenya — Reciclajes Bajo Cinca',text:[
  'S’ha demanat recuperar la contrasenya del compte següent:',
  `Usuari: ${user.username}`,`Nom: ${user.name}`,'',
  'Verifica la petició amb la persona titular del compte abans de restablir-ne l’accés.',
  'Obre aquest enllaç per escollir una nova contrasenya:',link.href,'',
  'L’enllaç caduca al cap de 30 minuts i només es pot utilitzar una vegada.',
  'Si no reconeixes aquesta petició, ignora aquest correu. La contrasenya actual continua funcionant.'
 ].join('\n')}
 try{await sendEmail(message,{config})}
 catch(error){
  // An unsuccessful delivery must not leave a usable link behind.
  try{await db.execute('DELETE FROM password_reset_tokens WHERE token_hash=?',[hash(token)])}catch{console.error('No s’ha pogut invalidar una recuperació no enviada.')}
  throw error
 }
 try{
  await db.execute("INSERT INTO audit_logs(user_id,action,entity,record_id,new_values,ip_address) VALUES(NULL,'request_password_reset','user',?,?,?)",[String(user.id),JSON.stringify({recipient:config.PASSWORD_RECOVERY_TO}),ip||null])
 }catch{console.error('No s’ha pogut auditar una sol·licitud de recuperació enviada.')}
}

export async function resetPassword({token,password},{ip}={}, {db=pool}={}){
 const connection=await db.getConnection()
 try{
  await connection.beginTransaction()
  const [[reference]]=await connection.execute('SELECT user_id FROM password_reset_tokens WHERE token_hash=?',[hash(token)])
  if(!reference)throw invalidLink()
  // Always lock the user before the tokens, as in the request flow.
  const [[user]]=await connection.execute('SELECT id,password_hash,is_active,deleted_at FROM users WHERE id=? FOR UPDATE',[reference.user_id])
  const [[reset]]=await connection.execute('SELECT id,credentials_hash FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE',[hash(token)])
  if(!user?.is_active||user.deleted_at||!reset||reset.credentials_hash!==hash(user.password_hash))throw invalidLink()
  await connection.execute('UPDATE users SET password_hash=?,must_change_password=FALSE,auth_version=auth_version+1 WHERE id=?',[await bcrypt.hash(password,12),user.id])
  await connection.execute('UPDATE password_reset_tokens SET used_at=UTC_TIMESTAMP(3) WHERE user_id=? AND used_at IS NULL',[user.id])
  await connection.execute('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=?',[user.id])
  await connection.execute("INSERT INTO audit_logs(user_id,action,entity,record_id,new_values,ip_address) VALUES(NULL,'reset_password','user',?,?,?)",[String(user.id),JSON.stringify({source:'email_recovery'}),ip||null])
  await connection.commit()
 }catch(error){await connection.rollback();throw error}finally{connection.release()}
}
