import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeDescriptionCode,matchesDescriptionCode} from '../src/services/articleDescriptionCode.js'
import {descriptionCodeSchema,articleCodeClassificationSchema} from '../src/validations/schemas.js'
import {classifyByDescriptionCode} from '../src/repositories/articleCodeClassificationRepository.js'
import {pool} from '../src/config/db.js'

test('codi complet entre parèntesis: espais, majúscules i diversos codis',()=>{
 assert.equal(normalizeDescriptionCode(' (02 01 03) '),'020103');
 assert.ok(matchesDescriptionCode('Producte (02 01 03)','020103'));
 assert.ok(matchesDescriptionCode('Producte (ALTRE) (ab-123)','AB-123'));
 assert.ok(!matchesDescriptionCode('Producte 020103','020103'));
 assert.ok(!matchesDescriptionCode('Producte (0201030)','020103'));
 assert.ok(!matchesDescriptionCode('Producte (020103*)','020103'));
 assert.ok(!matchesDescriptionCode('Producte ()',''));
 assert.equal(descriptionCodeSchema.parse('(020103)'),'020103');
 for(const invalid of ['', '()', '(020103', '020103)'])assert.equal(descriptionCodeSchema.safeParse(invalid).success,false);
 assert.equal(articleCodeClassificationSchema.safeParse({code:'020103',category:'paper',articles:[]}).success,false);
});

test('canvi conjunt, validació de coincidències i rollback',async t=>{
 const originalExecute=pool.execute,originalGetConnection=pool.getConnection;
 const rows=[{product_code:'A',product_name:'Paper (020103)',category:null},{product_code:'B',product_name:'Altre (02 01 03)',category:'altres'},{product_code:'C',product_name:'No coincideix (020104)',category:'compost'}];
 let writes=[],committed=false,rolledBack=false,failAudit=false;
 pool.execute=async(sql,params)=>{assert.match(sql,/INSERT IGNORE/);assert.deepEqual(params,[7,7]);return [{}]};
 pool.getConnection=async()=>({
  async beginTransaction(){writes=[];committed=false;rolledBack=false},
  async execute(sql,params){
   if(sql.startsWith('SELECT')){assert.match(sql,/company_id=\?/);assert.match(sql,/FOR UPDATE/);assert.deepEqual(params,[7]);return [rows]}
   if(sql.startsWith('UPDATE')){assert.match(sql,/WHERE company_id=\? AND product_code=\? AND product_name=\?/);writes.push(params);return [{affectedRows:1}]}
   assert.match(sql,/INSERT INTO audit_logs/);if(failAudit)throw Error('audit failed');assert.equal(JSON.parse(params[4]).articles.length,2);assert.equal(JSON.parse(params[5]).code,'020103');return [{}];
  },
  async commit(){committed=true},async rollback(){rolledBack=true;writes=[]},release(){}
 });
 const input={code:'020103',category:'paper',articles:rows.slice(0,2).map(({product_code,product_name})=>({product_code,product_name}))};
 try{
  await t.test('actualitza només les coincidències de la mateixa empresa i audita',async()=>{
   assert.deepEqual(await classifyByDescriptionCode(7,input,9,'127.0.0.1'),{count:2,category:'paper'});
   assert.equal(committed,true);assert.equal(rolledBack,false);
   assert.deepEqual(writes.map(p=>p.slice(0,5)),[['paper',false,9,7,'A'],['paper',false,9,7,'B']]);
  });
  await t.test('rebutja una llista obsoleta, duplicada o manipulada',async()=>{
   for(const articles of [input.articles.slice(0,1),[input.articles[0],input.articles[0]],[...input.articles,{product_code:'C',product_name:'No coincideix (020104)'}]]){
    await assert.rejects(classifyByDescriptionCode(7,{...input,articles},9,null),{code:'CLASSIFICATION_CHANGED'});assert.equal(committed,false);assert.equal(rolledBack,true);assert.equal(writes.length,0);
   }
  });
  await t.test('permet Compost i tornar a Sense classificar',async()=>{
   await classifyByDescriptionCode(7,{...input,category:'compost'},9,null);assert.ok(writes.every(p=>p[1]===true));
   await classifyByDescriptionCode(7,{...input,category:null},9,null);assert.ok(writes.every(p=>p[0]===null&&p[1]===false));
  });
  await t.test('un error d’auditoria reverteix el canvi sencer',async()=>{
   failAudit=true;await assert.rejects(classifyByDescriptionCode(7,input,9,null),/audit failed/);assert.equal(committed,false);assert.equal(rolledBack,true);assert.equal(writes.length,0);
  });
 }finally{pool.execute=originalExecute;pool.getConnection=originalGetConnection}
});
