import {AppError} from '../lib/errors.js'
import {salesClientGroup} from './salesClientGroups.js'

const text=value=>value==null?'':String(value).trim().replace(/\s+/g,' ')
const field=(row,snake,camel=snake)=>row[snake]!==undefined?row[snake]:row[camel]
const date=row=>{
 const value=field(row,'delivery_date','date')
 return value instanceof Date?value.toISOString().slice(0,10):text(value).slice(0,10)
}
// Compare the precision stored in MySQL, without floating point rounding.
function decimal(value,scale){
 if(value==null||value==='')return null
 const match=/^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value).trim())
 if(!match)throw new AppError(422,'INVALID_IMPORT_NUMBER','Reviseu els imports i les quantitats de la importació')
 const fraction=match[3]||''
 let units=BigInt(match[2])*10n**BigInt(scale)+BigInt((fraction+'0'.repeat(scale)).slice(0,scale))
 if(Number(fraction[scale]||0)>=5)units++
 return (match[1]?-units:units).toString()
}
export function deliveryNoteKey(row,companyId){
 const client=text(field(row,'client_code','clientCode')).toUpperCase(),number=text(field(row,'delivery_note_number','deliveryNoteNumber')),day=date(row)
 if(!client||!number||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day){
  throw new AppError(422,'INCOMPLETE_DELIVERY_NOTE','Per comparar els albarans cal que totes les línies tinguin client, número d’albarà i data vàlida.')
 }
 return JSON.stringify([salesClientGroup(companyId,client)?.clientCode||client,number.toUpperCase(),day.slice(0,4)])
}
export function deliveryNoteLineSignature(row){
 const texts=[['client_code','clientCode'],['client_name','clientName'],['delivery_note_number','deliveryNoteNumber'],['centre_name','centreName'],['external_code','externalCode'],['product_code','productCode'],['concept'],['waste_code','wasteCode'],['vehicle_plate','vehiclePlate'],['trailer_plate','trailerPlate']]
 return JSON.stringify([date(row),...texts.map(([snake,camel])=>text(field(row,snake,camel))),
  decimal(row.quantity,4),decimal(field(row,'unit_price','unitPrice'),4),decimal(field(row,'taxable_base','taxableBase'),2),decimal(field(row,'vat_amount','vatAmount'),2),decimal(field(row,'total_amount','totalAmount'),2)])
}
export function compareDeliveryNotes(incoming,existing,companyId){
 const groups=new Map()
 for(const row of incoming){const key=deliveryNoteKey(row,companyId);if(!groups.has(key))groups.set(key,{key,incoming:[],existing:[]});groups.get(key).incoming.push(row)}
 for(const row of existing){const key=deliveryNoteKey(row,companyId);groups.get(key)?.existing.push(row)}
 const notes=[...groups.values()].map(group=>{
  const before=group.existing.map(deliveryNoteLineSignature).sort(),after=group.incoming.map(deliveryNoteLineSignature).sort()
  const action=!before.length?'new':JSON.stringify(before)===JSON.stringify(after)?'unchanged':'replace'
  return {...group,action}
 })
 const summary={newNotes:0,unchangedNotes:0,replacedNotes:0,newRows:0,unchangedRows:0,replacementRows:0,replacedRows:0}
 for(const note of notes){
  if(note.action==='new'){summary.newNotes++;summary.newRows+=note.incoming.length}
  else if(note.action==='unchanged'){summary.unchangedNotes++;summary.unchangedRows+=note.incoming.length}
  else{summary.replacedNotes++;summary.replacementRows+=note.incoming.length;summary.replacedRows+=note.existing.length}
 }
 return {notes,summary}
}
