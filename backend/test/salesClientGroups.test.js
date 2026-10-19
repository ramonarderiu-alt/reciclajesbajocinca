import test from 'node:test'
import assert from 'node:assert/strict'
import {salesClientGroup,groupClientSalesRows} from '../src/services/salesClientGroups.js'
import {buildClientSalesMatrix} from '../src/services/clientSalesMatrix.js'
import {clientSales} from '../src/repositories/salesImportRepository.js'
import {pool} from '../src/config/db.js'

test('agrupa Remondis i Muns, suma centres compartits i conserva els altres clients',()=>{
 const row=(code,centre,q,amount)=>({client_code:code,client_name:code,centre_name:centre,sale_year:2026,quantity:q,total_amount:amount});
 const input=[row('4300200131','EDAR A','10','100'),row('4300700689','EDAR A','20','200'),row('4300700689','EDAR B','-2','-20'),row('OTHER','EDAR A','1','1')];
 const result=buildClientSalesMatrix(groupClientSalesRows(1,input));
 const group=result.rows.find(r=>r.clientCode==='4300700689');
 assert.equal(result.rows.length,2);assert.equal(group.clientName,'Remondis Ibérica / Muns Agroindustrial');assert.deepEqual(group.years[2026],{quantity:'28.0000',totalAmount:'280.00'});assert.equal(group.centres.length,2);assert.deepEqual(group.centres[0].years[2026],{quantity:'30.0000',totalAmount:'300.00'});
 assert.equal(input[0].client_code,'4300200131');assert.equal(buildClientSalesMatrix(groupClientSalesRows(2,input)).rows.length,3);assert.equal(salesClientGroup(2,'4300200131'),undefined);
});
test('el detall dels dos codis inclou el grup amb filtres i empresa',async()=>{
 const execute=pool.execute;
 pool.execute=async(sql,params)=>{if(sql.startsWith('INSERT IGNORE'))return [{affectedRows:0}];if(sql.includes('sales_centre_observations')||sql.includes('sales_centre_ratings'))return [[]];assert.match(sql,/i.company_id=\?/);assert.match(sql,/r.client_code IN \(\?,\?\)/);assert.deepEqual(params,[1,'4300700689','4300200131','2026-01-01','2026-12-31','compost','%compost%','%compost%']);return [[{client_code:'4300200131',client_name:'MUNS'}]]};
 try{for(const code of ['4300200131','4300700689']){const rows=await clientSales(1,code,'2026-01-01','2026-12-31','compost');assert.equal(rows[0].sales_client_name,'Remondis Ibérica / Muns Agroindustrial');assert.equal(rows[0].client_name,'MUNS')}}finally{pool.execute=execute}
});
