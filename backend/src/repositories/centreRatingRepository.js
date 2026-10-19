import crypto from 'node:crypto'
import {pool} from '../config/db.js'
import {salesClientGroup} from '../services/salesClientGroups.js'
import {groupClientSalesRows} from '../services/salesClientGroups.js'
import {notFound} from '../lib/errors.js'
export const centreRatingKey=name=>crypto.createHash('sha256').update(String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()).digest('hex')
export async function ensureCentreRatingsTable(db){await db.query(`CREATE TABLE IF NOT EXISTS sales_centre_ratings (
 company_id BIGINT UNSIGNED NOT NULL,client_code VARCHAR(40) NOT NULL,centre_key CHAR(64) NOT NULL,centre_name VARCHAR(500) NOT NULL,
 comment VARCHAR(2000) NULL,rating TINYINT UNSIGNED NOT NULL,updated_by BIGINT UNSIGNED NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(company_id,client_code,centre_key),CHECK(rating BETWEEN 1 AND 5),FOREIGN KEY(company_id) REFERENCES companies(id),FOREIGN KEY(updated_by) REFERENCES users(id)
)`);const [columns]=await db.query("SHOW COLUMNS FROM sales_centre_ratings LIKE 'comment'");if(!columns.length)await db.query('ALTER TABLE sales_centre_ratings ADD COLUMN comment VARCHAR(2000) NULL AFTER rating')}
export async function ensureCentreObservationsTable(db=pool){await db.query(`CREATE TABLE IF NOT EXISTS sales_centre_observations (
 company_id BIGINT UNSIGNED NOT NULL,client_code VARCHAR(40) NOT NULL,centre_key CHAR(64) NOT NULL,centre_name VARCHAR(500) NOT NULL,
 comment VARCHAR(2000) NOT NULL DEFAULT '',updated_by BIGINT UNSIGNED NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(company_id,client_code,centre_key),FOREIGN KEY(company_id) REFERENCES companies(id),FOREIGN KEY(updated_by) REFERENCES users(id)
)`)}
async function centreExists(companyId,clientCode,centreName){const group=salesClientGroup(companyId,clientCode),codes=group?.codes||[clientCode];const [[centre]]=await pool.execute(`SELECT r.centre_name FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id WHERE i.company_id=? AND r.is_confirmed=TRUE AND r.client_code IN (${codes.map(()=>'?').join(',')}) AND r.centre_name=? LIMIT 1`,[companyId,...codes,centreName]);return {centre,canonical:group?.clientCode||clientCode,codes}}
async function centreCommentMap(companyId){try{const [observations]=await pool.execute('SELECT client_code,centre_key,comment FROM sales_centre_observations WHERE company_id=?',[companyId]);return new Map(observations.map(row=>[`${row.client_code}:${row.centre_key}`,row.comment||'']))}catch(e){if(e.code==='ER_NO_SUCH_TABLE')return new Map();throw e}}
async function centreRatingMap(companyId){const [rows]=await pool.execute('SELECT client_code,centre_key,rating,comment FROM sales_centre_ratings WHERE company_id=?',[companyId]);return new Map(rows.map(row=>[`${row.client_code}:${row.centre_key}`,row]))}
export async function attachCentreRatings(companyId,matrix){
 const ratings=await centreRatingMap(companyId),comments=await centreCommentMap(companyId);
 for(const client of matrix.rows)for(const centre of client.centres){const key=centre.centreName?`${client.clientCode}:${centreRatingKey(centre.centreName)}`:null,saved=key?ratings.get(key):null;centre.rating=saved?.rating||null;centre.comment=(key?comments.get(key):'')||saved?.comment||'';}
 return matrix
}
export async function attachCentreCommentsToRows(companyId,rows){
 if(!rows.length)return rows;
 const comments=await centreCommentMap(companyId),ratings=await centreRatingMap(companyId),grouped=groupClientSalesRows(companyId,rows);
 return rows.map((row,index)=>{const canonical=grouped[index]||row,key=row.centre_name?`${canonical.client_code}:${centreRatingKey(row.centre_name)}`:null,saved=key?ratings.get(key):null;return {...row,centre_comment:(key?comments.get(key):'')||saved?.comment||''}})
}
export async function attachCentreCommentsToPriceMatrix(companyId,matrix){
 if(!matrix.rows?.some(row=>Object.values(row.years||{}).some(annual=>annual.centres?.length)))return matrix;
 const comments=await centreCommentMap(companyId),ratings=await centreRatingMap(companyId);
 for(const row of matrix.rows)for(const annual of Object.values(row.years||{}))for(const centre of annual.centres||[]){const key=centre.centreName?`${centre.clientCode}:${centreRatingKey(centre.centreName)}`:null,saved=key?ratings.get(key):null;centre.comment=(key?comments.get(key):'')||saved?.comment||'';}
 return matrix
}
export async function listCentres(companyId){
 await ensureCentreObservationsTable();
 const [rows]=await pool.execute(`SELECT r.client_code,r.client_name,NULLIF(TRIM(r.centre_name),'') centre_name,YEAR(r.delivery_date) sale_year,COUNT(DISTINCT r.delivery_note_number) note_count,MIN(r.delivery_date) first_date,MAX(r.delivery_date) last_date
 FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id
 WHERE i.company_id=? AND r.is_confirmed=TRUE AND NULLIF(TRIM(r.centre_name),'') IS NOT NULL
 GROUP BY r.client_code,r.client_name,NULLIF(TRIM(r.centre_name),''),YEAR(r.delivery_date)`,[companyId]);
 const grouped=groupClientSalesRows(companyId,rows),map=new Map();
 for(const row of grouped){const key=JSON.stringify([row.client_code,row.centre_name]);if(!map.has(key))map.set(key,{clientCode:row.client_code,clientName:row.client_name,centreName:row.centre_name,noteCount:0,firstDate:row.first_date,lastDate:row.last_date,years:new Set(),categories:new Set(),yearStats:{}});const item=map.get(key),year=Number(row.sale_year);item.noteCount+=Number(row.note_count||0);if(year){item.years.add(year);item.yearStats[year]??={noteCount:0,firstDate:row.first_date,lastDate:row.last_date,categories:new Set()};item.yearStats[year].noteCount+=Number(row.note_count||0);if(row.first_date&&(!item.yearStats[year].firstDate||String(row.first_date)<String(item.yearStats[year].firstDate)))item.yearStats[year].firstDate=row.first_date;if(row.last_date&&(!item.yearStats[year].lastDate||String(row.last_date)>String(item.yearStats[year].lastDate)))item.yearStats[year].lastDate=row.last_date;}if(row.first_date&&(!item.firstDate||String(row.first_date)<String(item.firstDate)))item.firstDate=row.first_date;if(row.last_date&&(!item.lastDate||String(row.last_date)>String(item.lastDate)))item.lastDate=row.last_date;}
 const [categoryRows]=await pool.execute(`SELECT r.client_code,r.client_name,NULLIF(TRIM(r.centre_name),'') centre_name,YEAR(r.delivery_date) sale_year,g.category
 FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id
 LEFT JOIN sales_article_compost_group g ON g.company_id=i.company_id AND g.product_code=r.product_code AND g.product_name=LEFT(TRIM(r.concept),255)
 WHERE i.company_id=? AND r.is_confirmed=TRUE AND NULLIF(TRIM(r.centre_name),'') IS NOT NULL
 GROUP BY r.client_code,r.client_name,NULLIF(TRIM(r.centre_name),''),YEAR(r.delivery_date),g.category`,[companyId]);
 for(const row of groupClientSalesRows(companyId,categoryRows)){const key=JSON.stringify([row.client_code,row.centre_name]),item=map.get(key),year=Number(row.sale_year);if(!item)continue;item.categories.add(row.category??null);if(year){item.yearStats[year]??={noteCount:0,firstDate:null,lastDate:null,categories:new Set()};item.yearStats[year].categories.add(row.category??null)}}
 const comments=await centreCommentMap(companyId),ratings=await centreRatingMap(companyId);
 return [...map.values()].map(item=>{const key=`${item.clientCode}:${centreRatingKey(item.centreName)}`,saved=ratings.get(key),yearStats=Object.fromEntries(Object.entries(item.yearStats).map(([year,stats])=>[year,{...stats,categories:[...(stats.categories||[])]}]));return {...item,years:[...item.years].sort((a,b)=>b-a),categories:[...item.categories],yearStats,rating:saved?.rating||null,comment:comments.get(key)||saved?.comment||''}}).sort((a,b)=>String(a.clientName||a.clientCode).localeCompare(String(b.clientName||b.clientCode),'ca')||String(a.centreName||'').localeCompare(String(b.centreName||''),'ca'));
}
export async function saveCentreObservation(companyId,clientCode,centreName,comment,userId){
 await ensureCentreObservationsTable();
 const {centre,canonical}=await centreExists(companyId,clientCode,centreName);
 if(!centre)throw notFound('Centre no trobat');
 const clean=String(comment||'').trim();
 await pool.execute(`INSERT INTO sales_centre_observations(company_id,client_code,centre_key,centre_name,comment,updated_by) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE comment=VALUES(comment),updated_by=VALUES(updated_by),updated_at=CURRENT_TIMESTAMP`,[companyId,canonical,centreRatingKey(centre.centre_name),centre.centre_name,clean,userId]);
 return {comment:clean}
}
export async function saveCentreRating(companyId,clientCode,centreName,rating,userId,comment=undefined){
 const {centre,canonical}=await centreExists(companyId,clientCode,centreName);
 if(!centre)throw notFound('Centre no trobat');
 await pool.execute(`INSERT INTO sales_centre_ratings(company_id,client_code,centre_key,centre_name,rating,updated_by,comment) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE comment=IF(?,VALUES(comment),comment),rating=VALUES(rating),updated_by=VALUES(updated_by),updated_at=CURRENT_TIMESTAMP`,[companyId,canonical,centreRatingKey(centre.centre_name),centre.centre_name,rating,userId,comment??null,comment!==undefined]);
 if(comment!==undefined)await saveCentreObservation(companyId,canonical,centre.centre_name,comment,userId);
 return {rating}
}