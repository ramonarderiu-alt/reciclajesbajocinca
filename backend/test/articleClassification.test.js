import test from 'node:test'
import assert from 'node:assert/strict'
import {pool} from '../src/config/db.js'
import {classifiedArticles} from '../src/repositories/salesImportRepository.js'

test('la classificació conserva articles sense vendes i separa les tones per nom i any',async()=>{
 const original=pool.execute;
 pool.execute=async(sql,params)=>{
  if(sql.startsWith('INSERT IGNORE'))return [{}];
  assert.deepEqual(params,[7,7]);
  assert.match(sql,/r.is_confirmed=TRUE/);
  assert.match(sql,/i.company_id=\?/);
  assert.match(sql,/g.company_id=\?/);
  const article={product_code:'001',product_name:'Article A',category:null,manually_reviewed:0};
  return [[{...article,sale_year:2024,quantity:'12.3456'},{...article,sale_year:2025,quantity:'-2.5000'},
   {...article,product_name:'Article B',category:'no_comptabilitzar',sale_year:2025,quantity:'0.0000'},
   {...article,product_code:'002',product_name:'Sense vendes',sale_year:null,quantity:null}]];
 };
 try{
  const rows=await classifiedArticles(7);
  assert.equal(rows.length,3);
  assert.deepEqual(rows[0].quantities,{2024:'12.3456',2025:'-2.5000'});
  assert.equal(rows[0].category,null);
  assert.deepEqual(rows[1].quantities,{2025:'0.0000'});
  assert.equal(rows[1].category,'no_comptabilitzar');
  assert.deepEqual(rows[2].quantities,{});
 }finally{pool.execute=original}
});
