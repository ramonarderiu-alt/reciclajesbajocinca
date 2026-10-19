import test from 'node:test'
import assert from 'node:assert/strict'
import {pool} from '../src/config/db.js'
import {classifySelectedArticles} from '../src/repositories/articleCodeClassificationRepository.js'
import {selectedArticleClassificationSchema} from '../src/validations/schemas.js'
test('classifica només la selecció i protegeix canvis concurrents i empreses',async t=>{
 const original=pool.getConnection;
 const rows=[{product_code:'A',product_name:'Paper (200101)',category:'altres'},{product_code:'B',product_name:'Sense LER',category:null}];
 let writes=[],committed=false,rollback=false,failAudit=false;
 pool.getConnection=async()=>({
  async beginTransaction(){writes=[];committed=false;rollback=false},
  async execute(sql,params){
   if(sql.startsWith('SELECT')){assert.match(sql,/company_id=\?/);assert.match(sql,/FOR UPDATE/);assert.deepEqual(params,[7]);return [rows]}
   if(sql.startsWith('UPDATE')){assert.match(sql,/WHERE company_id=\? AND product_code=\? AND product_name=\?/);assert.equal(params[3],7);writes.push(params);return [{affectedRows:1}]}
   assert.match(sql,/INSERT INTO audit_logs/);if(failAudit)throw Error('audit failure');assert.equal(JSON.parse(params[4]).articles.length,writes.length);return [{}];
  },async commit(){committed=true},async rollback(){rollback=true;writes=[]},release(){}
 });
 const article={product_code:'B',product_name:'Sense LER',previous_category:null};
 const input={category:'paper',articles:[article]};
 try{
  await t.test('actualitza un article sense LER sense modificar els no marcats',async()=>{
   assert.deepEqual(await classifySelectedArticles(7,selectedArticleClassificationSchema.parse(input),9,null),{count:1,category:'paper'});
   assert.equal(committed,true);assert.deepEqual(writes,[['paper',false,9,7,'B','Sense LER']]);
  });
  await t.test('rebutja un article aliè o una classificació anterior obsoleta',async()=>{
   for(const changed of [{...article,product_code:'OTHER'},{...article,previous_category:'compost'}]){
    await assert.rejects(classifySelectedArticles(7,{...input,articles:[changed]},9,null),{code:'CLASSIFICATION_CHANGED'});assert.equal(rollback,true);assert.equal(committed,false);
   }
  });
  await t.test('rebutja seleccions buides i duplicades',async()=>{
   assert.equal(selectedArticleClassificationSchema.safeParse({...input,articles:[]}).success,false);
   await assert.rejects(classifySelectedArticles(7,{...input,articles:[article,article]},9,null),{code:'INVALID_SELECTION'});
  });
  await t.test('actualitza el marcador de compost i permet desclassificar',async()=>{
   await classifySelectedArticles(7,{...input,category:'compost'},9,null);assert.equal(writes[0][1],true);
   await classifySelectedArticles(7,{...input,category:null},9,null);assert.equal(writes[0][0],null);assert.equal(writes[0][1],false);
  });
  await t.test('un error reverteix tota la selecció',async()=>{
   failAudit=true;await assert.rejects(classifySelectedArticles(7,input,9,null),/audit failure/);assert.equal(rollback,true);assert.equal(committed,false);assert.equal(writes.length,0);
  });
 }finally{pool.getConnection=original}
});
