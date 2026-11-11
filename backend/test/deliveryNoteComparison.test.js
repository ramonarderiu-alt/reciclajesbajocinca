import test from 'node:test'
import assert from 'node:assert/strict'
import {compareDeliveryNotes,deliveryNoteLineSignature} from '../src/services/deliveryNoteComparison.js'

const row=changes=>({id:1,client_code:'A',client_name:'Client A',delivery_note_number:'100',delivery_date:'2026-01-02',centre_name:'Centre',external_code:'R1',product_code:'P1',concept:'Article',waste_code:'020103',vehicle_plate:'1234ABC',trailer_plate:'R001',quantity:'2.0000',unit_price:'10.0000',taxable_base:'20.00',vat_amount:null,total_amount:'20.00',...changes})

test('omet un albarà idèntic encara que canviïn l’ordre, els IDs o la representació decimal',()=>{
 const existing=[row(),row({id:2,product_code:'P2',quantity:'-1.2000',total_amount:'-12.00'})]
 const incoming=[{...existing[1],id:20,quantity:'-1.2'},{...existing[0],id:10,unit_price:'10',quantity:'2'}]
 const plan=compareDeliveryNotes(incoming,existing,1)
 assert.equal(plan.notes[0].action,'unchanged')
 assert.equal(plan.summary.unchangedNotes,1);assert.equal(plan.summary.unchangedRows,2)
 assert.equal(plan.summary.replacedRows,0)
})

test('qualsevol camp de contingut diferent substitueix totes les línies de l’albarà',()=>{
 const changes={client_name:'Client corregit',delivery_date:'2026-02-03',centre_name:'Altre centre',external_code:'R2',product_code:'P2',concept:'Article corregit',waste_code:'020104',vehicle_plate:'5678DEF',trailer_plate:'R002',quantity:'3',unit_price:'11',taxable_base:'22',vat_amount:'0.00',total_amount:'22'}
 for(const [field,value]of Object.entries(changes)){
  const plan=compareDeliveryNotes([row({[field]:value})],[row(),row({id:2,product_code:'P3'})],1)
  assert.equal(plan.notes[0].action,'replace',field)
  assert.equal(plan.summary.replacedRows,2,field)
  assert.equal(plan.summary.replacementRows,1,field)
 }
})

test('afegir, eliminar o repetir una línia és un canvi de l’albarà complet',()=>{
 for(const [incoming,existing]of [[[row()],[row(),row()] ],[[row(),row()],[row()]],[[row({quantity:'4'})],[row(),row()]]]){
  assert.equal(compareDeliveryNotes(incoming,existing,1).notes[0].action,'replace')
 }
 assert.equal(compareDeliveryNotes([row(),row()],[row(),row()],1).notes[0].action,'unchanged')
})

test('la coincidència respecta client, número, any i agrupacions de l’empresa',()=>{
 for(const changed of [{client_code:'B'},{delivery_note_number:'101'},{delivery_date:'2025-01-02'}]){
  const plan=compareDeliveryNotes([row()],[row(changed)],1)
  assert.equal(plan.notes[0].action,'new');assert.equal(plan.summary.replacedRows,0)
 }
 const incoming=row({client_code:'4300700689'}),existing=row({client_code:'4300200131'})
 assert.equal(compareDeliveryNotes([incoming],[existing],1).notes[0].action,'replace')
 assert.equal(compareDeliveryNotes([incoming],[existing],2).notes[0].action,'new')
})

test('compara decimals exactes a la precisió de la base, inclosos zero, rectificacions i IVA desconegut',()=>{
 assert.equal(deliveryNoteLineSignature(row({quantity:'2.00000',unit_price:'1.23456'})),deliveryNoteLineSignature(row({quantity:'2',unit_price:'1.2346'})))
 assert.equal(deliveryNoteLineSignature(row({quantity:'-0.0000'})),deliveryNoteLineSignature(row({quantity:'0'})))
 assert.notEqual(deliveryNoteLineSignature(row({vat_amount:null})),deliveryNoteLineSignature(row({vat_amount:'0'})))
 assert.equal(compareDeliveryNotes([row({unit_price:'99999999999999.1234'})],[row({unit_price:'99999999999999.1233'})],1).notes[0].action,'replace')
})

test('no substitueix albarans absents del PDF i rebutja claus incompletes',()=>{
 const plan=compareDeliveryNotes([row()],[row(),row({delivery_note_number:'OTHER'})],1)
 assert.equal(plan.notes.length,1);assert.equal(plan.summary.unchangedNotes,1);assert.equal(plan.summary.replacedRows,0)
 for(const changed of [{client_code:null},{delivery_note_number:''},{delivery_date:null},{delivery_date:'2026-02-30'}])assert.throws(()=>compareDeliveryNotes([row(changed)],[],1),error=>error.code==='INCOMPLETE_DELIVERY_NOTE')
})
