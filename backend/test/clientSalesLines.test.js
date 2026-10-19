import test from 'node:test'
import assert from 'node:assert/strict'
import {pool} from '../src/config/db.js'
import {clientSales,deliveryNoteSales} from '../src/repositories/salesImportRepository.js'
test('filtra un centre concret, sense centre o tot el client sense barrejar-los',async()=>{
 const original=pool.execute;let query;
 pool.execute=async(sql,params)=>{query={sql,params};return [[]]};
 try{
 await clientSales(1,'4300200131','2026-03-01','2026-09-09','compost',"EDAR D'ANOIA");assert.match(query.sql,/AND r.centre_name=\?/);assert.equal(query.params.at(-1),"EDAR D'ANOIA");assert.deepEqual(query.params.slice(0,5),[1,'4300700689','4300200131','2026-03-01','2026-09-09']);
 await clientSales(1,'4300200131','2026-03-01','2026-09-09','',null);assert.match(query.sql,/r.centre_name IS NULL OR r.centre_name=''/);assert.equal(query.params.length,8);
 await clientSales(1,'4300200131','2026-03-01','2026-09-09');assert.doesNotMatch(query.sql,/AND r.centre_name|r.centre_name IS NULL/);assert.equal(query.params.length,8);
 await clientSales(1,'4300200131','2026-03-01','2026-09-09','',undefined,'compost');assert.match(query.sql,/AND g.category=\?/);assert.equal(query.params.at(-1),'compost');
 await clientSales(1,'4300200131','2026-03-01','2026-09-09','',undefined,null);assert.match(query.sql,/AND g.category IS NULL/);
 await clientSales(1,'4300200131','2026-03-01','2026-09-09','',undefined,['compost',null,'paper']);assert.match(query.sql,/g.category IN \(\?,\?\)/);assert.match(query.sql,/OR g.category IS NULL/);assert.deepEqual(query.params.slice(-2),['compost','paper']);
 }finally{pool.execute=original}
})

test('busca línies confirmades per número d’albarà',async()=>{
 const original=pool.execute;let query;
 pool.execute=async(sql,params)=>{query={sql,params};return [[]]};
 try{
  await deliveryNoteSales(1,'2026003549','2026-01-01','2026-12-31','');
  assert.match(query.sql,/r\.delivery_note_number LIKE \?/);
  assert.deepEqual(query.params,[1,'2026-01-01','2026-12-31','%2026003549%','','%%','%%']);
 }finally{pool.execute=original}
})