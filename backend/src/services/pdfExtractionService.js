import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { AppError } from '../lib/errors.js'

export async function extractPdf(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length<5||buffer.subarray(0,5).toString()!=='%PDF-')throw new AppError(422,'INVALID_PDF','El fitxer no té una signatura PDF vàlida')
  let document
  try{document=await getDocument({data:new Uint8Array(buffer),useWorkerFetch:false,isEvalSupported:false}).promise}catch{throw new AppError(422,'UNREADABLE_PDF','No s’ha pogut llegir el PDF')}
  const pages=[];let itemCount=0
  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){const page=await document.getPage(pageNumber),content=await page.getTextContent();const items=content.items.filter(item=>item.str?.trim()).map(item=>({text:item.str,x:item.transform[4],y:item.transform[5],width:item.width,height:item.height}));itemCount+=items.length;pages.push({pageNumber,items})}
  if(itemCount<5)throw new AppError(422,'PDF_WITHOUT_TEXT','El PDF no conté una capa de text. Caldrà aplicar OCR abans d’importar-lo.')
  return {pageCount:document.numPages,pages}
}
