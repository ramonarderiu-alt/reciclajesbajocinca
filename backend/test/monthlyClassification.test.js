import test from 'node:test'
import assert from 'node:assert/strict'
import {pool} from '../src/config/db.js'
import {monthlyClassificationSales,monthlyClassificationClients} from '../src/repositories/monthlyClassificationRepository.js'
test('monthly sales scope confirmed and countable lines to company and keep exact annual totals',async()=>{
 const original=pool.execute;
 pool.execute=async(sql,params)=>{
  if(sql.startsWith('INSERT IGNORE'))return [{}];
  assert.deepEqual(params,[7]);
  assert.match(sql,/i.company_id=\?/);
  assert.match(sql,/r.is_confirmed=TRUE/);
  assert.match(sql,/r.delivery_date IS NOT NULL/);
  assert.match(sql,/g.category IS NOT NULL AND g.category<>'no_comptabilitzar'/);
  assert.match(sql,/g.product_name=LEFT\(TRIM\(r.concept\),255\)/);
  assert.match(sql,/GROUP BY YEAR\(r.delivery_date\),MONTH\(r.delivery_date\),g.category/);
  return [[{sale_year:2026,sale_month:1,category:'fusta',quantity:'0.1000',total_amount:'0.10'},
   {sale_year:2026,sale_month:2,category:'fusta',quantity:'0.2000',total_amount:'0.20'},
   {sale_year:2026,sale_month:3,category:'fusta',quantity:'-0.0500',total_amount:'-0.05'},
   {sale_year:2025,sale_month:12,category:'mat_inade',quantity:'2.0000',total_amount:null}]];
 };
 try{
  const result=await monthlyClassificationSales(7);
  assert.deepEqual(result.years,[2026,2025]);assert.equal(result.rows.length,2);
  assert.deepEqual(result.rows[0].total,{quantity:'0.2500',totalAmount:'0.25'});
  assert.equal(result.rows[0].months[4],undefined);
  assert.deepEqual(result.rows[0].months[3],{quantity:'-0.0500',totalAmount:'-0.05'});
  assert.deepEqual(result.rows[1].total,{quantity:'2.0000',totalAmount:'0.00'});
 }finally{pool.execute=original}
});

test('client detail filters month and company, merges reporting groups and preserves signed totals',async()=>{
 const original=pool.execute;let params;
 pool.execute=async(sql,values)=>{
  if(sql.startsWith('INSERT IGNORE'))return [{}];
  params=values;assert.match(sql,/r.is_confirmed=TRUE/);assert.match(sql,/g.category=\?/);assert.match(sql,/r.delivery_date>=\? AND r.delivery_date<\?/);
  return [[{client_code:'4300700689',client_name:'Remondis',quantity:'0.1000',total_amount:'0.10'},{client_code:'4300200131',client_name:'Muns',quantity:'0.2000',total_amount:'0.20'},{client_code:'A',client_name:'Client A',quantity:'-0.0500',total_amount:'-0.05'}]];
 };
 try{
  const detail=await monthlyClassificationClients(1,{year:2026,month:12,category:'fusta'});
  assert.deepEqual(params,[1,'fusta','2026-12-01','2027-01-01']);assert.equal(detail.rows.length,2);
  assert.deepEqual(detail.total,{quantity:'0.2500',totalAmount:'0.25'});
  const merged=detail.rows.find(row=>row.clientCode==='4300700689');assert.equal(merged.quantity,'0.3000');assert.equal(merged.totalAmount,'0.30');
  await monthlyClassificationClients(7,{year:2025,category:'mat_inade'});assert.deepEqual(params,[7,'mat_inade','2025-01-01','2026-01-01']);
 }finally{pool.execute=original}
});
