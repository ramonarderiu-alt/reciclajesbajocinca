import test from 'node:test'
import assert from 'node:assert/strict'
import { requirePermission,requireAnyPermission } from '../src/middleware/auth.js'
test('permet una petició amb el permís requerit',()=>{let passed=false;requirePermission('users.manage')({user:{permissions:['users.manage']}},{},()=>{passed=true});assert.equal(passed,true)})
test('rebutja una petició sense permís',()=>{let error;requirePermission('users.manage')({user:{permissions:['users.view']}},{},value=>{error=value});assert.equal(error.status,403);assert.equal(error.code,'FORBIDDEN')})

test('permet valorar amb el permís específic o amb gestió de vendes, sense donar accés a altres gestions',()=>{
 for(const permissions of [['sales_ratings.manage'],['sales_clients.manage']]){
  let error='not-called'
  requireAnyPermission('sales_clients.manage','sales_ratings.manage')({user:{permissions}},{},value=>{error=value})
  assert.equal(error,undefined)
 }
 let error
 requirePermission('sales_clients.manage')({user:{permissions:['sales_clients.view','sales_ratings.manage']}},{},value=>{error=value})
 assert.equal(error.status,403)
 requireAnyPermission('sales_clients.manage','sales_ratings.manage')({user:{permissions:['sales_clients.view']}},{},value=>{error=value})
 assert.equal(error.status,403)
})
