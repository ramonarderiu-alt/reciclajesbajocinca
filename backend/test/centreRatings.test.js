import test from 'node:test'
import assert from 'node:assert/strict'
import {centreRatingSchema} from '../src/validations/schemas.js'
import {pool} from '../src/config/db.js'
import {centreRatingKey,saveCentreRating,attachCentreRatings} from '../src/repositories/centreRatingRepository.js'
test('nom de centre i puntuació obligatoris: només enters de 1 a 5',()=>{
 for(const rating of [1,2,3,4,5])assert.equal(centreRatingSchema.parse({centreName:'EDAR',rating}).rating,rating);
 for(const rating of [0,6,2.5,null,'3'])assert.equal(centreRatingSchema.safeParse({centreName:'EDAR',rating}).success,false);
 assert.equal(centreRatingSchema.safeParse({centreName:' ',rating:3}).success,false);
 assert.equal(centreRatingKey(' ÀREA '),centreRatingKey('area'));
})
test('desa per empresa i client agrupat i recupera la puntuació als centres',async()=>{
 const execute=pool.execute,calls=[];
 pool.execute=async(sql,params)=>{calls.push({sql,params});if(sql.startsWith('SELECT r.centre_name'))return [[{centre_name:'ÀREA'}]];if(sql.startsWith('SELECT client_code'))return [[{client_code:'4300700689',centre_key:centreRatingKey('ÀREA'),rating:4}]];return [{}]};
 try{
 assert.deepEqual(await saveCentreRating(1,'4300200131','ÀREA',4,7),{rating:4});assert.deepEqual(calls[0].params,[1,'4300700689','4300200131','ÀREA']);assert.match(calls[0].sql,/is_confirmed=TRUE/);assert.deepEqual(calls[1].params,[1,'4300700689',centreRatingKey('ÀREA'),'ÀREA',4,7,null,false]);
 const matrix={rows:[{clientCode:'4300700689',centres:[{centreName:'ÀREA'},{centreName:'OTHER'},{centreName:null}]},{clientCode:'OTHER',centres:[{centreName:'ÀREA'}]}]};
 await attachCentreRatings(1,matrix);assert.deepEqual(matrix.rows[0].centres.map(c=>c.rating),[4,null,null]);assert.equal(matrix.rows[1].centres[0].rating,null);
 }finally{pool.execute=execute}
})
test('rebutja centres inexistents sense desar puntuacions',async()=>{
 const execute=pool.execute;let calls=0;pool.execute=async()=>{calls++;return [[]]};
 try{await assert.rejects(()=>saveCentreRating(2,'OTHER','EDAR',5,7),e=>e.status===404);assert.equal(calls,1)}finally{pool.execute=execute}
})
