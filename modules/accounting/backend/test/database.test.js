import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from '../src/db/mysql.js';
import {config} from '../src/config.js';
import {createExerciseService} from '../src/services/exercises.js';

test('MySQL: constraints and transactionally validated exercise periods without privileged triggers',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database);let companyId;
 try{
  const [company]=await pool.execute('INSERT INTO companies(name) VALUES(?)',['Period validation test']);companyId=company.insertId;
  const service=createExerciseService(pool,companyId);
  const first=await service.create({name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'});
  await assert.rejects(service.create({name:'Overlap',start_date:'2026-12-31',end_date:'2027-01-10'}),error=>error.code==='EXERCISE_PERIOD_OVERLAP');
  await assert.rejects(service.create({name:'Invalid',start_date:'2028-12-31',end_date:'2028-01-01'}),error=>error.code==='INVALID_EXERCISE_PERIOD');
  await assert.rejects(pool.execute("INSERT INTO accounting_exercises(company_id,name,start_date,end_date,status,is_default) VALUES(?,'Second default','2027-01-01','2027-12-31','open',1)",[companyId]));
  await assert.rejects(pool.execute("INSERT INTO accounting_exercises(company_id,name,start_date,end_date,status,is_default) VALUES(?,'Closed default','2029-01-01','2029-12-31','closed',1)",[companyId]));
  await service.create({name:'2027',start_date:'2027-01-01',end_date:'2027-12-31',is_default:false});
  await assert.rejects(pool.execute('DELETE FROM companies WHERE id=?',[companyId]));
  assert.equal((await service.list()).length,2);assert.ok(first.id);
 }finally{
  if(companyId){await pool.execute('DELETE FROM accounting_exercises WHERE company_id=?',[companyId]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});

test('MySQL: concurrent exercise creation cannot commit overlapping periods without triggers',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database);let companyId;
 try{
  const [company]=await pool.execute('INSERT INTO companies(name) VALUES(?)',['Concurrent period test']);companyId=company.insertId;
  const service=createExerciseService(pool,companyId);
  const results=await Promise.allSettled([
   service.create({name:'First',start_date:'2026-01-01',end_date:'2026-12-31'}),
   service.create({name:'Overlap',start_date:'2026-06-01',end_date:'2027-05-31'})
  ]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.code,'EXERCISE_PERIOD_OVERLAP');
  assert.equal((await service.list()).length,1);
 }finally{
  if(companyId){await pool.execute('DELETE FROM accounting_exercises WHERE company_id=?',[companyId]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
