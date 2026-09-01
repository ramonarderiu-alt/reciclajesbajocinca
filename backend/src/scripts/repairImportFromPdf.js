import fs from 'node:fs'
import path from 'node:path'
import { pool,transaction } from '../config/db.js'
import { extractPdf } from '../services/pdfExtractionService.js'
import { parseDeliveryNotePages,buildLineHash } from '../services/deliveryNoteParser.js'

const importId=Number(process.argv[2]),pdfPath=process.argv[3]
if(!Number.isInteger(importId)||!pdfPath)throw new Error('Ús: node src/scripts/repairImportFromPdf.js <importId> <pdfPath>')
const parsed=parseDeliveryNotePages((await extractPdf(fs.readFileSync(path.resolve(pdfPath)))).pages)
const [stored]=await pool.execute('SELECT id,client_code,delivery_note_number,product_code,concept FROM sales_import_rows WHERE import_id=? ORDER BY source_page,id',[importId])
if(stored.length!==parsed.rows.length)throw new Error(`El PDF té ${parsed.rows.length} línies però la importació en té ${stored.length}`)
for(let index=0;index<stored.length;index++){const db=stored[index],row=parsed.rows[index];if(db.client_code!==row.clientCode||db.delivery_note_number!==row.deliveryNoteNumber||String(db.product_code||'')!==String(row.productCode||''))throw new Error(`La línia ${index+1} no coincideix; reparació cancel·lada`)}
const [[record]]=await pool.execute('SELECT company_id FROM sales_imports WHERE id=?',[importId]);if(!record)throw new Error('Importació no trobada')
await transaction(async connection=>{for(let index=0;index<stored.length;index++){const row=parsed.rows[index],hash=buildLineHash({...row,companyName:String(record.company_id)});await connection.execute('UPDATE sales_import_rows SET quantity=?,unit_price=?,taxable_base=?,vat_amount=?,total_amount=?,warnings=?,confidence=?,line_hash=? WHERE id=?',[row.quantity,row.unitPrice,row.taxableBase,row.vatAmount,row.totalAmount,JSON.stringify(row.warnings),row.confidence,hash,stored[index].id])}await connection.execute('UPDATE sales_imports SET taxable_base_total=?,vat_total=?,total_amount=?,warnings=? WHERE id=?',[parsed.totals.taxableBase,parsed.totals.vatAmount,parsed.totals.totalAmount,JSON.stringify(parsed.warnings),importId])})
console.log(JSON.stringify({importId,rows:parsed.rows.length,totals:parsed.totals}))
await pool.end()
