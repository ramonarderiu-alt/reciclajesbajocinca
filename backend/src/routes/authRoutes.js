import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { asyncHandler } from '../lib/asyncHandler.js'
import { authenticate } from '../middleware/auth.js'
import { loginSchema } from '../validations/schemas.js'
import * as auth from '../services/authService.js'
const router=Router(),meta=req=>({ip:req.ip,userAgent:req.get('user-agent')?.slice(0,500)})
router.post('/login',rateLimit({windowMs:15*60000,limit:10,standardHeaders:'draft-8',legacyHeaders:false}),asyncHandler(async(req,res)=>{const body=loginSchema.parse(req.body),result=await auth.login(body.username,body.password,meta(req));res.cookie('refresh_token',result.refreshToken,auth.cookieOptions).json({accessToken:result.accessToken,user:result.user})}))
router.post('/refresh',asyncHandler(async(req,res)=>{const result=await auth.refresh(req.cookies.refresh_token,meta(req));res.cookie('refresh_token',result.refreshToken,auth.cookieOptions).json({accessToken:result.accessToken,user:result.user})}))
router.post('/logout',asyncHandler(async(req,res)=>{let id;try{id=(await import('jsonwebtoken')).default.verify(req.get('authorization')?.slice(7)||'',(await import('../config/env.js')).env.JWT_ACCESS_SECRET).sub}catch{}await auth.logout(req.cookies.refresh_token,id,req.ip);res.clearCookie('refresh_token',{...auth.cookieOptions,maxAge:undefined}).status(204).end()}))
router.get('/me',authenticate,(req,res)=>res.json(req.user))
export default router
