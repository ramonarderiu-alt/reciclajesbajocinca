import mysql from 'mysql2/promise'
import {createHash} from 'node:crypto'
import {readdir,readFile} from 'node:fs/promises'
import {accountingConfig,accountingDatabaseName} from '../config/accounting.js'
import {pool as hostDb} from '../config/db.js'
import {ensureAccountingCompany,ensureAccountingPermissions} from '../services/accountingIntegration.js'
import {errorCodes} from '../lib/errors.js'
import {env} from '../config/env.js'
import {accountingDatabase} from '../repositories/accountingSqlNamespace.js'

let connection,db,locked=false
const lockName='rbc-accounting:'+createHash('sha256').update(accountingDatabaseName+':accounting_').digest('hex').slice(0,40)
try{
 await ensureAccountingPermissions(hostDb)
 const {database,...serverConfig}=accountingConfig.database
 connection=accountingDatabase(await mysql.createConnection(serverConfig))
 const [[lock]]=await connection.execute('SELECT GET_LOCK(?,10) acquired',[lockName])
 if(Number(lock.acquired)!==1)throw Object.assign(new Error('Migració ocupada'),{code:'DATABASE_LOCK_UNAVAILABLE'})
 locked=true
 if(database!==env.DB_NAME)await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
 await connection.query(`USE \`${database}\``)
 await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations(name VARCHAR(190) PRIMARY KEY,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB')
 const directory=new URL('../../../modules/accounting/database/migrations/',import.meta.url)
 for(const name of (await readdir(directory)).filter(value=>value.endsWith('.sql')).sort()){
  const key=`migrate:${name}`
  const [existing]=await connection.execute('SELECT name FROM schema_migrations WHERE name=?',[key])
  if(existing.length)continue
  const sql=await readFile(new URL(name,directory),'utf8')
  for(const statement of sql.split(/^-- statement\s*$/m).map(value=>value.trim()).filter(Boolean)){
   try{await connection.query(statement)}catch(error){
    if(error.code==='ER_BINLOG_CREATE_ROUTINE_NEED_SUPER'&&/\bCREATE\s+TRIGGER\b/i.test(statement)){
     console.warn('Trigger addicional no disponible amb aquest compte; els exercicis es validen amb bloqueig transaccional al servei.')
    }else throw error
   }
  }
  await connection.execute('INSERT INTO schema_migrations(name) VALUES(?)',[key])
  console.log('Migració de comptabilitat aplicada:',name)
 }
 db=accountingDatabase(mysql.createPool(accountingConfig.database))
 const [companies]=await hostDb.query('SELECT id,trade_name,legal_name FROM companies')
 for(const company of companies)await ensureAccountingCompany(db,company)
 console.log(`Comptabilitat preparada a ${accountingDatabaseName}, amb taules accounting_*. No s’han importat dades del projecte original.`)
}catch(error){
 console.error('No s’ha pogut preparar la comptabilitat.',errorCodes(error))
 if(error.code==='ER_DBACCESS_DENIED_ERROR')console.error(`Cal crear la base ${accountingDatabaseName} i donar-hi permisos a l’usuari DB_USER configurat. Consulteu modules/accounting/README.md.`)
 process.exitCode=1
}
finally{
 if(connection){if(locked)await connection.execute('SELECT RELEASE_LOCK(?)',[lockName]);await connection.end()}
 if(db)await db.end()
 await hostDb.end()
}
