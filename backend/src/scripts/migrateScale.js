import {ensureScaleTickets} from '../repositories/scaleTicketRepository.js'
import {pool} from '../config/db.js'
try{
 await ensureScaleTickets()
 for(const [key,action,description] of [['scale.view','view','Veure la bàscula'],['scale.configure','manage','Diagnòstic i configuració de la bàscula'],['scale.command','manage','Ordres manuals de bàscula (administrador)']]){
  await pool.execute('INSERT INTO permissions(permission_key,module_key,action_key,description) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE description=VALUES(description)',[key,'scale',action,description])
 }
 await pool.query("INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='Administrador' AND p.module_key='scale'")
 console.log('Permisos de bàscula preparats')
}finally{await pool.end()}
