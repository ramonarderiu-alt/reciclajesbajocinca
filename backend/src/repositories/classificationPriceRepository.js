import {pool} from '../config/db.js'
import {syncArticleCatalog} from './salesImportRepository.js'
import {attachCentreCommentsToPriceMatrix} from './centreRatingRepository.js'
import {buildClassificationPriceMatrix} from '../services/classificationPriceMatrix.js'
export async function classificationPrices(companyId){
 await syncArticleCatalog(companyId);
 const [rows]=await pool.execute(`SELECT g.category,YEAR(r.delivery_date) sale_year,r.client_code,r.client_name,NULLIF(TRIM(r.centre_name),'') centre_name,
 r.delivery_note_number,CAST(r.quantity AS CHAR) quantity,CAST(r.taxable_base AS CHAR) taxable_base
 FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id
 JOIN sales_article_compost_group g ON g.company_id=i.company_id AND g.product_code=r.product_code AND g.product_name=LEFT(TRIM(r.concept),255)
 WHERE i.company_id=? AND r.is_confirmed=TRUE AND r.delivery_date IS NOT NULL AND r.quantity IS NOT NULL AND r.quantity<>0 AND r.taxable_base IS NOT NULL
 ORDER BY g.category,YEAR(r.delivery_date),r.client_code,NULLIF(TRIM(r.centre_name),''),r.delivery_note_number,r.id`,[companyId]);
 return attachCentreCommentsToPriceMatrix(companyId,buildClassificationPriceMatrix(companyId,rows));
}
