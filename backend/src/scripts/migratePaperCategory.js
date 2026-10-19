import {pool} from '../config/db.js'
import {ensurePaperCategory} from '../repositories/articleCategoryMigration.js'
try{await ensurePaperCategory(pool);console.log('Categoria Paper preparada.')}
catch(error){console.error(error.message);process.exitCode=1}
finally{await pool.end()}
