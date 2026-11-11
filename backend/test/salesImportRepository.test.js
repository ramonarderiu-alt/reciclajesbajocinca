import test from 'node:test'
import assert from 'node:assert/strict'
import {pool} from '../src/config/db.js'
import {confirmedIdentityPrices,importDetail} from '../src/repositories/salesImportRepository.js'

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

test('pending legacy previews use current whole-note actions and preserve validation warnings',async()=>{
 const execute=pool.execute;
 const oldWarning='Línia ja importada: s’incorporarà el centre si encara no en té';
 const validation='Quantitat × preu no coincideix amb la base imposable';
 const incoming={id:2,client_code:'4300200031',delivery_note_number:'2026003394/RB',delivery_date:'2026-09-07',quantity:'2.66',unit_price:'44',taxable_base:'117',total_amount:'117',warnings:JSON.stringify([validation,oldWarning])};
 let status='pending_review';
 pool.execute=async sql=>{
  if(sql.startsWith('SELECT i.*'))return [[{id:10,company_id:1,status,warnings:JSON.stringify([{row:1,message:oldWarning},{row:1,message:validation}])}]];
  if(sql.startsWith('SELECT * FROM sales_import_clients'))return [[]];
  if(sql.startsWith('SELECT * FROM sales_import_rows'))return [[incoming]];
  if(sql.startsWith('SELECT existing.*'))return [[{...incoming,id:1,unit_price:'22',taxable_base:'58.52',total_amount:'58.52'}]];
  throw new Error('Unexpected query');
 };
 try{
  const detail=await importDetail(10);
  assert.equal(detail.rows[0].comparison_action,'replace');
  assert.deepEqual(detail.rows[0].warnings,[validation]);
  assert.deepEqual(detail.warnings,[{row:1,message:validation}]);
  assert.equal(detail.comparison.replacedNotes,1);
  status='completed';
  const historical=await importDetail(10);
  assert.deepEqual(JSON.parse(historical.rows[0].warnings),[validation,oldWarning]);
 }finally{pool.execute=execute}
});
