import {pool} from '../config/db.js'
import {ensureSalesImportModes} from '../repositories/salesImportModeMigration.js'
try{await ensureSalesImportModes(pool);console.log('Comparació d’albarans preparada: revisions repetibles i índexs de línies actualitzats.')}
catch(error){console.error(error.message);process.exitCode=1}
finally{await pool.end()}
