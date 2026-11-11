import crypto from 'node:crypto'
import path from 'node:path'
import { AppError,notFound } from '../lib/errors.js'
import { extractPdf } from './pdfExtractionService.js'
import { parseDeliveryNotePages,buildLineHash,buildLineIdentityHash } from './deliveryNoteParser.js'
import * as repository from '../repositories/salesImportRepository.js'
import { audit } from '../repositories/dataRepository.js'
import {compareDeliveryNotes} from './deliveryNoteComparison.js'

export async function preview(file,user,ip,mode='append'){
 if(!file)throw new AppError(422,'FILE_REQUIRED','Seleccioneu un fitxer PDF')
 const hash=crypto.createHash('sha256').update(file.buffer).digest('hex')
 const extracted=await extractPdf(file.buffer),parsed=parseDeliveryNotePages(extracted.pages)
 if(!parsed.rows.length)throw new AppError(422,'NO_ROWS','No s’han detectat línies d’albarà en aquest PDF')
 compareDeliveryNotes(parsed.rows,[],user.company_id)
 for(const row of parsed.rows){
  const identified={...row,companyName:String(user.company_id)}
  row.lineHash=buildLineHash(identified);row.identityHash=buildLineIdentityHash(identified)
 }
 const filename=path.basename(file.originalname).replace(/[^\wÀ-ÿ .()\-]/g,'_').slice(0,255)
 const id=await repository.createPreview({companyId:user.company_id,userId:user.id,filename,fileHash:hash,parsed,mode})
 await audit({userId:user.id,action:'preview',entity:'sales_import',recordId:id,newValues:{filename,mode,fileHash:hash,pages:parsed.pageCount,clients:parsed.clients.length,rows:parsed.rows.length},ip})
 return repository.importDetail(id)
}
export async function detail(id){const value=await repository.importDetail(id);if(!value)throw notFound('Importació no trobada');return value}
export async function updateRow(importId,rowId,fields,user,ip){await repository.updateImportRow(importId,rowId,fields,user.company_id);await audit({userId:user.id,action:'update',entity:'sales_import_row',recordId:rowId,newValues:fields,ip});return detail(importId)}
export async function confirm(id,user,ip){const result=await repository.confirmImport(id,user.company_id);if(!result)throw new AppError(409,'IMPORT_LOCKED','La importació no està pendent de revisió');await audit({userId:user.id,action:'confirm',entity:'sales_import',recordId:id,newValues:result,ip});return detail(id)}
export async function cancel(id,user,ip){const ok=await repository.cancelImport(id);if(!ok)throw new AppError(409,'IMPORT_LOCKED','La importació no es pot anul·lar');await audit({userId:user.id,action:'cancel',entity:'sales_import',recordId:id,ip})}
