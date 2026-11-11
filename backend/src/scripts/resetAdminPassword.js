import path from 'node:path'
import {pathToFileURL} from 'node:url'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import {loadEnvFile} from '../config/envFile.js'

export async function resetAdministratorPassword(db,{username,password}){
 if(typeof username!=='string'||!username.trim()||username.trim().length>80)throw new Error('ADMIN_USERNAME no és vàlid.')
 if(typeof password!=='string'||password.length<8||password.length>200)throw new Error('ADMIN_PASSWORD ha de tenir entre 8 i 200 caràcters.')
 const passwordHash=await bcrypt.hash(password,12),connection=await db.getConnection()
 try{
  await connection.beginTransaction()
  const [[user]]=await connection.execute(`SELECT u.id,u.username,u.is_active,r.name role_name FROM users u JOIN roles r ON r.id=u.role_id WHERE LOWER(u.username)=LOWER(?) AND u.deleted_at IS NULL FOR UPDATE`,[username.trim()])
  if(!user)throw new Error('No s’ha trobat aquest usuari. Executa aquesta ordre amb --list per veure els administradors i comprova ADMIN_USERNAME.')
  if(user.role_name!=='Administrador')throw new Error('El compte indicat no té el rol Administrador. No s’ha modificat.')
  if(!user.is_active)throw new Error('El compte està inactiu. Cal revisar-ne la desactivació abans de recuperar-ne la contrasenya.')
  await connection.execute('UPDATE users SET password_hash=?,must_change_password=TRUE WHERE id=?',[passwordHash,user.id])
  await connection.execute('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=?',[user.id])
  await connection.execute("INSERT INTO audit_logs(user_id,action,entity,record_id,new_values) VALUES(NULL,'reset_password','user',?,?)",[String(user.id),JSON.stringify({username:user.username,passwordReset:true,source:'administrator_recovery'})])
  await connection.commit()
  return {id:user.id,username:user.username}
 }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function main(){
 const args=process.argv.slice(2)
 if(args.includes('--help')){console.log('Des de backend: node src/scripts/resetAdminPassword.js [--list]. Llegeix backend/.env o el fitxer indicat a RBC_ENV_FILE; la nova contrasenya és ADMIN_PASSWORD i el compte és ADMIN_USERNAME (admin per defecte).');return}
 if(args.some(argument=>argument!=='--list'))throw new Error('Opció desconeguda. Opcions disponibles: --list, --help. La contrasenya es configura al fitxer .env seleccionat.')
 const source=loadEnvFile()
 if(!source.fileLoaded)throw new Error(`No existeix el fitxer de configuració: ${source.envFile}`)
 const values=process.env,database=values.DB_NAME||'reciclajes_bajo_cinca'
 if(!/^[A-Za-z0-9_]+$/.test(database))throw new Error('DB_NAME no és vàlid.')
 const db=mysql.createPool({host:values.DB_HOST||'127.0.0.1',port:Number(values.DB_PORT||3306),user:values.DB_USER||'root',password:values.DB_PASSWORD||'',database,charset:'utf8mb4',connectionLimit:1})
 try{
  if(args.includes('--list')){
   const [users]=await db.execute("SELECT u.username,u.name,u.is_active FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='Administrador' AND u.deleted_at IS NULL ORDER BY u.username")
   for(const user of users)console.log(`${user.username} — ${user.name} — ${user.is_active?'actiu':'inactiu'}`)
   if(!users.length)console.log('No s’ha trobat cap compte administrador.')
   return
  }
  const result=await resetAdministratorPassword(db,{username:values.ADMIN_USERNAME||'admin',password:values.ADMIN_PASSWORD})
  console.log(`Contrasenya restablerta per a l’usuari ${result.username}. Ja pots entrar a la web amb el valor d’ADMIN_PASSWORD de ${source.envFile}. No cal reiniciar l’API.`)
 }finally{await db.end()}
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 main().catch(()=>{console.error('No s’ha pogut completar la recuperació. Comprova el fitxer backend/.env o RBC_ENV_FILE, el compte administrador i la connexió a la base de dades. Executa amb --list per consultar els comptes o amb --help per veure les instruccions.');process.exitCode=1})
}
