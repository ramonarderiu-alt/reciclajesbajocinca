import {fileURLToPath} from 'node:url'
import {env} from './env.js'

export const accountingDatabaseName=env.ACCOUNTING_DB_NAME||env.DB_NAME
export const accountingConfig={
 database:{host:env.DB_HOST,port:env.DB_PORT,user:env.DB_USER,password:env.DB_PASSWORD,database:accountingDatabaseName,connectionLimit:5,connectTimeout:5000,charset:'utf8mb4',dateStrings:true,decimalNumbers:false},
 backupDirectory:fileURLToPath(new URL('../../../uploads/accounting-backups/',import.meta.url))
}
