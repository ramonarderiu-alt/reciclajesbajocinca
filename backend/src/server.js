import { app } from './app.js'
import { env } from './config/env.js'
import { pool } from './config/db.js'
if(env.TRUST_PROXY)app.set('trust proxy',1)
await pool.query('SELECT 1')
const server=app.listen(env.PORT,()=>console.log(`API disponible a http://localhost:${env.PORT}`))
const shutdown=()=>server.close(async()=>{await pool.end();process.exit(0)})
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown)
