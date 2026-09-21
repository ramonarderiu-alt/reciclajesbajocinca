// Sum decimal strings as integers so annual totals equal their centre subtotals.
function addDecimal(left='0',right='0',scale=2){
  const integer=value=>{const text=String(value||'0'),negative=text.startsWith('-'),[whole,fraction='']=(negative?text.slice(1):text).split('.');return (negative?-1n:1n)*(BigInt(whole)*10n**BigInt(scale)+BigInt((fraction+'0'.repeat(scale)).slice(0,scale)))}
  const sum=integer(left)+integer(right),digits=String(sum<0n?-sum:sum).padStart(scale+1,'0');return `${sum<0n?'-':''}${digits.slice(0,-scale)}.${digits.slice(-scale)}`
}
export function buildClientSalesMatrix(data){
  const years=[...new Set(data.map(row=>Number(row.sale_year)))].sort(),clients=new Map();
  for(const row of data){
    if(!clients.has(row.client_code))clients.set(row.client_code,{clientCode:row.client_code,clientName:row.client_name,years:{},centres:[]});
    const client=clients.get(row.client_code),centreName=row.centre_name||null;
    let centre=client.centres.find(item=>item.centreName===centreName);
    if(!centre){centre={centreName,years:{}};client.centres.push(centre)}
    const centreTotal=centre.years[row.sale_year]||{quantity:'0',totalAmount:'0'};
    centre.years[row.sale_year]={quantity:addDecimal(centreTotal.quantity,row.quantity,4),totalAmount:addDecimal(centreTotal.totalAmount,row.total_amount)};
    const total=client.years[row.sale_year]||{quantity:'0',totalAmount:'0'};
    client.years[row.sale_year]={quantity:addDecimal(total.quantity,row.quantity,4),totalAmount:addDecimal(total.totalAmount,row.total_amount)};
  }
  return {years,rows:[...clients.values()].sort((a,b)=>a.clientName.localeCompare(b.clientName,'ca'))}
}
