import {pool} from '../config/db.js'
import {ensureFruitCategory} from '../repositories/articleCategoryMigration.js'
try{await ensureFruitCategory(pool);console.log('Categoria Fruita preparada.')}
catch(error){console.error(error.message);process.exitCode=1}
finally{await pool.end()}
