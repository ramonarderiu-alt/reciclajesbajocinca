<script setup>
import {ref,computed} from 'vue'
import {api} from '../services/api.js'
import {can} from '../stores/auth.js'
import {articleCategories} from '../constants/articleCategories.js'
import ConfirmDialog from './ConfirmDialog.vue'
const code=ref(''),searchedCode=ref(''),articles=ref([]),searched=ref(false),loading=ref(false),saving=ref(false),error=ref(''),notice=ref(''),category=ref(''),confirmOpen=ref(false),confirmError=ref('')
const busy=computed(()=>loading.value||saving.value)
const categoryName=value=>value==null?'Sense classificar':articleCategories.find(([key])=>key===value)?.[1]||value
const targetCategory=computed(()=>category.value==='__none__'?null:category.value)
const years=computed(()=>[...new Set(articles.value.flatMap(row=>Object.keys(row.quantities||{})))].map(Number).sort((a,b)=>b-a))
const tonnes=value=>new Intl.NumberFormat('ca-ES',{maximumFractionDigits:4}).format(Number(value||0))
const currentClassification=computed(()=>{
 const counts=new Map();
 for(const row of articles.value){const name=categoryName(row.category);counts.set(name,(counts.get(name)||0)+1)}
 return [...counts].map(([name,count])=>`${name}: ${count} ${count===1?'article':'articles'}`).join(' · ');
})
const confirmation=computed(()=>`Es canviaran tots els ${articles.value.length} articles amb el codi (${searchedCode.value}) a «${categoryName(targetCategory.value)}». Classificació anterior: ${currentClassification.value}. El canvi afecta les vendes de tots els anys d’aquests articles.`)
function invalidate(){searched.value=false;articles.value=[];notice.value='';error.value=''}
async function search(){
 if(busy.value||!code.value.trim())return;
 loading.value=true;invalidate();
 try{const result=await api.get('/sales/articles/classification/by-code?code='+encodeURIComponent(code.value));articles.value=result.articles;searchedCode.value=result.code;searched.value=true}
 catch(e){error.value=e.message}finally{loading.value=false}
}
function requestChange(){confirmError.value='';confirmOpen.value=true}
async function apply(){
 if(busy.value||!category.value||!articles.value.length)return;
 saving.value=true;confirmError.value='';
 const previous=currentClassification.value;
 try{
  const result=await api.patch('/sales/articles/classification/by-code',{code:searchedCode.value,category:targetCategory.value,articles:articles.value.map(({product_code,product_name})=>({product_code,product_name}))});
  for(const row of articles.value)row.category=result.category;
  confirmOpen.value=false;notice.value=`Classificació actualitzada: ${result.count} articles a «${categoryName(result.category)}». Abans: ${previous}.`;
 }catch(e){confirmError.value=e.message;if(e.code==='CLASSIFICATION_CHANGED'){confirmOpen.value=false;invalidate();error.value=e.message}}
 finally{saving.value=false}
}
</script>
<template>
 <section class="card exact-code">
  <h2>Classificació per codi</h2>
  <p class="muted">Introduïu el codi entre parèntesis de la descripció per canviar conjuntament tots els articles coincidents.</p>
  <form class="code-controls" @submit.prevent="search">
   <label>Codi de la descripció<input v-model="code" maxlength="100" placeholder="Ex.: 020103 o (020103)" :disabled="busy" required @input="invalidate"></label>
   <button class="button primary" :disabled="busy||!code.trim()">{{loading?'Cercant…':'Cercar articles'}}</button>
  </form>
  <div v-if="error" class="alert error" role="alert">{{error}}</div>
  <div v-if="notice" class="alert success" role="status">{{notice}}</div>
  <template v-if="searched">
   <p role="status"><strong>{{articles.length}}</strong> articles amb el codi <strong>({{searchedCode}})</strong>.</p>
   <div v-if="articles.length&&can('sales_clients.manage')" class="code-controls">
    <div class="current-classification"><strong>Classificació actual</strong><span>{{currentClassification}}</span></div>
    <label>Nova classificació<select v-model="category" :disabled="busy"><option disabled value="">Seleccioneu una classificació</option><option value="__none__">Sense classificar</option><option v-for="[value,label] in articleCategories" :key="value" :value="value">{{label}}</option></select></label>
    <button class="button primary" :disabled="busy||!category" @click="requestChange">Canviar tots els {{articles.length}} articles</button>
   </div>
   <div v-if="articles.length" class="table-wrap"><table class="code-results"><thead><tr><th>Codi article</th><th>Descripció</th><th>Classificació actual</th><th v-for="year in years" :key="year">{{year}} · t</th></tr></thead><tbody><tr v-for="row in articles" :key="JSON.stringify([row.product_code,row.product_name])"><td>{{row.product_code}}</td><td>{{row.product_name}}</td><td>{{categoryName(row.category)}}</td><td v-for="year in years" :key="year" class="tonnes">{{tonnes(row.quantities?.[year])}}</td></tr></tbody></table></div>
  </template>
 </section>
 <ConfirmDialog :open="confirmOpen" title="Canviar classificació per codi" :message="confirmation" :busy="saving" :error="confirmError" busy-text="Desant classificació…" @cancel="confirmOpen=false" @confirm="apply"/>
</template>
<style scoped>
.exact-code h2{margin:0 0 8px;font-size:1.1rem}
.code-controls{display:flex;align-items:flex-end;flex-wrap:wrap;gap:12px;margin:14px 0}
.current-classification{display:grid;gap:5px;flex:1 1 240px;padding:10px 12px;background:#f4f7f5;border:1px solid var(--border);border-radius:8px;font-size:.85rem}
.current-classification span{color:var(--muted)}
.code-controls label{min-width:min(240px,100%);max-width:100%;flex:0 1 320px}
.code-results th,.code-results td{padding:8px;font-size:.78rem}
.code-results .tonnes{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.exact-code .alert{margin-top:12px}
</style>
