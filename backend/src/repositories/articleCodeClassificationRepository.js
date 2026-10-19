import {transaction} from '../config/db.js'
import {AppError} from '../lib/errors.js'
import {classifiedArticles,syncArticleCatalog} from './salesImportRepository.js'
import {matchesDescriptionCode} from '../services/articleDescriptionCode.js'
const key=row=>JSON.stringify([row.product_code,row.product_name]);
export async function articlesByDescriptionCode(companyId,code){
 return (await classifiedArticles(companyId)).filter(row=>matchesDescriptionCode(row.product_name,code));
}
export async function classifyByDescriptionCode(companyId,{code,category,articles},userId,ip){
 await syncArticleCatalog(companyId);
 return transaction(async connection=>{
  const [rows]=await connection.execute('SELECT product_code,product_name,category FROM sales_article_compost_group WHERE company_id=? ORDER BY product_code,product_name FOR UPDATE',[companyId]);
  const matched=rows.filter(row=>matchesDescriptionCode(row.product_name,code));
  const expected=new Set(articles.map(key));
  if(!matched.length||expected.size!==articles.length||matched.length!==expected.size||matched.some(row=>!expected.has(key(row))))throw new AppError(409,'CLASSIFICATION_CHANGED','Els articles coincidents han canviat. Torneu a cercar el codi abans de confirmar.');
  for(const row of matched)await connection.execute('UPDATE sales_article_compost_group SET category=?,is_compost=?,manually_reviewed=TRUE,updated_by=? WHERE company_id=? AND product_code=? AND product_name=?',[category,category==='compost',userId,companyId,row.product_code,row.product_name]);
  await connection.execute('INSERT INTO audit_logs(user_id,action,entity,record_id,old_values,new_values,ip_address) VALUES(?,?,?,?,?,?,?)',[userId,'update','article_classification',String(companyId),JSON.stringify({articles:matched}),JSON.stringify({code,category,count:matched.length}),ip||null]);
  return {count:matched.length,category};
 });
}

export async function classifySelectedArticles(companyId,{category,articles},userId,ip){
 return transaction(async connection=>{
  const expected=new Map(articles.map(row=>[key(row),row]));
  if(!articles.length||expected.size!==articles.length)throw new AppError(422,'INVALID_SELECTION','Seleccioneu articles sense repeticions.');
  const [rows]=await connection.execute('SELECT product_code,product_name,category FROM sales_article_compost_group WHERE company_id=? ORDER BY product_code,product_name FOR UPDATE',[companyId]);
  const selected=rows.filter(row=>expected.has(key(row)));
  if(selected.length!==expected.size||selected.some(row=>row.category!==expected.get(key(row)).previous_category))throw new AppError(409,'CLASSIFICATION_CHANGED','La classificació o els articles han canviat. Actualitzeu la llista i torneu a seleccionar-los.');
  for(const row of selected)await connection.execute('UPDATE sales_article_compost_group SET category=?,is_compost=?,manually_reviewed=TRUE,updated_by=? WHERE company_id=? AND product_code=? AND product_name=?',[category,category==='compost',userId,companyId,row.product_code,row.product_name]);
  await connection.execute('INSERT INTO audit_logs(user_id,action,entity,record_id,old_values,new_values,ip_address) VALUES(?,?,?,?,?,?,?)',[userId,'update','article_classification',String(companyId),JSON.stringify({articles:selected}),JSON.stringify({category,count:selected.length}),ip||null]);
  return {count:selected.length,category};
 });
}
