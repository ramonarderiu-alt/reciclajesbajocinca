import {pool} from '../config/db.js'
export async function ensureScaleTickets(db=pool){await db.query(`CREATE TABLE IF NOT EXISTS scale_tickets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,company_id BIGINT UNSIGNED NOT NULL,
 centre_name VARCHAR(500) NOT NULL,client_code VARCHAR(40) NOT NULL,client_name VARCHAR(190) NOT NULL,
 vehicle_plate VARCHAR(30) NOT NULL,gross_kg DECIMAL(14,3) NOT NULL,tare_kg DECIMAL(14,3) NULL,
 weighed_at DATETIME NOT NULL,tared_at DATETIME NULL,created_by BIGINT UNSIGNED NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX(company_id,tare_kg),INDEX(company_id,weighed_at),
 FOREIGN KEY(company_id) REFERENCES companies(id),FOREIGN KEY(created_by) REFERENCES users(id))`)}
export async function ticketOptions(companyId){
 const [centres]=await pool.execute(`SELECT DISTINCT TRIM(r.centre_name) centre_name,r.client_code,r.client_name
 FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id
 WHERE i.company_id=? AND r.is_confirmed=TRUE AND r.delivery_date>='2025-01-01' AND r.delivery_date<'2027-01-01'
 AND NULLIF(TRIM(r.centre_name),'') IS NOT NULL AND NULLIF(TRIM(r.client_code),'') IS NOT NULL
 ORDER BY centre_name,client_name`,[companyId]);
 const [plates]=await pool.execute(`SELECT vehicle_plate,MAX(last_used) last_used FROM (
 SELECT r.vehicle_plate,r.delivery_date last_used FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id
 WHERE i.company_id=? AND r.is_confirmed=TRUE AND r.delivery_date>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 6 MONTH) AND r.delivery_date<=UTC_TIMESTAMP()
 UNION ALL SELECT vehicle_plate,weighed_at FROM scale_tickets WHERE company_id=? AND weighed_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 6 MONTH) AND weighed_at<=UTC_TIMESTAMP()
 ) p WHERE NULLIF(TRIM(vehicle_plate),'') IS NOT NULL GROUP BY vehicle_plate ORDER BY last_used DESC`,[companyId,companyId]);
 return {centres,plates}
}
