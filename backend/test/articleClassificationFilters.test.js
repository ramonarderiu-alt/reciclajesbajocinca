import test from 'node:test'
import assert from 'node:assert/strict'
import {lerCodes,totalTonnes,filterClassificationArticles} from '../../frontend/src/services/articleClassificationFilters.js'
const articles=[
 {product_code:'A',product_name:'Paper (20 01 01)',quantities:{2024:'2.0000',2025:'5.0000'}},
 {product_code:'B',product_name:'Fruita sense LER',quantities:{2024:'10.0000',2025:'1.0000'}},
 {product_code:'C',product_name:'Altres (ABC123)',quantities:{2024:'3.0000',2025:'-1.0000'}},
 {product_code:'D',product_name:'Material (020103*)',quantities:{2025:'0.3000'}}
];
test('distingeix LER de sis dígits de codis no LER i conserva asteriscs',()=>{
 assert.deepEqual(lerCodes('Text (20 01 01) (020103*) (12345) (1234567) (ABC123)'),['200101','020103*']);
 assert.deepEqual(filterClassificationArticles(articles,{mode:'without',years:[2025]}).map(r=>r.product_code),['B','C']);
 assert.deepEqual(filterClassificationArticles(articles,{mode:'with',code:'(20 01 01)',years:[2025]}).map(r=>r.product_code),['A']);
 assert.deepEqual(filterClassificationArticles(articles,{mode:'with',code:'020103',years:[2025]}),[]);
});
test('filtra i ordena per tones dels anys escollits, sense sumar altres anys',()=>{
 assert.equal(totalTonnes(articles[0],[2024,2025]),7);
 assert.equal(totalTonnes(articles[0],[2026]),0);
 assert.equal(totalTonnes({quantities:{2024:'0.1',2025:'0.2'}},[2024,2025]),0.3);
 assert.deepEqual(filterClassificationArticles(articles,{years:[2025],min:1,max:5}).map(r=>r.product_code),['A','B']);
 assert.deepEqual(filterClassificationArticles(articles,{years:[2024,2025],min:7}).map(r=>r.product_code),['B','A']);
 assert.deepEqual(filterClassificationArticles(articles,{years:[2025],sort:'asc'}).map(r=>r.product_code),['C','D','B','A']);
 assert.deepEqual(filterClassificationArticles(articles,{years:[2025],text:'fruita'}).map(r=>r.product_code),['B']);
 assert.deepEqual(filterClassificationArticles(articles,{mode:'without',code:'200101',years:[2025],max:0}).map(r=>r.product_code),['C']);
});
