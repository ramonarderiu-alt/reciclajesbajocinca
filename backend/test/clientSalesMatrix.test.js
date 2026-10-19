import test from 'node:test'
import assert from 'node:assert/strict'
import {buildClientSalesMatrix} from '../src/services/clientSalesMatrix.js'
import {parseDeliveryNotePages} from '../src/services/deliveryNoteParser.js'
test('totals de centres exactes, separats per client i any',()=>{
 const row=(client,centre,year,quantity,amount)=>({client_code:client,client_name:client,centre_name:centre,sale_year:year,quantity,total_amount:amount});
 const result=buildClientSalesMatrix([row('A','Centre 1',2025,'0.1000','0.10'),row('A','Centre 2',2025,'0.2000','0.20'),row('A',null,2025,'-0.0500','-0.05'),row('A','Centre 1',2026,'2.0000','20.00'),row('B','Centre 1',2025,'3','30')]);
 assert.deepEqual(result.years,[2025,2026]);assert.equal(result.rows.length,2);assert.deepEqual(result.rows[0].years[2025],{quantity:'0.2500',totalAmount:'0.25'});assert.equal(result.rows[0].centres.length,3);assert.equal(result.rows[0].centres[1].years[2026],undefined);assert.deepEqual(result.rows[1].years[2025],{quantity:'3.0000',totalAmount:'30.00'});assert.deepEqual(buildClientSalesMatrix([]),{years:[],rows:[]});
});
const item=(text,x,y)=>({text,x,y});
const header=()=>[item('Producto',266,550),item('Concepto',316,550)];
const line=(note,y=460)=>[item(note,18,y),item('14/09/23',77,y),item('386070',266,y),item('NUTRICOMPOST',316,y),item('25,76',670,y),item('35,00',739,y),item('901,60',783,y)];
test('centres entre pàgines, canvi de centre i client i IVA desconegut',()=>{
 const pages=[[...header(),item('4300200004',12,500),item('CLIENT A',70,500),item('CENTRE A - ADREÇA -',18,480),...line('A1')],[...header(),...line('A2',520),item('Recuento: 2',24,500),item('Totales CENTRE A',300,500),item('CENTRE B - ADREÇA -',18,480),...line('A3'),item('- -',20,440),...line('A4',420),item('4300200005',12,400),item('CLIENT B',70,400),...line('A5',380)]];
 const result=parseDeliveryNotePages(pages.map((items,i)=>({pageNumber:i+1,items})));
 assert.equal(result.rows.length,5);assert.deepEqual(result.rows.map(r=>r.centreName),['CENTRE A - ADREÇA','CENTRE A - ADREÇA','CENTRE B - ADREÇA',null,null]);assert.equal(result.rows[4].clientCode,'4300200005');assert.equal(result.rows[0].productCode,'386070');assert.equal(result.rows[0].quantity,'25.76');assert.equal(result.rows[0].unitPrice,'35.00');assert.equal(result.rows[0].totalAmount,'901.60');assert.equal(result.rows[0].vatAmount,null);assert.deepEqual(result.rows[0].warnings,[]);
});

test('desglossa totals per classificació quan les files porten categoria',()=>{
 const row=(category,quantity,amount)=>({client_code:'A',client_name:'A',centre_name:'Centre 1',sale_year:2026,category,quantity,total_amount:amount});
 const result=buildClientSalesMatrix([row('compost','1.5000','15.00'),row('compost','0.5000','5.00'),row(null,'2.0000','20.00')]);
 assert.deepEqual(result.rows[0].years[2026].categories,[{category:'compost',quantity:'2.0000',totalAmount:'20.00'},{category:null,quantity:'2.0000',totalAmount:'20.00'}]);
 assert.deepEqual(result.rows[0].centres[0].years[2026].categories,result.rows[0].years[2026].categories);
});