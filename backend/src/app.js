import express from 'express'
import scaleRoutes from './routes/scaleRoutes.js'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { corsOrigins, env } from './config/env.js'
import authRoutes from './routes/authRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import salesImportRoutes from './routes/salesImportRoutes.js'
import timeClockRoutes from './routes/timeClockRoutes.js'
import accountingRoutes from './routes/accountingRoutes.js'
import { authenticate } from './middleware/auth.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
export const app=express()
app.disable('x-powered-by')
app.use(helmet())
app.use(cors({origin(origin,cb){if(!origin||corsOrigins.includes(origin))return cb(null,true);cb(new Error('Origen CORS no permès'))},credentials:true}))
app.use(cookieParser())
app.use('/api/accounting',accountingRoutes)
app.use(express.json({limit:'1mb'}))
app.get('/api/health',(req,res)=>res.json({status:'ok'}))
app.use('/api/auth',authRoutes)
app.use('/api/scale',scaleRoutes)
app.use('/api',authenticate,adminRoutes)
app.use('/api',authenticate,salesImportRoutes)
app.use('/api',authenticate,timeClockRoutes)
if(env.NODE_ENV==='production'){
  const frontendDist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../frontend/dist')
  app.use('/assets',express.static(path.join(frontendDist,'assets'),{immutable:true,maxAge:'1y'}))
  app.use(express.static(frontendDist,{index:false,maxAge:0}))
  app.use((req,res,next)=>{
    if(req.method!=='GET'||req.path.startsWith('/api')||path.extname(req.path))return next()
    res.set('Cache-Control','no-cache')
    res.sendFile(path.join(frontendDist,'index.html'),error=>{if(error)next(error)})
  })
}
app.use(notFoundHandler);app.use(errorHandler)
