import test from 'node:test'
import assert from 'node:assert/strict'
import {ensureWoodAndInadequateCategories} from '../src/repositories/articleCategoryMigration.js'
import {articleAssignmentSchema,articleClassificationSchema,articleCodeClassificationSchema,selectedArticleClassificationSchema} from '../src/validations/schemas.js'

test('new categories are accepted by every classification action',()=>{
 for(const category of ['fusta','mat_inade']){
  const article={product_code:'A',product_name:'Article',category};
  assert.equal(articleAssignmentSchema.parse(article).category,category);
  assert.equal(articleClassificationSchema.parse({articles:[article]}).articles[0].category,category);
  assert.equal(articleCodeClassificationSchema.parse({code:'020103',category,articles:[{product_code:'A',product_name:'Article'}]}).category,category);
  assert.equal(selectedArticleClassificationSchema.parse({category,articles:[{product_code:'A',product_name:'Article',previous_category:category}]}).category,category);
 }
});
test('migration preserves existing enum values and is idempotent',async()=>{
 let type="enum('compost','paper','no_comptabilitzar')",changes=0;
 const connection={query:async sql=>{
  if(sql.startsWith('SHOW COLUMNS'))return [[{Type:type}]];
  assert.ok(sql.startsWith('ALTER TABLE sales_article_compost_group MODIFY category '));
  type=sql.slice('ALTER TABLE sales_article_compost_group MODIFY category '.length,-' NULL'.length);changes++;return [{}];
 }};
 await ensureWoodAndInadequateCategories(connection);
 assert.equal(type,"enum('compost','paper','no_comptabilitzar','fusta','mat_inade')");
 await ensureWoodAndInadequateCategories(connection);
 assert.equal(changes,2);
});
