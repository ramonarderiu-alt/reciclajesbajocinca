import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {readFileSync} from 'node:fs'
import {pool} from '../src/config/db.js'
import {createPreview,confirmImport,findImportByHash,deliveryNoteComparison,updateImportRow,deliveryNoteSales,clientSales,articleSalesLines,salesByClient} from '../src/repositories/salesImportRepository.js'
import {buildLineHash,buildLineIdentityHash,parseDeliveryNotePages} from '../src/services/deliveryNoteParser.js'
import {extractPdf} from '../src/services/pdfExtractionService.js'
import {preview as previewFile} from '../src/services/salesImportService.js'

// Every query and transaction uses isolated fixture tables, never application sales.
test('whole delivery notes: unchanged, replacement, repeated PDFs and concurrency in MySQL',{skip:process.env.TEST_SALES_IMPORT_DB!=='true'},async t=>{
 const connection=await pool.getConnection(),prefix='test_import_'+crypto.randomBytes(6).toString('hex')+'_'
 const tables=['companies','users','audit_logs','sales_imports','sales_import_clients','sales_import_rows','sales_import_issues','sales_article_compost_group','sales_centre_ratings','sales_centre_observations']
 const tablePattern=new RegExp('\\b('+tables.join('|')+')\\b','g')
 const rewrite=sql=>sql.replace(tablePattern,name=>prefix+name)
 const execute=(sql,params)=>connection.execute(rewrite(sql),params)
 const originals={getConnection:pool.getConnection,execute:pool.execute},created=[]
 const wrappedConnection=async()=>{
  const db=await originals.getConnection.call(pool)
  return {execute:(sql,params)=>db.execute(rewrite(sql),params),beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()}
 }
 const line=(note,price=10,extra={})=>({clientCode:'A',clientName:'Client A',deliveryNoteNumber:note,date:'2026-01-01',externalCode:null,productCode:'P1',concept:'Article',wasteCode:null,centreName:'Centre',vehiclePlate:null,vehiclePlateNormalized:null,trailerPlate:null,trailerPlateNormalized:null,quantity:'2',unitPrice:String(price),taxableBase:String(price*2),vatAmount:null,totalAmount:String(price*2),sourcePage:1,rawText:'fixture',confidence:'high',warnings:[],...extra})
 const parsed=rows=>({companyName:'Test',pageCount:1,clients:[...new Map(rows.map(row=>[row.clientCode,{clientCode:row.clientCode,clientName:row.clientName}])).values()],rows:rows.map(row=>({...row,lineHash:buildLineHash({...row,companyName:'1'}),identityHash:buildLineIdentityHash({...row,companyName:'1'})})),warnings:[],totals:{taxableBase:'0',vatAmount:'0',totalAmount:'0'}})
 const preview=(rows,options={})=>createPreview({companyId:1,userId:1,filename:'fixture.pdf',fileHash:crypto.randomBytes(32).toString('hex'),parsed:parsed(rows),...options})
 try{
  for(const table of tables){
   const sql=table==='companies'?'CREATE TABLE '+prefix+table+' (id BIGINT UNSIGNED PRIMARY KEY) ENGINE=InnoDB':table==='users'?'CREATE TABLE '+prefix+table+' (id BIGINT UNSIGNED PRIMARY KEY,name VARCHAR(120)) ENGINE=InnoDB':'CREATE TABLE '+prefix+table+' LIKE '+table
   await connection.query(sql);created.push(prefix+table)
  }
  await execute('INSERT INTO companies VALUES(1),(2)');await execute("INSERT INTO users VALUES(1,'Test')")
  pool.getConnection=wrappedConnection
  pool.execute=(sql,params)=>originals.execute.call(pool,rewrite(sql),params)
  const old=await preview([line('100'),line('100',10,{productCode:'P2'}),line('101'),line('100',10,{clientCode:'B',clientName:'Client B'}),line('100',10,{date:'2025-01-01'})])
  await confirmImport(old,1)
  const foreign=await preview([line('100')],{companyId:2});await confirmImport(foreign,2)
  const incoming=await preview([line('100',30,{date:'2026-02-01'}),line('102',40),line('101')])
  const [sameBefore]=await execute("SELECT * FROM sales_import_rows WHERE import_id=? AND delivery_note_number='101'",[old])
  await t.test('preview is read-only and confirmation is scoped to its company',async()=>{
   assert.equal(await confirmImport(incoming,2),null)
   const plan=await deliveryNoteComparison(pool,incoming,1)
   assert.deepEqual(plan.summary,{newNotes:1,unchangedNotes:1,replacedNotes:1,newRows:1,unchangedRows:1,replacementRows:1,replacedRows:2})
   const [[count]]=await execute('SELECT SUM(is_confirmed) active FROM sales_import_rows');assert.equal(Number(count.active),6)
  })
  await t.test('replaces a complete changed note and leaves an identical note byte-for-byte intact',async()=>{
   const result=await confirmImport(incoming,1)
   assert.equal(result.confirmedCount,2);assert.equal(result.replacedCount,2);assert.equal(result.discardedCount,1)
   const [sameAfter]=await execute("SELECT * FROM sales_import_rows WHERE import_id=? AND delivery_note_number='101'",[old]);assert.deepEqual(sameAfter,sameBefore)
   const [replaced]=await execute("SELECT is_confirmed,discarded_reason FROM sales_import_rows WHERE import_id=? AND delivery_note_number='100' AND client_code='A' AND YEAR(delivery_date)=2026",[old]);assert.equal(replaced.length,2);assert.ok(replaced.every(row=>!row.is_confirmed&&row.discarded_reason==='replaced'))
   const [[active]]=await execute("SELECT COUNT(*) total FROM sales_import_rows WHERE is_confirmed=TRUE");assert.equal(active.total,6)
   assert.equal(await confirmImport(incoming,1),null)
  })
  await t.test('a nonzero price change replaces the entire note in the normal mode',async()=>{
   const id=await preview([line('100',99,{date:'2026-02-01'})])
   const result=await confirmImport(id,1);assert.equal(result.replacedNotes,1);assert.equal(result.replacedCount,1)
   const [[saved]]=await execute('SELECT unit_price FROM sales_import_rows WHERE import_id=? AND is_confirmed=TRUE',[id]);assert.equal(Number(saved.unit_price),99)
  })
  await t.test('the reported note switches from 22 to 44 in all reports only after confirmation',async()=>{
   const note='2026003394/RB',client='4300200031',concept='LODOS DE DEPURADORA (190805)';
   const original=line(note,22,{clientCode:client,clientName:'GRIÑO ECOLOGIC, S.A.',date:'2026-09-07',productCode:'63',concept,wasteCode:'190805',quantity:'2.66',taxableBase:'58.52',totalAmount:'58.52',centreName:'AREAS, S.A - PINA DE EBRO - AP-2 Km.48',vehiclePlate:'8644LFK',vehiclePlateNormalized:'8644LFK'});
   const first=await preview([original]);await confirmImport(first,1);
   const correction={...original,unitPrice:'44',taxableBase:'117.00',totalAmount:'117.00',warnings:['Quantitat × preu no coincideix amb la base imposable']};
   const next=await preview([correction]);
   assert.equal((await deliveryNoteComparison(pool,next,1)).summary.replacedNotes,1);
   assert.equal(Number((await deliveryNoteSales(1,note,'2026-01-01','2026-12-31'))[0].unit_price),22);
   const confirmed=await confirmImport(next,1);assert.equal(confirmed.replacedCount,1);
   for(const rows of [await deliveryNoteSales(1,note,'2026-01-01','2026-12-31'),await clientSales(1,client,'2026-01-01','2026-12-31'),await articleSalesLines(1,'63',2026,concept)]){
    assert.equal(rows.length,1);assert.equal(Number(rows[0].unit_price),44);assert.equal(Number(rows[0].total_amount),117);
   }
   const matrix=await salesByClient(1,'2026-01-01','2026-12-31');
   const clientRow=matrix.rows.find(row=>row.clientCode===client);
   assert.equal(Number(clientRow.years[2026].totalAmount),117);
   const repeat=await preview([correction]);assert.equal((await confirmImport(repeat,1)).discardedCount,1);
   assert.equal((await deliveryNoteSales(1,note,'2026-01-01','2026-12-31')).length,1);
  })
  await t.test('repeated PDFs are accepted and equal notes retain their original active rows',async()=>{
   const hash='d'.repeat(64),rows=[line('REPEAT'),line('REPEAT',20,{productCode:'P2'})]
   const first=await preview(rows,{fileHash:hash}),second=await preview([...rows].reverse(),{fileHash:hash}),third=await preview(rows,{fileHash:hash,mode:'overwrite'})
   assert.ok(first<second&&second<third);assert.equal((await findImportByHash(1,hash)).id,third)
   await confirmImport(first,1)
   const [before]=await execute('SELECT id FROM sales_import_rows WHERE import_id=? AND is_confirmed=TRUE ORDER BY id',[first])
   for(const id of [second,third]){const result=await confirmImport(id,1);assert.equal(result.confirmedCount,0);assert.equal(result.replacedCount,0);assert.equal(result.discardedCount,2)}
   const [after]=await execute('SELECT id FROM sales_import_rows WHERE import_id=? AND is_confirmed=TRUE ORDER BY id',[first]);assert.deepEqual(after,before)
  })
  await t.test('identical repeated lines retain their multiplicity, and deleting one replaces the whole note',async()=>{
   const first=await preview([line('MULTI'),line('MULTI')]);await confirmImport(first,1)
   const same=await preview([line('MULTI'),line('MULTI')]);assert.equal((await confirmImport(same,1)).discardedCount,2)
   const changed=await preview([line('MULTI')]);const result=await confirmImport(changed,1);assert.equal(result.replacedCount,2);assert.equal(result.confirmedCount,1)
  })
  await t.test('client reporting aliases match within their company',async()=>{
   const first=await preview([line('GROUP',10,{clientCode:'4300200131'})]);await confirmImport(first,1)
   const next=await preview([line('GROUP',15,{clientCode:'4300700689'})]);assert.equal((await confirmImport(next,1)).replacedCount,1)
   const [[oldCount]]=await execute('SELECT SUM(is_confirmed) active FROM sales_import_rows WHERE import_id=?',[first]);assert.equal(Number(oldCount.active),0)
  })
  await t.test('missing dates prevent every change and retain the pending preview',async()=>{
   const id=await preview([line('100',1,{date:null})])
   await assert.rejects(confirmImport(id,1),{code:'INCOMPLETE_DELIVERY_NOTE'})
   const [[record]]=await execute('SELECT status FROM sales_imports WHERE id=?',[id]);assert.equal(record.status,'pending_review')
  })
  await t.test('confirmation recalculates the comparison if sales changed after preview',async()=>{
   const original=await preview([line('STALE',10)]);await confirmImport(original,1)
   const same=await preview([line('STALE',10)]);assert.equal((await deliveryNoteComparison(pool,same,1)).summary.unchangedNotes,1)
   const correction=await preview([line('STALE',30)]);await confirmImport(correction,1)
   assert.equal((await confirmImport(same,1)).replacedNotes,1)
  })
  await t.test('review edits update their hashes atomically and cannot alter a completed preview',async()=>{
   const id=await preview([line('EDIT')]);const [[row]]=await execute('SELECT id,line_hash FROM sales_import_rows WHERE import_id=?',[id])
   await assert.rejects(updateImportRow(id,row.id,{unitPrice:'25'},2),{code:'IMPORT_LOCKED'})
   await updateImportRow(id,row.id,{unitPrice:'25',taxableBase:'50',totalAmount:'50'},1)
   const [[edited]]=await execute('SELECT line_hash,unit_price FROM sales_import_rows WHERE id=?',[row.id]);assert.notEqual(edited.line_hash,row.line_hash);assert.equal(Number(edited.unit_price),25)
   await confirmImport(id,1)
   await assert.rejects(updateImportRow(id,row.id,{unitPrice:'30'},1),{code:'IMPORT_LOCKED'})
  })
  await t.test('a final write failure rolls back replaced and incoming rows together',async()=>{
   const id=await preview([line('100',1,{date:'2026-02-01'})])
   pool.getConnection=async()=>{const db=await wrappedConnection();return {...db,execute:(sql,params)=>{if(sql.startsWith('UPDATE sales_imports SET status='))throw Error('simulated write failure');return db.execute(sql,params)}}}
   await assert.rejects(confirmImport(id,1),/simulated write failure/);pool.getConnection=wrappedConnection
   const [[pending]]=await execute('SELECT SUM(is_confirmed) active FROM sales_import_rows WHERE import_id=?',[id]);assert.equal(Number(pending.active),0)
   const [[active]]=await execute("SELECT COUNT(*) total FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id WHERE i.company_id=1 AND r.client_code='A' AND r.delivery_note_number='100' AND YEAR(r.delivery_date)=2026 AND r.is_confirmed=TRUE");assert.equal(active.total,1)
  })
  await t.test('concurrent identical uploads activate a single copy of the note',async()=>{
   const ids=await Promise.all([preview([line('CONCURRENT')]),preview([line('CONCURRENT')])])
   const results=await Promise.all(ids.map(id=>confirmImport(id,1)))
   assert.equal(results.reduce((total,result)=>total+result.confirmedCount,0),1)
   assert.equal(results.reduce((total,result)=>total+result.discardedCount,0),1)
  })
  await t.test('concurrent changed PDFs leave exactly one complete current version',async()=>{
   const original=await preview([line('CHANGED_CONCURRENT'),line('CHANGED_CONCURRENT',20,{productCode:'P2'})]);await confirmImport(original,1)
   const first=await preview([line('CHANGED_CONCURRENT',55)]),second=await preview([line('CHANGED_CONCURRENT',66)])
   const results=await Promise.all([confirmImport(first,1),confirmImport(second,1)]);assert.ok(results.every(result=>result.replacedNotes===1))
   const [active]=await execute("SELECT r.unit_price FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id WHERE i.company_id=1 AND r.delivery_note_number='CHANGED_CONCURRENT' AND r.is_confirmed=TRUE")
   assert.equal(active.length,1);assert.ok([55,66].includes(Number(active[0].unit_price)))
  })
  await t.test('the supplied real PDF can be confirmed twice without changing its active sales',{skip:!process.env.TEST_SALES_IMPORT_PDF},async()=>{
   const buffer=readFileSync(process.env.TEST_SALES_IMPORT_PDF),source=parseDeliveryNotePages((await extractPdf(buffer)).pages)
   for(const row of source.rows){row.lineHash=buildLineHash({...row,companyName:'1'});row.identityHash=buildLineIdentityHash({...row,companyName:'1'})}
   const file={buffer,originalname:'provided.pdf'},user={id:1,company_id:1}
   const first=(await previewFile(file,user,'127.0.0.1')).id;const result=await confirmImport(first,1);assert.equal(result.confirmedCount,source.rows.length)
   const [before]=await execute('SELECT * FROM sales_import_rows WHERE import_id=? ORDER BY id',[first])
   const repeatedPreview=await previewFile(file,user,'127.0.0.1');assert.equal(repeatedPreview.comparison.unchangedRows,source.rows.length);assert.equal(repeatedPreview.comparison.replacedNotes,0)
   const repeated=await confirmImport(repeatedPreview.id,1);assert.equal(repeated.confirmedCount,0);assert.equal(repeated.replacedCount,0);assert.equal(repeated.discardedCount,source.rows.length)
   const [after]=await execute('SELECT * FROM sales_import_rows WHERE import_id=? ORDER BY id',[first]);assert.deepEqual(after,before)
  })
 }finally{
  Object.assign(pool,originals)
  for(const table of created.reverse())await connection.query('DROP TABLE '+table)
  connection.release();await pool.end()
 }
})
