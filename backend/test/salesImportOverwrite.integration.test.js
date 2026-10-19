import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {pool} from '../src/config/db.js'
import {createPreview,confirmImport,findImportByHash} from '../src/repositories/salesImportRepository.js'

// Opt-in MySQL tests use isolated fixture tables, never application sales.
test('importació habitual i sobreescriptura d’albarans en MySQL',{skip:process.env.TEST_SALES_IMPORT_DB!=='true'},async t=>{
 const connection=await pool.getConnection(),prefix='test_import_'+crypto.randomBytes(6).toString('hex')+'_';
 const tables=['companies','sales_imports','sales_import_clients','sales_import_rows','sales_import_issues'];
 const rewrite=sql=>sql.replace(/\b(companies|sales_imports|sales_import_clients|sales_import_rows|sales_import_issues)\b/g,name=>prefix+name);
 const execute=(sql,params)=>connection.execute(rewrite(sql),params);
 const originals={getConnection:pool.getConnection,execute:pool.execute};
 const created=[];
 try{
  for(const table of tables){
   await connection.query(table==='companies'?'CREATE TABLE '+prefix+table+' (id BIGINT UNSIGNED PRIMARY KEY) ENGINE=InnoDB':'CREATE TABLE '+prefix+table+' LIKE '+table);
   created.push(prefix+table);
  }
  await execute('INSERT INTO companies VALUES(1),(2)');
  pool.getConnection=async()=>({execute,beginTransaction:()=>connection.beginTransaction(),commit:()=>connection.commit(),rollback:()=>connection.rollback(),release(){}});
  pool.execute=execute;
  await execute("INSERT INTO sales_imports(id,company_id,imported_by,original_filename,file_hash,status) VALUES(1,1,1,'old.pdf',REPEAT('a',64),'completed'),(2,2,1,'other.pdf',REPEAT('b',64),'completed'),(3,1,1,'new.pdf',REPEAT('c',64),'pending_review')");
  await execute("UPDATE sales_imports SET import_mode='overwrite' WHERE id=3");
  const row=async(id,importId,client,note,date,confirmed,price=10)=>execute("INSERT INTO sales_import_rows(id,import_id,client_code,delivery_note_number,delivery_date,source_page,line_hash,identity_hash,is_confirmed,unit_price,quantity,total_amount) VALUES(?,?,?,?,?,1,LPAD(?,64,'0'),LPAD(?,64,'0'),?,?,2,?)",[id,importId,client,note,date,id,id,confirmed,price,price*2]);
  await row(1,1,'A','100','2026-01-01',true);
  await row(2,1,'A','100','2026-01-01',true); // old line absent from replacement
  await row(3,1,'A','101','2026-01-01',true); // other note
  await row(4,1,'B','100','2026-01-01',true); // other client
  await row(5,1,'A','100','2025-01-01',true); // other year
  await row(6,2,'A','100','2026-01-01',true); // other company
  await row(7,3,'A','100','2026-02-01',false,30); // corrected date, price and lines
  await row(8,3,'A','102','2026-02-01',false,40); // new note
  await t.test('la revisió no modifica les vendes i una altra empresa no pot confirmar',async()=>{
   assert.equal(await confirmImport(3,2),null);
   const [[counts]]=await execute('SELECT SUM(is_confirmed) active FROM sales_import_rows');assert.equal(Number(counts.active),6);
  });
  await t.test('substitueix albarans complets i conserva altres clients, anys i empreses',async()=>{
   assert.deepEqual(await confirmImport(3,1),{mode:'overwrite',confirmedCount:2,replacedCount:2,discardedCount:0,updatedCount:0});
   const [rows]=await execute('SELECT id,is_confirmed,discarded_reason,unit_price FROM sales_import_rows ORDER BY id');
   assert.deepEqual(rows.filter(r=>r.is_confirmed).map(r=>r.id),[3,4,5,6,7,8]);
   assert.ok(rows.slice(0,2).every(r=>r.discarded_reason==='replaced'));assert.equal(Number(rows[6].unit_price),30);
   assert.equal(await confirmImport(3,1),null);
  });
  await t.test('la mateixa petjada PDF admet noves revisions explícites',async()=>{
   const parsed={warnings:[],companyName:'Test',pageCount:1,clients:[],rows:[],totals:{taxableBase:0,vatAmount:0,totalAmount:0}};
   const input={companyId:1,userId:1,filename:'same.pdf',fileHash:'d'.repeat(64),parsed};
   const normal=await createPreview(input),first=await createPreview({...input,mode:'overwrite'}),second=await createPreview({...input,mode:'overwrite'});
   assert.ok(normal<first&&first<second);assert.equal((await findImportByHash(1,input.fileHash)).id,second);
   await assert.rejects(createPreview(input),{code:'ER_DUP_ENTRY'});
   await assert.rejects(confirmImport(first,1),{code:'INCOMPLETE_DELIVERY_NOTE'});
   const [[record]]=await execute('SELECT status FROM sales_imports WHERE id=?',[first]);assert.equal(record.status,'pending_review');
  });
  await t.test('una línia sense data impedeix tota la substitució',async()=>{
   await execute("INSERT INTO sales_imports(id,company_id,imported_by,original_filename,file_hash,status,import_mode) VALUES(100,1,1,'invalid.pdf',REPEAT('e',64),'pending_review','overwrite')");
   await row(100,100,'A','102',null,false);
   await assert.rejects(confirmImport(100,1),{code:'INCOMPLETE_DELIVERY_NOTE'});
   const [[r]]=await execute('SELECT is_confirmed FROM sales_import_rows WHERE id=8');assert.equal(r.is_confirmed,1);
  });
  await t.test('el mode habitual segueix descartant duplicats i completant preus zero',async()=>{
   await execute("INSERT INTO sales_imports(id,company_id,imported_by,original_filename,file_hash,status) VALUES(101,1,1,'append.pdf',REPEAT('f',64),'pending_review')");
   await row(101,101,'A','100','2026-02-01',false,99);
   await row(102,101,'A','101','2026-01-01',false,25);
   await execute("UPDATE sales_import_rows SET identity_hash=LPAD('7',64,'0') WHERE id=101");
   await execute("UPDATE sales_import_rows SET identity_hash=LPAD('3',64,'0') WHERE id=102");
   await execute('UPDATE sales_import_rows SET unit_price=0 WHERE id=3');
   assert.deepEqual(await confirmImport(101,1),{confirmedCount:0,discardedCount:1,updatedCount:1});
   const [rows]=await execute('SELECT id,unit_price FROM sales_import_rows WHERE id IN (3,7) ORDER BY id');assert.deepEqual(rows.map(r=>Number(r.unit_price)),[25,30]);
  });
  await t.test('si falla la confirmació final es reverteix tota la substitució',async()=>{
   await execute("INSERT INTO sales_imports(id,company_id,imported_by,original_filename,file_hash,status,import_mode) VALUES(102,1,1,'rollback.pdf',REPEAT('g',64),'pending_review','overwrite')");
   await row(103,102,'A','100','2026-02-01',false,1);
   pool.getConnection=async()=>({execute:(sql,params)=>{if(sql.startsWith('UPDATE sales_imports SET status='))throw Error('simulated write failure');return execute(sql,params)},beginTransaction:()=>connection.beginTransaction(),commit:()=>connection.commit(),rollback:()=>connection.rollback(),release(){}});
   await assert.rejects(confirmImport(102,1),/simulated write failure/);
   const [rows]=await execute('SELECT id,is_confirmed FROM sales_import_rows WHERE id IN (7,103) ORDER BY id');assert.deepEqual(rows.map(r=>r.is_confirmed),[1,0]);
  });
 }finally{
  Object.assign(pool,originals);
  for(const table of created.reverse())await connection.query('DROP TABLE '+table);
  connection.release();await pool.end();
 }
});
