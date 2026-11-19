import test from 'node:test'
import assert from 'node:assert/strict'
import {ticketSchema,tareSchema} from '../src/routes/scaleTicketRoutes.js'
import {pool} from '../src/config/db.js'
test.after(()=>pool.end())
const valid={centre:'Centre',client:'123',plate:' 1234 abc ',weight:25000,date:'2026-11-12T10:30:00.000Z'}
test('ticket requires centre, client, plate, positive finite gross weight and date with timezone',()=>{
 assert.equal(ticketSchema.parse(valid).plate,'1234 ABC')
 for(const change of [{centre:' '},{client:''},{plate:' '},{plate:'A'.repeat(31)},{weight:0},{weight:-1},{weight:Infinity},{date:'2026-11-12T10:30'},{unknown:true}])assert.equal(ticketSchema.safeParse({...valid,...change}).success,false)
})
test('tare accepts zero and rejects missing, negative or nonfinite weights and invalid dates',()=>{
 assert.equal(tareSchema.safeParse({weight:0,date:valid.date}).success,true)
 for(const weight of [undefined,-1,NaN,Infinity,'100'])assert.equal(tareSchema.safeParse({weight,date:valid.date}).success,false)
 assert.equal(tareSchema.safeParse({weight:100,date:'invalid'}).success,false)
})
