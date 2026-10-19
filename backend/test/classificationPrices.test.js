import test from 'node:test'
import assert from 'node:assert/strict'
import {averagePrice,buildClassificationPriceMatrix} from '../src/services/classificationPriceMatrix.js'
import {classificationPrices} from '../src/repositories/classificationPriceRepository.js'
import {pool} from '../src/config/db.js'
const row=(overrides={})=>({category:'paper',sale_year:2025,client_code:'A',client_name:'Client A',centre_name:'Centre 1',quantity:'1.0000',taxable_base:'100.00',...overrides});
test('el promig és ponderat per tones i coincideix amb els subtotals dels centres',()=>{
 const result=buildClassificationPriceMatrix(7,[row(),row({client_code:'B',client_name:'Client B',centre_name:'Centre 2',quantity:'9.0000',taxable_base:'90.00'}),row({sale_year:2024,quantity:'2.0000',taxable_base:'30.00'}),row({category:'fruita',quantity:'3.0000',taxable_base:'60.00'})]);
 assert.deepEqual(result.years,[2024,2025]);
 const paper=result.rows.find(r=>r.category==='paper');
 assert.equal(paper.years[2025].averagePrice,'19.0000');
 assert.equal(paper.years[2025].quantity,'10.0000');assert.equal(paper.years[2025].taxableBase,'190.00');
 assert.deepEqual(paper.years[2025].centres.map(c=>c.averagePrice),['100.0000','10.0000']);
 assert.equal(paper.years[2024].averagePrice,'15.0000');
 assert.equal(result.rows.find(r=>r.category==='fruita').years[2025].averagePrice,'20.0000');
});

test("detecta l'albarà amb més desviació dins del mateix centre i any",()=>{
 const result=buildClassificationPriceMatrix(7,[
  row({delivery_note_number:'A',quantity:'1.0000',taxable_base:'100.00'}),
  row({delivery_note_number:'B',quantity:'1.0000',taxable_base:'200.00'}),
  row({delivery_note_number:'C',quantity:'8.0000',taxable_base:'800.00'})
 ]);
 const centre=result.rows.find(r=>r.category==='paper').years[2025].centres[0];
 assert.equal(centre.averagePrice,'110.0000');
 assert.equal(centre.priceDeviation.deliveryNoteNumber,'B');
 assert.equal(centre.priceDeviation.ratio,'0.8182');
 assert.equal(centre.priceDeviation.direction,'above');
 assert.equal(centre.priceDeviation.price,'200.0000');
})
test('separa centres i clients, agrupa clients vinculats i conserva sense centre',()=>{
 const result=buildClassificationPriceMatrix(1,[row({client_code:'4300700689'}),row({client_code:'4300200131',quantity:'2.0000',taxable_base:'50.00'}),row({client_code:'4300200131',centre_name:null,quantity:'4.0000',taxable_base:'40.00'}),row({client_code:'B',centre_name:'Centre 1'})]);
 const centres=result.rows[0].years[2025].centres;
 assert.equal(centres.length,3);
 const combined=centres.find(c=>c.clientCode==='4300700689'&&c.centreName==='Centre 1');
 assert.equal(combined.clientName,'Remondis Ibérica / Muns Agroindustrial');assert.equal(combined.averagePrice,'50.0000');
 assert.equal(centres.find(c=>c.centreName===null).averagePrice,'10.0000');
});
test('gestiona imports zero, rectificacions, arrodoniment i tones netes zero',()=>{
 assert.equal(averagePrice('0.00','10.0000'),'0.0000');
 assert.equal(averagePrice('1.00','3.0000'),'0.3333');
 assert.equal(averagePrice('-1.00','6.0000'),'-0.1667');
 assert.equal(averagePrice('-20.00','-2.0000'),'10.0000');
 assert.equal(averagePrice('10.00','0.0000'),null);
 const report=buildClassificationPriceMatrix(1,[row({category:null}),row({category:null,quantity:'-1.0000',taxable_base:'-100.00'}),row({category:'no_comptabilitzar',taxable_base:'0.00'})]);
 assert.equal(report.rows.find(r=>r.category===null).years[2025].averagePrice,null);
 assert.equal(report.rows.find(r=>r.category==='no_comptabilitzar').years[2025].averagePrice,'0.0000');
 assert.deepEqual(buildClassificationPriceMatrix(1,[]),{years:[],rows:[]});
});
test('consulta només vendes confirmades de l’empresa i amb dades vàlides',async()=>{
 const original=pool.execute;
 pool.execute=async(sql,params)=>{
  if(sql.startsWith('INSERT IGNORE'))return [{}];
  if(sql.includes('sales_centre_observations')||sql.includes('sales_centre_ratings'))return [[]];
  assert.deepEqual(params,[7]);
  for(const filter of ['i.company_id=?','r.is_confirmed=TRUE','r.delivery_date IS NOT NULL','r.quantity<>0','r.taxable_base IS NOT NULL','g.product_name=LEFT(TRIM(r.concept),255)'])assert.ok(sql.includes(filter));
  return [[row()]];
 };
 try{const result=await classificationPrices(7);assert.equal(result.rows[0].years[2025].averagePrice,'100.0000')}finally{pool.execute=original}
});
