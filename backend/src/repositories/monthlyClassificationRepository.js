import {groupClientSalesRows} from '../services/salesClientGroups.js'
import {pool} from '../config/db.js'
import {syncArticleCatalog} from './salesImportRepository.js'
import {addDecimal} from '../services/clientSalesMatrix.js'
export async function monthlyClassificationSales(companyId){
 await syncArticleCatalog(companyId);
 const [data]=await pool.execute(`SELECT YEAR(r.delivery_date) sale_year,MONTH(r.delivery_date) sale_month,g.category,
 CAST(SUM(r.quantity) AS CHAR) quantity,CAST(SUM(r.total_amount) AS CHAR) total_amount
 FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id
 JOIN sales_article_compost_group g ON g.company_id=i.company_id AND g.product_code=r.product_code AND g.product_name=LEFT(TRIM(r.concept),255)
 WHERE i.company_id=? AND r.is_confirmed=TRUE AND r.delivery_date IS NOT NULL
 AND g.category IS NOT NULL AND g.category<>'no_comptabilitzar'
 GROUP BY YEAR(r.delivery_date),MONTH(r.delivery_date),g.category
 ORDER BY sale_year DESC,g.category,sale_month`,[companyId]);
 const rows=new Map();
 for(const item of data){
  const year=Number(item.sale_year),key=year+':'+item.category;
  if(!rows.has(key))rows.set(key,{year,category:item.category,months:{},total:{quantity:'0.0000',totalAmount:'0.00'}});
  const row=rows.get(key),cell={quantity:item.quantity??'0.0000',totalAmount:item.total_amount??'0.00'};
  row.months[Number(item.sale_month)]=cell;
  row.total.quantity=addDecimal(row.total.quantity,cell.quantity,4);
  row.total.totalAmount=addDecimal(row.total.totalAmount,cell.totalAmount,2);
 }
 return {years:[...new Set(data.map(row=>Number(row.sale_year)))].sort((a,b)=>b-a),rows:[...rows.values()]};
}

export async function monthlyClassificationClients(companyId,{year,month,category}){
 await syncArticleCatalog(companyId);
 const from=year+'-'+String(month||1).padStart(2,'0')+'-01';
 const to=month&&month<12?year+'-'+String(month+1).padStart(2,'0')+'-01':(year+1)+'-01-01';
 const [data]=await pool.execute(`SELECT r.client_code,MAX(r.client_name) client_name,
 CAST(SUM(r.quantity) AS CHAR) quantity,CAST(SUM(r.total_amount) AS CHAR) total_amount
 FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id
 JOIN sales_article_compost_group g ON g.company_id=i.company_id AND g.product_code=r.product_code AND g.product_name=LEFT(TRIM(r.concept),255)
 WHERE i.company_id=? AND r.is_confirmed=TRUE AND g.category=? AND r.delivery_date>=? AND r.delivery_date<?
 GROUP BY r.client_code`,[companyId,category,from,to]);
 const clients=new Map(),total={quantity:'0.0000',totalAmount:'0.00'};
 for(const row of groupClientSalesRows(companyId,data)){
  const key=row.client_code??'',client=clients.get(key)||{clientCode:key,clientName:row.client_name||key||'Sense client informat',quantity:'0.0000',totalAmount:'0.00'};
  client.quantity=addDecimal(client.quantity,row.quantity,4);client.totalAmount=addDecimal(client.totalAmount,row.total_amount,2);
  total.quantity=addDecimal(total.quantity,row.quantity,4);total.totalAmount=addDecimal(total.totalAmount,row.total_amount,2);
  clients.set(key,client);
 }
 return {rows:[...clients.values()].sort((a,b)=>a.clientName.localeCompare(b.clientName,'ca')),total};
}
