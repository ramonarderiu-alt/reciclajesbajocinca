// Reporting groups preserve the original client codes used by imports and deduplication.
const groups=[{companyId:1,clientCode:'4300700689',clientName:'Remondis Ibérica / Muns Agroindustrial',codes:['4300700689','4300200131']}]
export function salesClientGroup(companyId,clientCode){return groups.find(group=>group.companyId===Number(companyId)&&group.codes.includes(String(clientCode)))}
export function groupClientSalesRows(companyId,rows){return rows.map(row=>{const group=salesClientGroup(companyId,row.client_code);return group?{...row,client_code:group.clientCode,client_name:group.clientName}:row})}
