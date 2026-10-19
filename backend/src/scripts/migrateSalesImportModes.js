import {pool} from '../config/db.js'
import {ensureSalesImportModes} from '../repositories/salesImportModeMigration.js'
try{await ensureSalesImportModes(pool);console.log('Modes d’importació preparats.')}
catch(error){console.error(error.message);process.exitCode=1}
finally{await pool.end()}
