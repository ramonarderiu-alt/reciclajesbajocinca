import test from 'node:test'
import assert from 'node:assert/strict'
import { requirePermission } from '../src/middleware/auth.js'
test('permet una petició amb el permís requerit',()=>{let passed=false;requirePermission('users.manage')({user:{permissions:['users.manage']}},{},()=>{passed=true});assert.equal(passed,true)})
test('rebutja una petició sense permís',()=>{let error;requirePermission('users.manage')({user:{permissions:['users.view']}},{},value=>{error=value});assert.equal(error.status,403);assert.equal(error.code,'FORBIDDEN')})
