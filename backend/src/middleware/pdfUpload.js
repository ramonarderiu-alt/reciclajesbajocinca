import multer from 'multer'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'
const storage=multer.memoryStorage()
export const uploadPdf=multer({storage,limits:{fileSize:env.MAX_UPLOAD_MB*1024*1024,files:1},fileFilter(req,file,cb){const safe=/^[\wÀ-ÿ .()\-]+\.pdf$/i.test(file.originalname);if(file.mimetype!=='application/pdf'||!safe)return cb(new AppError(422,'INVALID_PDF','Nom o tipus de fitxer PDF no vàlid'));cb(null,true)}}).single('file')
