import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import { pool } from '../config/db.js'
import { AppError } from '../lib/errors.js'
import { audit, userByUsername, userContext } from '../repositories/dataRepository.js'

const tokenHash=value=>crypto.createHash('sha256').update(value).digest('hex')
const access=user=>jwt.sign({sub:String(user.id),type:'access',ver:Number(user.auth_version||0)},env.JWT_ACCESS_SECRET,{expiresIn:env.JWT_ACCESS_TTL,algorithm:'HS256'})
const opaque=()=>crypto.randomBytes(48).toString('base64url')
export const cookieOptions={httpOnly:true,secure:env.COOKIE_SECURE,sameSite:'strict',path:'/api/auth',maxAge:env.REFRESH_TOKEN_DAYS*86400000}

async function issue(user,meta,replacedBy=null){const refresh=opaque(),id=randomUUID(),expires=new Date(Date.now()+env.REFRESH_TOKEN_DAYS*86400000);await pool.execute('INSERT INTO refresh_tokens(id,user_id,token_hash,expires_at,ip_address,user_agent,auth_version) VALUES(?,?,?,?,?,?,?)',[id,user.id,tokenHash(refresh),expires,meta.ip,meta.userAgent,Number(user.auth_version||0)]);if(replacedBy)await pool.execute('UPDATE refresh_tokens SET revoked_at=NOW(),replaced_by=? WHERE id=?',[id,replacedBy]);return {accessToken:access(user),refreshToken:refresh,user:await userContext(user.id)}}
export async function login(username,password,meta){const user=await userByUsername(username);if(!user?.is_active||!await bcrypt.compare(password,user?.password_hash||''))throw new AppError(401,'INVALID_CREDENTIALS','Usuari o contrasenya incorrectes');await pool.execute('UPDATE users SET last_login_at=NOW() WHERE id=?',[user.id]);await audit({userId:user.id,action:'login',entity:'session',recordId:user.id,ip:meta.ip});return issue(user,meta)}
export async function refresh(value,meta){
 if(!value)throw new AppError(401,'INVALID_REFRESH','Sessió caducada')
 const [rows]=await pool.execute(`SELECT t.*,u.is_active,u.deleted_at,u.auth_version user_auth_version FROM refresh_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=?`,[tokenHash(value)])
 const row=rows[0]
 if(!row||row.revoked_at||new Date(row.expires_at)<=new Date()||!row.is_active||row.deleted_at||Number(row.auth_version||0)!==Number(row.user_auth_version||0)){
  // A token from before a password reset must not revoke newer sessions.
  if(row?.user_id)await pool.execute('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=? AND auth_version=?',[row.user_id,Number(row.auth_version||0)])
  throw new AppError(401,'INVALID_REFRESH','Sessió caducada')
 }
 return issue({id:row.user_id,auth_version:row.auth_version},meta,row.id)
}
export async function logout(value,userId,ip){if(value)await pool.execute('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE token_hash=?',[tokenHash(value)]);if(userId)await audit({userId,action:'logout',entity:'session',recordId:userId,ip})}
