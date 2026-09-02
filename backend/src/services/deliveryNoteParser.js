import crypto from 'node:crypto'

export function parseEuropeanDecimal(value) {
  if (value == null || String(value).trim() === '') return null
  const numeric=String(value).trim().match(/^-?[\d.]+(?:,\d+)?/)?.[0]
  if(!numeric)return null
  const normalized=numeric.replace(/\s/g,'').replace(/\./g,'').replace(',','.')
  return /^-?\d+(\.\d+)?$/.test(normalized)?normalized:null
}
export function parseSpanishDate(value) {
  const match=/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(String(value||'').trim());if(!match)return null
  const year=match[3].length===2?2000+Number(match[3]):Number(match[3]),month=Number(match[2]),day=Number(match[1]);const date=new Date(Date.UTC(year,month-1,day))
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?`${year}-${match[2]}-${match[1]}`:null
}
export function normalizePlate(value){return value?String(value).toUpperCase().replace(/[^A-Z0-9]/g,''):null}
const scaled=(value,scale=2)=>{if(value==null)return null;const text=String(value),negative=text.startsWith('-'),unsigned=negative?text.slice(1):text,[whole,fraction='']=unsigned.split('.'),result=BigInt(whole)*10n**BigInt(scale)+BigInt((fraction+'0'.repeat(scale)).slice(0,scale));return negative?-result:result}
const cents=value=>scaled(value,2)
const formatCents=value=>`${value<0n?'-':''}${String(value<0n?-value:value).padStart(3,'0').slice(0,-2)}.${String(value<0n?-value:value).padStart(2,'0').slice(-2)}`
const near=(a,b,tolerance=2n)=>a!=null&&b!=null&&(a>b?a-b:b-a)<=tolerance
const valueAt=(items,min,max)=>items.filter(i=>i.x>=min&&i.x<max).map(i=>i.text).join(' ').trim()||null
const canonicalDecimal=value=>{if(value==null||value==='')return'';let text=String(value).trim(),sign='';if(text.startsWith('-')){sign='-';text=text.slice(1)}const [whole='0',fraction='']=text.split('.'),cleanWhole=whole.replace(/^0+(?=\d)/,'')||'0',cleanFraction=fraction.replace(/0+$/,'');return sign+cleanWhole+(cleanFraction?'.'+cleanFraction:'')}
const identityParts=row=>[row.companyName,row.clientCode,row.deliveryNoteNumber,row.date,row.productCode,row.concept].map(v=>String(v||'').trim().replace(/\s+/g,' ').toUpperCase()).concat([row.quantity].map(canonicalDecimal))
export const buildLineIdentityHash=row=>crypto.createHash('sha256').update(identityParts(row).join('|')).digest('hex')
export const buildLineHash=row=>crypto.createHash('sha256').update(identityParts(row).concat([row.unitPrice,row.taxableBase,row.vatAmount,row.totalAmount].map(canonicalDecimal)).join('|')).digest('hex')

export function itemsToRows(items){const rows=[];for(const item of items.filter(i=>i.text?.trim())){const y=Math.round(item.y);let row=rows.find(r=>Math.abs(r.y-y)<=2);if(!row){row={y,items:[]};rows.push(row)}row.items.push({...item,x:Math.round(item.x)})}return rows.sort((a,b)=>b.y-a.y).map(r=>({...r,items:r.items.sort((a,b)=>a.x-b.x),text:r.items.map(i=>i.text).join(' ').trim()}))}

export function parseDeliveryNotePages(pages){
  const result={companyName:null,pageCount:pages.length,clients:new Map(),rows:[],warnings:[],pageTotals:[]};let activeClient=null,lastRow=null
  for(const page of pages){const rows=itemsToRows(page.items);for(const visual of rows){const text=visual.text
    const company=text.match(/^EMPRESA:\s*(.+)$/i);if(company&&!result.companyName)result.companyName=company[1].trim()
    if(/RESUMEN DE ALBARANES|^Albarán\b|^-?\s*Página\s+\d+|^e$/i.test(text))continue
    const first=valueAt(visual.items,0,68),name=valueAt(visual.items,68,410)
    if(first&&/^\d{8,12}$/.test(first)&&name&&!/^\d/.test(name)){activeClient={clientCode:first,clientName:name.replace(/\s+/g,' ').trim()};result.clients.set(first,activeClient);lastRow=null;continue}
    if(/^Totales\s+/i.test(text)){const amounts=visual.items.filter(i=>i.x>=540).map(i=>parseEuropeanDecimal(i.text)).filter(Boolean);if(activeClient)activeClient.detectedSubtotal={quantity:amounts[0]||null,taxableBase:amounts[1]||null,vatAmount:amounts[2]||null,totalAmount:amounts[3]||null};lastRow=null;continue}
    if(/^Total acumulado/i.test(text)){result.pageTotals.push({page:page.pageNumber,rawText:text,taxableBase:parseEuropeanDecimal(valueAt(visual.items,590,675)),vatAmount:parseEuropeanDecimal(valueAt(visual.items,675,750)),totalAmount:parseEuropeanDecimal(valueAt(visual.items,750,850))});lastRow=null;continue}
    const delivery=valueAt(visual.items,0,77),dateRaw=valueAt(visual.items,77,125)
    if(delivery&&dateRaw&&/^\d{2}\/\d{2}\/\d{2,4}$/.test(dateRaw)){
      const row={clientCode:activeClient?.clientCode||null,clientName:activeClient?.clientName||null,deliveryNoteNumber:delivery,date:parseSpanishDate(dateRaw),externalCode:valueAt(visual.items,125,203),productCode:valueAt(visual.items,203,263),concept:valueAt(visual.items,263,413)||'',wasteCode:null,vehiclePlate:valueAt(visual.items,413,466),trailerPlate:valueAt(visual.items,466,532),quantity:parseEuropeanDecimal(valueAt(visual.items,532,600)),unitPrice:parseEuropeanDecimal(valueAt(visual.items,600,660)),taxableBase:parseEuropeanDecimal(valueAt(visual.items,660,720)),vatAmount:parseEuropeanDecimal(valueAt(visual.items,720,780)),totalAmount:parseEuropeanDecimal(valueAt(visual.items,780,850)),sourcePage:page.pageNumber,rawText:text,confidence:'high',warnings:[]}
      if(row.vehiclePlate?.includes(' ')&&!row.trailerPlate){const [vehicle,...trailer]=row.vehiclePlate.split(/\s+/);row.vehiclePlate=vehicle;row.trailerPlate=trailer.join(' ')||null}
      row.vehiclePlateNormalized=normalizePlate(row.vehiclePlate);row.trailerPlateNormalized=normalizePlate(row.trailerPlate)
      if(!row.clientCode)row.warnings.push('Línia sense client associat');if(!row.date)row.warnings.push('Data no vàlida');if(!row.deliveryNoteNumber||!row.productCode)row.warnings.push('Falten camps obligatoris')
      if(!near((cents(row.taxableBase)||0n)+(cents(row.vatAmount)||0n),cents(row.totalAmount)))row.warnings.push('Base imposable + IVA no coincideix amb el total')
      const q=scaled(row.quantity,4),p=scaled(row.unitPrice,4),base=cents(row.taxableBase);if(q!=null&&p!=null&&base!=null&&!near((q*p)/1000000n,base))row.warnings.push('Quantitat × preu no coincideix amb la base imposable')
      row.confidence=row.warnings.length?'review':'high';row.lineHash=buildLineHash({...row,companyName:result.companyName});result.rows.push(row);lastRow=row;continue
    }
    const continuation=valueAt(visual.items,250,413);if(lastRow&&continuation&&!/^(Concepto|Totales)/i.test(continuation)){lastRow.concept=(lastRow.concept+' '+continuation).trim();lastRow.rawText+='\n'+text;const waste=/\((\d{6})\)/.exec(lastRow.concept);lastRow.wasteCode=waste?.[1]||lastRow.wasteCode;lastRow.lineHash=buildLineHash({...lastRow,companyName:result.companyName})}
  }}
  for(const row of result.rows){if(!row.wasteCode){const waste=/\((\d{6})\)/.exec(row.concept);row.wasteCode=waste?.[1]||null}}
  const duplicateHashes=new Set();for(const row of result.rows){if(duplicateHashes.has(row.lineHash)){row.warnings.push('Possible duplicat dins del PDF');row.confidence='review'}duplicateHashes.add(row.lineHash)}
  result.clients=[...result.clients.values()]
  for(const client of result.clients){if(!client.detectedSubtotal)continue;const rows=result.rows.filter(row=>row.clientCode===client.clientCode),sum=rows.reduce((value,row)=>value+(cents(row.totalAmount)||0n),0n),detected=cents(client.detectedSubtotal.totalAmount);if(detected!=null&&!near(sum,detected))result.warnings.push(`El subtotal de ${client.clientName} no coincideix: detectat ${client.detectedSubtotal.totalAmount}, calculat ${formatCents(sum)}`)}
  const pageMismatches=[];for(const pageTotal of result.pageTotals){const rows=result.rows.filter(row=>row.sourcePage<=pageTotal.page),sum=rows.reduce((value,row)=>value+(cents(row.totalAmount)||0n),0n),detected=cents(pageTotal.totalAmount);if(detected!=null&&!near(sum,detected))pageMismatches.push({page:pageTotal.page,difference:sum-detected})}if(pageMismatches.length){const last=pageMismatches.at(-1);result.warnings.push(`${pageMismatches.length} totals acumulats de pàgina superen la tolerància de 0,02 €; darrera diferència a la pàgina ${last.page}: ${formatCents(last.difference)} €`)}
  const totals=result.rows.reduce((sum,row)=>({taxableBase:sum.taxableBase+(cents(row.taxableBase)||0n),vatAmount:sum.vatAmount+(cents(row.vatAmount)||0n),totalAmount:sum.totalAmount+(cents(row.totalAmount)||0n)}),{taxableBase:0n,vatAmount:0n,totalAmount:0n});result.totals={taxableBase:formatCents(totals.taxableBase),vatAmount:formatCents(totals.vatAmount),totalAmount:formatCents(totals.totalAmount)}
  return result
}
