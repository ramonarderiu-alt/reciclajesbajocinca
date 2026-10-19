import {addDecimal} from './clientSalesMatrix.js'
import {groupClientSalesRows} from './salesClientGroups.js'
function scaled(value,places){const text=String(value),negative=text.startsWith('-'),[whole,fraction='']=(negative?text.slice(1):text).split('.');return (negative?-1n:1n)*(BigInt(whole)*10n**BigInt(places)+BigInt((fraction+'0'.repeat(places)).slice(0,places)))}
export function averagePrice(base,quantity){
 const numerator=scaled(base,2)*1000000n,denominator=scaled(quantity,4);
 if(denominator===0n)return null;
 const negative=(numerator<0n)!==(denominator<0n),n=numerator<0n?-numerator:numerator,d=denominator<0n?-denominator:denominator;
 const rounded=(n+d/2n)/d,digits=String(rounded).padStart(5,'0');
 return (negative&&rounded!==0n?'-':'')+digits.slice(0,-4)+'.'+digits.slice(-4);
}
const empty=()=>({quantity:'0.0000',taxableBase:'0.00'});
function add(target,row){target.quantity=addDecimal(target.quantity,row.quantity,4);target.taxableBase=addDecimal(target.taxableBase,row.taxable_base,2)}
function addLine(target,row){
 target.lines??=[];
 const price=averagePrice(row.taxable_base,row.quantity);
 if(price!=null)target.lines.push({deliveryNoteNumber:row.delivery_note_number||'',price});
}
function maxPriceDeviation(lines,average){
 const base=Number(average);
 if(!Number.isFinite(base)||base===0)return null;
 let selected=null;
 for(const line of lines||[]){
  const current=Number(line.price);
  if(!Number.isFinite(current))continue;
  const signedRatio=(current-base)/Math.abs(base),ratio=Math.abs(signedRatio);
  if(!selected||ratio>Number(selected.ratio))selected={ratio:ratio.toFixed(4),signedRatio:signedRatio.toFixed(4),direction:signedRatio>0?'above':'below',deliveryNoteNumber:line.deliveryNoteNumber,price:line.price};
 }
 return selected;
}
export function buildClassificationPriceMatrix(companyId,data){
 const categories=new Map();
 for(const row of groupClientSalesRows(companyId,data)){
  const category=row.category??null;
  if(!categories.has(category))categories.set(category,{category,years:{}});
  const item=categories.get(category),year=Number(row.sale_year);
  if(!item.years[year])item.years[year]={...empty(),centres:new Map()};
  const annual=item.years[year],centreName=row.centre_name||null,key=JSON.stringify([row.client_code,centreName]);
  if(!annual.centres.has(key))annual.centres.set(key,{clientCode:row.client_code,clientName:row.client_name,centreName,...empty(),lines:[]});
  const centre=annual.centres.get(key);
  add(annual,row);add(centre,row);addLine(centre,row);
 }
 for(const item of categories.values())for(const annual of Object.values(item.years)){
  annual.averagePrice=averagePrice(annual.taxableBase,annual.quantity);
  annual.centres=[...annual.centres.values()].map(centre=>{const average=averagePrice(centre.taxableBase,centre.quantity),priceDeviation=maxPriceDeviation(centre.lines,average),{lines,...clean}=centre;return {...clean,averagePrice:average,priceDeviation}}).sort((a,b)=>String(a.clientName||a.clientCode).localeCompare(String(b.clientName||b.clientCode),'ca')||String(a.centreName||'').localeCompare(String(b.centreName||''),'ca'));
 }
 return {years:[...new Set(data.map(row=>Number(row.sale_year)))].sort((a,b)=>a-b),rows:[...categories.values()]};
}