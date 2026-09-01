import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { corsOrigins } from './config/env.js'
import authRoutes from './routes/authRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import salesImportRoutes from './routes/salesImportRoutes.js'
import timeClockRoutes from './routes/timeClockRoutes.js'
import { authenticate } from './middleware/auth.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
export const app=express()
app.disable('x-powered-by')
app.use(helmet())
app.use(cors({origin(origin,cb){if(!origin||corsOrigins.includes(origin))return cb(null,true);cb(new Error('Origen CORS no permès'))},credentials:true}))
app.use(express.json({limit:'1mb'}));app.use(cookieParser())
app.get('/api/health',(req,res)=>res.json({status:'ok'}))
app.use('/api/auth',authRoutes)
app.use('/api',authenticate,adminRoutes)
app.use('/api',authenticate,salesImportRoutes)
app.use('/api',authenticate,timeClockRoutes)
app.use(notFoundHandler);app.use(errorHandler)
