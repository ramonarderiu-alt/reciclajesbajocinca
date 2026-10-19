import {pool} from '../config/db.js'
import {ensureWoodAndInadequateCategories} from '../repositories/articleCategoryMigration.js'
try{await ensureWoodAndInadequateCategories(pool);console.log('Categories Fusta i Mat Inade preparades.')}
catch(error){console.error(error.message);process.exitCode=1}
finally{await pool.end()}
