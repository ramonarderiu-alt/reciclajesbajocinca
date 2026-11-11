import {pool} from '../config/db.js'
import {ensurePasswordRecovery} from '../repositories/passwordRecoveryMigration.js'

try{
 await ensurePasswordRecovery(pool)
 console.log('Recuperació de contrasenyes preparada. Configura PASSWORD_RECOVERY_TO i el correu SMTP al backend/.env i reinicia l’API.')
}finally{await pool.end()}
