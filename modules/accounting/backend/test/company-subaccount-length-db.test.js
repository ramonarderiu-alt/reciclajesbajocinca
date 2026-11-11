import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import mysql from '../src/db/mysql.js';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createJournalImportService} from '../src/services/journal-import.js';
import {extractJournalPdf} from '../src/services/pdf-journal.js';

test('MySQL: subaccount length can change only before creating accounts, including concurrent requests',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),companies=createCompanyService(pool),ids=[];
 const create=async()=>{const company=await companies.createCompany({name:'Length test '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);return company;};
 try{
  await t.test('an empty company accepts ten digits and becomes locked after its first account',async()=>{
   const company=await create();assert.equal(company.can_change_subaccount_length,true);
   const changed=await companies.updateCompany(company.id,{name:company.name,subaccount_length:10});
   assert.equal(changed.subaccount_length,10);assert.equal(changed.can_change_subaccount_length,true);
   const accounting=createAccountingService(pool,company.id);
   const account=await accounting.createAccount({code:'4300.000001',description:'Test customer'});
   assert.equal(account.code,'4300000001');
   assert.equal((await companies.getCompany(company.id)).can_change_subaccount_length,false);
   await assert.rejects(companies.updateCompany(company.id,{name:company.name,subaccount_length:8}),error=>error.code==='COMPANY_ACCOUNT_LENGTH_LOCKED');
   assert.equal((await companies.getCompany(company.id)).subaccount_length,10);
   assert.equal((await accounting.getAccount(account.id)).code,'4300000001');
   assert.equal((await companies.updateCompany(company.id,{name:company.name,subaccount_length:10})).subaccount_length,10);
  });
  await t.test('account creation and a length change share the same company lock',async()=>{
   const company=await create(),accounting=createAccountingService(pool,company.id);
   const results=await Promise.allSettled([
    companies.updateCompany(company.id,{name:company.name,subaccount_length:10}),
    accounting.createAccount({code:'4300.0001',description:'Concurrent customer'})
   ]);
   assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
   const saved=await companies.getCompany(company.id),accounts=await accounting.listAccounts({kind:'subaccount'});
   if(accounts.length){assert.equal(saved.subaccount_length,8);assert.equal(accounts[0].code.length,8);}
   else assert.equal(saved.subaccount_length,10);
  });
 }finally{
  for(const companyId of ids){
   const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);
   for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);
   await pool.execute('DELETE FROM accounting_exercises WHERE company_id=?',[companyId]);
   await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
  }
  await pool.end();
 }
});

test('MySQL: provided journal imports completely after configuring its subaccount length',{skip:process.env.TEST_MYSQL!=='1'||!process.env.TEST_LISTADO_JOURNAL_PDF},async()=>{
 const pool=mysql.createPool(config.database),companies=createCompanyService(pool);let companyId;
 try{
  const buffer=readFileSync(process.env.TEST_LISTADO_JOURNAL_PDF),source=await extractJournalPdf(buffer);
  const company=await companies.createCompany({name:source.source_company,exercise:{name:'2026',start_date:source.start_date,end_date:source.end_date}});companyId=company.id;
  const [[exercise]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[companyId]);
  await companies.updateCompany(companyId,{name:company.name,subaccount_length:source.subaccount_length});
  const service=createJournalImportService(pool,companyId),preview=await service.preview(buffer,exercise.id,'provided-journal.pdf');
  const saved=await service.commit(preview.token);
  assert.equal(saved.entries,source.totals.entries);assert.equal(saved.lines,source.totals.lines);
  assert.equal(saved.debit,source.totals.debit);assert.equal(saved.credit,source.totals.credit);
  assert.equal((await createAccountingService(pool,companyId).listAccounts({kind:'subaccount'})).length,source.totals.accounts);
  assert.equal((await service.commit(preview.token)).replayed,true);
  assert.equal((await companies.getCompany(companyId)).can_change_subaccount_length,false);
 }finally{
  if(companyId){
   for(const table of ['journal_lines','journal_entries','journal_imports'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
   const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);
   for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);
   await pool.execute('DELETE FROM accounting_exercises WHERE company_id=?',[companyId]);
   await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
  }
  await pool.end();
 }
});
