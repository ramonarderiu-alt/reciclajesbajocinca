import crypto from 'node:crypto'
import {pool} from '../config/db.js'
import {salesClientGroup} from '../services/salesClientGroups.js'
import {notFound} from '../lib/errors.js'
export const centreRatingKey=name=>crypto.createHash('sha256').update(String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()).digest('hex')
export async function ensureCentreRatingsTable(db){await db.query(`CREATE TABLE IF NOT EXISTS sales_centre_ratings (
 company_id BIGINT UNSIGNED NOT NULL,client_code VARCHAR(40) NOT NULL,centre_key CHAR(64) NOT NULL,centre_name VARCHAR(500) NOT NULL,
 comment VARCHAR(2000) NULL,rating TINYINT UNSIGNED NOT NULL,updated_by BIGINT UNSIGNED NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(company_id,client_code,centre_key),CHECK(rating BETWEEN 1 AND 5),FOREIGN KEY(company_id) REFERENCES companies(id),FOREIGN KEY(updated_by) REFERENCES users(id)
)`);const [columns]=await db.query("SHOW COLUMNS FROM sales_centre_ratings LIKE 'comment'");if(!columns.length)await db.query('ALTER TABLE sales_centre_ratings ADD COLUMN comment VARCHAR(2000) NULL AFTER rating')}
export async function attachCentreRatings(companyId,matrix){
 const [rows]=await pool.execute('SELECT client_code,centre_key,rating,comment FROM sales_centre_ratings WHERE company_id=?',[companyId]);
 const ratings=new Map(rows.map(row=>[`${row.client_code}:${row.centre_key}`,row]));
 for(const client of matrix.rows)for(const centre of client.centres){const saved=centre.centreName?ratings.get(`${client.clientCode}:${centreRatingKey(centre.centreName)}`):null;centre.rating=saved?.rating||null;centre.comment=saved?.comment||'';}
 return matrix
}
export async function saveCentreRating(companyId,clientCode,centreName,rating,userId,comment=undefined){
 const group=salesClientGroup(companyId,clientCode),codes=group?.codes||[clientCode],canonical=group?.clientCode||clientCode;
 const [[centre]]=await pool.execute(`SELECT r.centre_name FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id WHERE i.company_id=? AND r.is_confirmed=TRUE AND r.client_code IN (${codes.map(()=>'?').join(',')}) AND r.centre_name=? LIMIT 1`,[companyId,...codes,centreName]);
 if(!centre)throw notFound('Centre no trobat');
 await pool.execute(`INSERT INTO sales_centre_ratings(company_id,client_code,centre_key,centre_name,rating,updated_by,comment) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE comment=IF(?,VALUES(comment),comment),rating=VALUES(rating),updated_by=VALUES(updated_by),updated_at=CURRENT_TIMESTAMP`,[companyId,canonical,centreRatingKey(centre.centre_name),centre.centre_name,rating,userId,comment??null,comment!==undefined]);
 return {rating}
}
