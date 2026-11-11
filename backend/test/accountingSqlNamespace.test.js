import test from 'node:test'
import assert from 'node:assert/strict'
import {accountingSql,accountingDatabase} from '../src/repositories/accountingSqlNamespace.js'

test('separa taules i manté columnes, àlies, comentaris i valors',()=>{
 const sql="SELECT companies.id, r.accounts AS accounts, 'FROM companies' AS note FROM companies JOIN accounts r ON r.company_id=companies.id WHERE r.description=? /* JOIN users */"
 assert.equal(accountingSql(sql),"SELECT accounting_companies.id, r.accounts AS accounts, 'FROM companies' AS note FROM accounting_companies JOIN accounting_accounts r ON r.company_id=accounting_companies.id WHERE r.description=? /* JOIN users */")
 assert.equal(accountingSql('SELECT * FROM `journal_entries` WHERE id IN (SELECT entry_id FROM journal_lines)'), 'SELECT * FROM `accounting_journal_entries` WHERE id IN (SELECT entry_id FROM accounting_journal_lines)')
 assert.equal(accountingSql('SHOW COLUMNS FROM company_documents'),'SHOW COLUMNS FROM accounting_company_documents')
 assert.equal(accountingSql('SELECT 1 AS accounts'),'SELECT 1 AS accounts')
})

test('DDL, claus foranes, checks i triggers queden al mateix espai de noms',()=>{
 assert.equal(accountingSql('CREATE TABLE IF NOT EXISTS accounts (company_id INT, CONSTRAINT fk_accounts_company FOREIGN KEY(company_id) REFERENCES companies(id))'),'CREATE TABLE IF NOT EXISTS accounting_accounts (company_id INT, CONSTRAINT fk_accounts_company FOREIGN KEY(company_id) REFERENCES accounting_companies(id))')
 assert.equal(accountingSql('ALTER TABLE journal_lines DROP CHECK journal_lines_chk_1'),'ALTER TABLE accounting_journal_lines DROP CHECK accounting_journal_lines_chk_1')
 assert.equal(accountingSql('CREATE TRIGGER IF NOT EXISTS exercise_before_insert BEFORE INSERT ON accounting_exercises FOR EACH ROW SELECT id FROM companies'),'CREATE TRIGGER IF NOT EXISTS accounting_exercise_before_insert BEFORE INSERT ON accounting_accounting_exercises FOR EACH ROW SELECT id FROM accounting_companies')
 assert.equal(accountingSql('INSERT INTO schema_migrations(name) VALUES(?)'),'INSERT INTO accounting_schema_migrations(name) VALUES(?)')
})

test('la migració de status inspecciona la taula correcta i prepara DDL amb prefix',()=>{
 assert.equal(accountingSql("SELECT COUNT(*) FROM information_schema.columns WHERE table_name='journal_entries' AND column_name='status'"),"SELECT COUNT(*) FROM information_schema.columns WHERE table_name='accounting_journal_entries' AND column_name='status'")
 assert.equal(accountingSql('SET @sql="ALTER TABLE journal_entries ADD COLUMN status INT"'),'SET @sql="ALTER TABLE accounting_journal_entries ADD COLUMN status INT"')
})

test('el pool transforma també connexions transaccionals i no modifica els paràmetres',async()=>{
 const calls=[],values=['companies',"UPDATE accounts SET description='x'"]
 const connection={async execute(sql,params){calls.push({sql,params});return [[]]},async beginTransaction(){calls.push('begin')},release(){calls.push('release')}}
 const pool=accountingDatabase({getConnection:async()=>connection,query:async(sql,params)=>calls.push({sql,params})})
 const db=await pool.getConnection()
 await db.beginTransaction()
 await db.execute('INSERT INTO accounts(description,code) VALUES(?,?)',values)
 db.release()
 await pool.query({sql:'SELECT * FROM companies',timeout:1000},values)
 assert.deepEqual(calls,['begin',{sql:'INSERT INTO accounting_accounts(description,code) VALUES(?,?)',params:values},'release',{sql:{sql:'SELECT * FROM accounting_companies',timeout:1000},params:values}])
 assert.equal(accountingDatabase(db),db)
})
