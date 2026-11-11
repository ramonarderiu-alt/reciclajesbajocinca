import {loadEnvFile} from './envFile.js'
import { z } from 'zod'
export const environmentSource=loadEnvFile()
const bool = z.enum(['true', 'false']).default('false').transform(v => v === 'true')
const schema = z.object({
  NODE_ENV:z.enum(['development','test','production']).default('development'), PORT:z.coerce.number().default(3100),
  DB_HOST:z.string().default('127.0.0.1'), DB_PORT:z.coerce.number().default(3306), DB_USER:z.string().default('root'), DB_PASSWORD:z.string().default(''), DB_NAME:z.string().regex(/^[A-Za-z0-9_]+$/).default('reciclajes_bajo_cinca'),
  ACCOUNTING_DB_NAME:z.string().regex(/^[A-Za-z0-9_]+$/).max(64).optional(),
  JWT_ACCESS_SECRET:z.string().min(32).default('development-only-secret-change-now'), JWT_ACCESS_TTL:z.string().default('15m'), REFRESH_TOKEN_DAYS:z.coerce.number().default(30),
  CORS_ORIGINS:z.string().default('http://localhost:5174'), COOKIE_SECURE:bool, TRUST_PROXY:bool, MAX_UPLOAD_MB:z.coerce.number().default(5),
  APP_PUBLIC_URL:z.string().url().or(z.literal('')).default(''),
  SMTP_HOST:z.string().trim().default(''), SMTP_PORT:z.coerce.number().int().min(1).max(65535).default(465), SMTP_SECURE:z.enum(['true','false']).default('true').transform(value=>value==='true'),
  SMTP_USER:z.string().trim().default(''), SMTP_PASSWORD:z.string().default(''),
  MAIL_FROM:z.string().trim().email().or(z.literal('')).default(''),
  PASSWORD_RECOVERY_TO:z.string().trim().email().or(z.literal('')).default(''),
  ADMIN_USERNAME:z.string().min(1).max(80).default('admin'), ADMIN_EMAIL:z.string().email().default('admin@reciclajesbajocinca.es'), ADMIN_PASSWORD:z.string().min(1).default('ChangeMe123!'), ADMIN_NAME:z.string().default('Administrador')
})
export const env = schema.parse(process.env)
export const corsOrigins = env.CORS_ORIGINS.split(',').map(v => v.trim()).filter(Boolean)
