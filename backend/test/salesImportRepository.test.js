import test from 'node:test'
import assert from 'node:assert/strict'
import {pool} from '../src/config/db.js'
import {confirmedIdentityPrices,confirmImport} from '../src/repositories/salesImportRepository.js'

test('consulta identitats per lots, elimina repeticions i normalitza els preus',async()=>{
 const execute=pool.execute,calls=[];
 pool.execute=async(sql,params)=>{calls.push(params);assert.match(sql,/is_confirmed=TRUE/);assert.match(sql,/MIN\(id\)/);return [params.filter(hash=>hash!=='missing').map(hash=>({identity_hash:hash,unit_price:hash==='zero'?null:'-12.5000'}))]};
 try{
  assert.deepEqual(await confirmedIdentityPrices([]),new Map());assert.equal(calls.length,0);
  const hashes=['zero',...Array.from({length:2100},(_,i)=>`hash-${i}`),'missing','zero'];
  const result=await confirmedIdentityPrices(hashes);
  assert.deepEqual(calls.map(batch=>batch.length),[1000,1000,102]);
  assert.equal(result.size,2101);assert.equal(result.get('zero'),0);assert.equal(result.get('hash-2099'),-12.5);assert.equal(result.has('missing'),false);
 }finally{pool.execute=execute}
});

test('la sobrescriptura substitueix albarans de clients agrupats',async()=>{
 const getConnection=pool.getConnection,calls=[];
 const connection={
  async beginTransaction(){},async commit(){},async rollback(){},release(){},
  async execute(sql,params=[]){
   calls.push({sql,params});
   if(sql.startsWith('SELECT id FROM companies'))return [[{id:1}]];
   if(sql.startsWith('SELECT * FROM sales_imports'))return [[{id:10,import_mode:'overwrite'}]];
   if(sql.startsWith('SELECT COUNT(*) rowCount'))return [[{rowCount:1,invalidCount:0}]];
   if(sql.includes('incoming.client_code=existing.client_code'))return [{affectedRows:0}];
   if(sql.includes('incoming.client_code IN'))return [{affectedRows:1}];
   if(sql.startsWith('UPDATE sales_import_rows SET is_confirmed'))return [{affectedRows:1}];
   if(sql.startsWith("UPDATE sales_imports SET status='completed'"))return [{affectedRows:1}];
   throw new Error('SQL no esperat: '+sql);
  }
 };
 pool.getConnection=async()=>connection;
 try{
  assert.deepEqual(await confirmImport(10,1),{mode:'overwrite',confirmedCount:1,replacedCount:1,discardedCount:0,updatedCount:0});
  const grouped=calls.find(call=>call.sql.includes('incoming.client_code IN'));
  assert.ok(grouped);
  assert.deepEqual(grouped.params,[1,10,'4300700689','4300200131','4300700689','4300200131',10]);
 }finally{pool.getConnection=getConnection}
});