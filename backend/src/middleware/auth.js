import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'
import { userContext } from '../repositories/dataRepository.js'

export async function authenticate(req,res,next){try{const header=req.get('authorization');if(!header?.startsWith('Bearer '))throw new AppError(401,'AUTH_REQUIRED','Cal iniciar sessió');const payload=jwt.verify(header.slice(7),env.JWT_ACCESS_SECRET,{algorithms:['HS256']});const user=await userContext(payload.sub);if(!user?.is_active)throw new AppError(401,'ACCOUNT_INACTIVE','Compte inactiu');req.user=user;next()}catch(error){if(error instanceof AppError)return next(error);next(new AppError(401,'INVALID_TOKEN','Sessió no vàlida'))}}
export const requirePermission=permission=>(req,res,next)=>req.user?.permissions.includes(permission)?next():next(new AppError(403,'FORBIDDEN','No teniu permisos per fer aquesta acció'))
