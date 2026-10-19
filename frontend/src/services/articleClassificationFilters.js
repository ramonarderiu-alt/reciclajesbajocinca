export const articleKey=row=>JSON.stringify([row.product_code,row.product_name]);
export const normalizeCode=value=>String(value||'').trim().replace(/^\((.*)\)$/,'$1').replace(/\s+/g,'').toUpperCase();
export function descriptionCodes(name){return [...new Set([...String(name||'').matchAll(/\(([^()]*)\)/g)].map(match=>normalizeCode(match[1])).filter(Boolean))]}
export const lerCodes=name=>descriptionCodes(name).filter(code=>/^\d{6}\*?$/.test(code));
export const totalTonnes=(row,years)=>Math.round(years.reduce((sum,year)=>sum+Number(row.quantities?.[year]||0),0)*10000)/10000;
const normalizeText=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('ca').trim();
export function filterClassificationArticles(articles,{mode='all',code='',text='',years=[],min=null,max=null,sort='desc'}){
 const wanted=normalizeCode(code),term=normalizeText(text);
 const result=articles.filter(row=>{
  const hasLer=lerCodes(row.product_name).length>0;
  if(mode==='with'&&!hasLer||mode==='without'&&hasLer)return false;
  if(mode!=='without'&&wanted&&!descriptionCodes(row.product_name).includes(wanted))return false;
  if(term&&!normalizeText(row.product_code).includes(term)&&!normalizeText(row.product_name).includes(term))return false;
  const total=totalTonnes(row,years);
  return (min==null||total>=min)&&(max==null||total<=max);
 });
 return result.sort((a,b)=>sort==='name'?a.product_name.localeCompare(b.product_name,'ca'):(sort==='asc'?1:-1)*(totalTonnes(a,years)-totalTonnes(b,years))||a.product_name.localeCompare(b.product_name,'ca'));
}
