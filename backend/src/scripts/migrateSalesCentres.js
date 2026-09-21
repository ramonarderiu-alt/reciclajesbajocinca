import {buildLineIdentityHash} from '../services/deliveryNoteParser.js'
﻿import {pool} from '../config/db.js'
import {ensureCentreRatingsTable} from '../repositories/centreRatingRepository.js'

// Upgrade an existing sales database without running initial data seeding.
try{
 const [columns]=await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sales_import_rows'");
 if(!columns.length)throw new Error('No existeix sales_import_rows. Comproveu la base de dades configurada abans de migrar.');
 if(!columns.some(row=>row.COLUMN_NAME==='centre_name')){
  await pool.query('ALTER TABLE sales_import_rows ADD COLUMN centre_name VARCHAR(500) NULL AFTER client_name');
  console.log('Afegida la columna centre_name.');
 }else console.log('La columna centre_name ja existeix.');
 if(!columns.some(row=>row.COLUMN_NAME==='identity_hash'))await pool.query('ALTER TABLE sales_import_rows ADD COLUMN identity_hash CHAR(64) NULL AFTER line_hash');
 if(!columns.some(row=>row.COLUMN_NAME==='discarded_reason'))await pool.query('ALTER TABLE sales_import_rows ADD COLUMN discarded_reason VARCHAR(40) NULL AFTER is_confirmed');
 const [indexes]=await pool.query("SHOW INDEX FROM sales_import_rows WHERE Column_name='identity_hash' AND Seq_in_index=1");
 if(!indexes.length)await pool.query('ALTER TABLE sales_import_rows ADD INDEX sales_rows_identity_confirmed(identity_hash,is_confirmed)');
 const [importColumns]=await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sales_imports'");
 for(const column of ['confirmed_row_count','discarded_row_count','updated_row_count'])if(!importColumns.some(row=>row.COLUMN_NAME===column))await pool.query('ALTER TABLE sales_imports ADD COLUMN '+column+' INT NOT NULL DEFAULT 0');
 let lastId=0,updated=0;
 for(;;){
  const [rows]=await pool.execute("SELECT r.id,CAST(i.company_id AS CHAR) companyName,r.client_code clientCode,r.delivery_note_number deliveryNoteNumber,DATE_FORMAT(r.delivery_date,'%Y-%m-%d') date,r.product_code productCode,r.concept,r.quantity FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id WHERE r.identity_hash IS NULL AND r.id>? ORDER BY r.id LIMIT 1000",[lastId]);
  if(!rows.length)break;
  for(const row of rows)await pool.execute('UPDATE sales_import_rows SET identity_hash=? WHERE id=? AND identity_hash IS NULL',[buildLineIdentityHash(row),row.id]);
  lastId=rows.at(-1).id;updated+=rows.length;console.log('Identitats calculades:',updated);
 }
 console.log('Identitats de les línies verificades.');
 await ensureCentreRatingsTable(pool);
 await pool.query('SELECT centre_name,identity_hash,discarded_reason FROM sales_import_rows LIMIT 0');
 await pool.query('SELECT company_id,client_code,centre_key,centre_name,rating,updated_by,updated_at FROM sales_centre_ratings LIMIT 0');
 console.log('Migració de centres i valoracions completada.');
}catch(error){
 console.error('No s’ha pogut completar la migració:',error.code||'',error.message);
 process.exitCode=1;
}finally{await pool.end()}
