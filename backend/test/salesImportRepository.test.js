import test from 'node:test'
import assert from 'node:assert/strict'
import {pool} from '../src/config/db.js'
import {confirmedIdentityPrices} from '../src/repositories/salesImportRepository.js'

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
