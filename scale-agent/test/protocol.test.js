import test from 'node:test'
import assert from 'node:assert/strict'
import {createDecoder} from '../src/protocol.js'
const base={framing:'CRLF',length:4,parser:'disabled',pattern:'^([0-9]+(?:[.,][0-9]+)?) kg$',unit:'kg',stablePattern:''}
test('unknown protocol never fabricates a weight and preserves ASCII/HEX',()=>{const frames=[],decode=createDecoder(base,f=>frames.push(f));decode(Buffer.from('1250 kg\r'));assert.equal(frames.length,0);decode(Buffer.from('\n'));assert.equal(frames[0].valid,false);assert.equal(frames[0].weight,null);assert.equal(frames[0].hex,'31323530206b67')})
test('configurable delimiters and split chunks',()=>{for(const [framing,sep] of [['CR','\r'],['LF','\n'],['CRLF','\r\n']]){const frames=[],decode=createDecoder({...base,framing,parser:'regex'},f=>frames.push(f));const data=Buffer.from('1250,5 kg'+sep+'bad'+sep);for(const byte of data)decode(Buffer.from([byte]));assert.equal(frames[0].weight,1250.5);assert.equal(frames[1].valid,false)}})
test('fixed length and bounded unframed input',()=>{const frames=[],decode=createDecoder({...base,framing:'fixed'},f=>frames.push(f));decode(Buffer.from('12345678'));assert.equal(frames.length,2);assert.throws(()=>createDecoder(base,()=>{})(Buffer.alloc(8193)))})
test('empty captures never become a zero weight',()=>{const frames=[],decode=createDecoder({...base,parser:'regex',pattern:'^(.*)$'},f=>frames.push(f));decode(Buffer.from('\r\n'));assert.equal(frames[0].valid,false);assert.equal(frames[0].weight,null)})
