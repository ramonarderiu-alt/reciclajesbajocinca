import { app } from './app.js'
import {attachScaleAgent} from './services/scaleService.js'
import { env,environmentSource } from './config/env.js'
import { pool } from './config/db.js'
import { ensureWebUser } from './services/bootstrapUserService.js'
import {startAccounting,stopAccounting} from './routes/accountingRoutes.js'
if(env.TRUST_PROXY)app.set('trust proxy',1)
console.log(`Configuració: ${environmentSource.envFile} (${environmentSource.fileLoaded?'fitxer carregat':'variables del procés'})`)
if(environmentSource.overriddenKeys.length)console.log(`Variables del procés amb prioritat sobre el fitxer: ${environmentSource.overriddenKeys.join(', ')}`)
await pool.query('SELECT 1')
await startAccounting()
await ensureWebUser(pool)
const server=app.listen(env.PORT,()=>console.log(`API disponible a http://localhost:${env.PORT}`))
const stopScale=attachScaleAgent(server)
const shutdown=()=>{stopScale();server.close(async()=>{await stopAccounting();await pool.end();process.exit(0)})}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown)
