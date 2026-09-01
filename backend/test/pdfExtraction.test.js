import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {extractPdf} from '../src/services/pdfExtractionService.js'
import {parseDeliveryNotePages} from '../src/services/deliveryNoteParser.js'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
test('rebutja un fitxer que no és PDF',async()=>await assert.rejects(()=>extractPdf(Buffer.from('not a pdf')),error=>error.code==='INVALID_PDF'))
test('rebutja un PDF sense capa de text',async()=>await assert.rejects(()=>extractPdf(Buffer.from('%PDF-1.4\n%%EOF')),error=>['UNREADABLE_PDF','PDF_WITHOUT_TEXT'].includes(error.code)))
test('integra el PDF de mostra complet',async()=>{const extracted=await extractPdf(fs.readFileSync(path.join(root,'test-compostatge.pdf'))),result=parseDeliveryNotePages(extracted.pages);assert.equal(extracted.pageCount,10);assert.equal(result.companyName,'RECICLAJES DEL BAJO CINCA, S.L.');assert.equal(result.clients.length,4);assert.equal(result.rows.length,261);assert.ok(result.rows.every(row=>row.clientCode));assert.ok(result.rows.some(row=>row.wasteCode==='020103'));assert.ok(result.rows.every(row=>!/^Totales|^Total acumulado/.test(row.deliveryNoteNumber)))})
