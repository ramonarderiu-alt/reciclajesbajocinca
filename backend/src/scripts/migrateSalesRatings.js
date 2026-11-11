import {pool} from '../config/db.js'
try{
 await pool.execute("INSERT INTO permissions(permission_key,module_key,action_key,description) VALUES('sales_ratings.manage','sales_ratings','manage','Posar puntuacions i comentaris als centres') ON DUPLICATE KEY UPDATE description=VALUES(description)")
 console.log('Permís de valoració de centres disponible. Assigneu-lo juntament amb Vendes clients → Consultar als rols encarregats de valorar.')
}finally{await pool.end()}
