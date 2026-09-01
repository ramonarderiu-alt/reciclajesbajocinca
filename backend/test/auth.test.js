import test from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
test('un access token signat conté subjecte i tipus',()=>{const token=jwt.sign({sub:'42',type:'access'},env.JWT_ACCESS_SECRET,{expiresIn:'1m'});const decoded=jwt.verify(token,env.JWT_ACCESS_SECRET);assert.equal(decoded.sub,'42');assert.equal(decoded.type,'access')})
test('un token manipulat és rebutjat',()=>{const token=jwt.sign({sub:'42'},env.JWT_ACCESS_SECRET);assert.throws(()=>jwt.verify(token+'x',env.JWT_ACCESS_SECRET))})
