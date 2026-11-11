import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { asyncHandler } from '../lib/asyncHandler.js'
import {errorCodes} from '../lib/errors.js'
import { authenticate } from '../middleware/auth.js'
import {accountingCookieName,accountingCookieOptions} from '../services/accountingIntegration.js'
import { loginSchema } from '../validations/schemas.js'
import * as auth from '../services/authService.js'
import {forgotPasswordSchema,resetPasswordSchema} from '../validations/passwordRecoveryValidation.js'
import {assertPasswordRecoveryConfigured,requestPasswordRecovery,resetPassword,recoveryMessage} from '../services/passwordRecoveryService.js'
const router=Router(),meta=req=>({ip:req.ip,userAgent:req.get('user-agent')?.slice(0,500)})
export const loginLimit=rateLimit({
 windowMs:15*60000,limit:10,skipSuccessfulRequests:true,standardHeaders:'draft-8',legacyHeaders:false,
 handler(req,res){
  const retryAfterSeconds=Math.max(1,Number(res.getHeader('Retry-After'))||900),minutes=Math.ceil(retryAfterSeconds/60)
  res.set('Cache-Control','no-store').status(429).json({error:{code:'LOGIN_RATE_LIMIT',message:`S’han fet massa intents fallits d’accés. Torna-ho a provar d’aquí a ${minutes} ${minutes===1?'minut':'minuts'}.`,details:{retryAfterSeconds}}})
 }
})
const recoveryLimit=rateLimit({windowMs:15*60000,limit:5,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RECOVERY_RATE_LIMIT',message:'S’han fet massa peticions. Torna-ho a provar d’aquí a 15 minuts.'}}})
const mailboxLimit=rateLimit({windowMs:60*60000,limit:100,keyGenerator:()=>'password-recovery',standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RECOVERY_RATE_LIMIT',message:'El servei de recuperació està ocupat. Torna-ho a provar més tard.'}}})
router.post('/forgot-password',recoveryLimit,mailboxLimit,asyncHandler(async(req,res)=>{
 const body=forgotPasswordSchema.parse(req.body)
 assertPasswordRecoveryConfigured()
 // Finish the response before looking up the account or contacting SMTP.
 // Existing and unknown usernames have the same response and timing.
 const requestMeta=meta(req)
 res.set('Cache-Control','no-store').status(202).json({message:recoveryMessage})
 setImmediate(()=>requestPasswordRecovery(body.username,requestMeta).catch(error=>console.error('No s’ha pogut completar una sol·licitud de recuperació de contrasenya.',errorCodes(error))))
}))
router.post('/reset-password',rateLimit({windowMs:15*60000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RESET_RATE_LIMIT',message:'S’han fet massa intents. Torna-ho a provar d’aquí a 15 minuts.'}}}),asyncHandler(async(req,res)=>{
 await resetPassword(resetPasswordSchema.parse(req.body),meta(req))
 res.set('Cache-Control','no-store').clearCookie('refresh_token',{...auth.cookieOptions,maxAge:undefined}).status(204).end()
}))
router.post('/login',loginLimit,asyncHandler(async(req,res)=>{const body=loginSchema.parse(req.body),result=await auth.login(body.username,body.password,meta(req));res.cookie('refresh_token',result.refreshToken,auth.cookieOptions).json({accessToken:result.accessToken,user:result.user})}))
router.post('/refresh',asyncHandler(async(req,res)=>{const result=await auth.refresh(req.cookies.refresh_token,meta(req));res.cookie('refresh_token',result.refreshToken,auth.cookieOptions).json({accessToken:result.accessToken,user:result.user})}))
router.post('/logout',asyncHandler(async(req,res)=>{let id;try{id=(await import('jsonwebtoken')).default.verify(req.get('authorization')?.slice(7)||'',(await import('../config/env.js')).env.JWT_ACCESS_SECRET).sub}catch{}await auth.logout(req.cookies.refresh_token,id,req.ip);res.clearCookie(accountingCookieName,{...accountingCookieOptions,secure:auth.cookieOptions.secure});res.clearCookie('refresh_token',{...auth.cookieOptions,maxAge:undefined}).status(204).end()}))
router.get('/me',authenticate,(req,res)=>res.json(req.user))
export default router
