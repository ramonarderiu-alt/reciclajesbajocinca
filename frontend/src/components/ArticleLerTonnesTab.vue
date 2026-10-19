<script setup>
import {ref,computed,onMounted,watch} from 'vue'
import {api} from '../services/api.js'
import {can} from '../stores/auth.js'
import {articleCategories} from '../constants/articleCategories.js'
import {articleKey,lerCodes,totalTonnes,filterClassificationArticles} from '../services/articleClassificationFilters.js'
import ConfirmDialog from './ConfirmDialog.vue'
const articles=ref([]),loading=ref(false),saving=ref(false),error=ref(''),notice=ref(''),category=ref(''),confirmOpen=ref(false),confirmError=ref('')
const mode=ref('all'),code=ref(''),text=ref(''),selectedYears=ref([]),minimum=ref(''),maximum=ref(''),sort=ref('desc'),selected=ref(new Set())
const busy=computed(()=>loading.value||saving.value)
const years=computed(()=>[...new Set(articles.value.flatMap(row=>Object.keys(row.quantities||{})))].map(Number).sort((a,b)=>b-a))
const visibleYears=computed(()=>years.value.filter(year=>selectedYears.value.includes(year)))
const parseBound=value=>String(value).trim()===''?null:Number(String(value).replace(',','.'))
const filterError=computed(()=>{
 if(years.value.length&&!visibleYears.value.length)return 'Seleccioneu almenys un any.';
 const min=parseBound(minimum.value),max=parseBound(maximum.value);
 if(min!==null&&!Number.isFinite(min)||max!==null&&!Number.isFinite(max))return 'Introduïu un nombre vàlid de tones.';
 return min!==null&&max!==null&&min>max?'Les tones mínimes no poden superar les màximes.':'';
})
const visible=computed(()=>filterError.value?[]:filterClassificationArticles(articles.value,{mode:mode.value,code:code.value,text:text.value,years:visibleYears.value,min:parseBound(minimum.value),max:parseBound(maximum.value),sort:sort.value}))
const selectedArticles=computed(()=>visible.value.filter(row=>selected.value.has(articleKey(row))))
const allSelected=computed(()=>visible.value.length>0&&selectedArticles.value.length===visible.value.length)
const categoryName=value=>value==null?'Sense classificar':articleCategories.find(([key])=>key===value)?.[1]||value
const targetCategory=computed(()=>category.value==='__none__'?null:category.value)
const tonnes=value=>new Intl.NumberFormat('ca-ES',{maximumFractionDigits:4}).format(Number(value||0))
const currentClassification=computed(()=>{
 const counts=new Map();
 for(const row of selectedArticles.value){const name=categoryName(row.category);counts.set(name,(counts.get(name)||0)+1)}
 return [...counts].map(([name,count])=>`${name}: ${count} ${count===1?'article':'articles'}`).join(' · ');
})
const selectedTonnes=computed(()=>selectedArticles.value.reduce((sum,row)=>sum+totalTonnes(row,visibleYears.value),0))
const confirmation=computed(()=>`Es canviaran només els ${selectedArticles.value.length} articles marcats a «${categoryName(targetCategory.value)}». Classificació anterior: ${currentClassification.value}. Els anys seleccionats serveixen per cercar: la classificació s’aplica a les vendes de tots els anys d’aquests articles.`)
watch([mode,code,text,selectedYears,minimum,maximum],()=>{selected.value=new Set();notice.value=''},{deep:true,flush:'sync'})
function toggle(row,checked){const next=new Set(selected.value);checked?next.add(articleKey(row)):next.delete(articleKey(row));selected.value=next}
function toggleAll(checked){selected.value=checked?new Set(visible.value.map(articleKey)):new Set()}
async function load(){
 if(busy.value)return;
 loading.value=true;error.value='';notice.value='';selected.value=new Set();
 try{articles.value=await api.get('/sales/articles/classification');selectedYears.value=[...years.value]}
 catch(e){articles.value=[];error.value=e.message}finally{loading.value=false}
}
function requestChange(){if(!selectedArticles.value.length||!category.value)return;confirmError.value='';confirmOpen.value=true}
async function apply(){
 if(busy.value||!category.value||!selectedArticles.value.length)return;
 saving.value=true;confirmError.value='';
 const targets=[...selectedArticles.value],previousClassification=currentClassification.value;
 try{
  const result=await api.patch('/sales/articles/classification/selected',{category:targetCategory.value,articles:targets.map(({product_code,product_name,category})=>({product_code,product_name,previous_category:category??null}))});
  for(const row of targets)row.category=result.category;
  selected.value=new Set();confirmOpen.value=false;notice.value=`Classificació actualitzada: ${result.count} articles a «${categoryName(result.category)}». Abans: ${previousClassification}.`;
 }catch(e){confirmError.value=e.message;if(e.code==='CLASSIFICATION_CHANGED'){confirmOpen.value=false;selected.value=new Set();error.value=e.message}}
 finally{saving.value=false}
}
onMounted(load)
</script>
<template>
 <section class="card code-classification">
  <header class="search-header"><h2>Classificació per codi i tones</h2><button class="button secondary" :disabled="busy" @click="load">{{loading?'Carregant…':'Actualitzar articles'}}</button></header>
  <p class="muted">Cerqueu articles amb o sense LER, compareu les tones dels anys seleccionats i marqueu els que vulgueu classificar. El LER es detecta com un codi de sis dígits entre parèntesis, amb espais o un asterisc opcional.</p>
  <fieldset class="filters-panel" :disabled="busy||confirmOpen">
   <legend>Filtres de cerca</legend>
   <div class="code-controls">
    <label>Codis LER<select v-model="mode"><option value="all">Tots els articles</option><option value="with">Amb codi LER</option><option value="without">Sense codi LER</option></select></label>
    <label>Codi entre parèntesis<input v-model="code" maxlength="100" placeholder="Ex.: 020103 o (020103)" :disabled="mode==='without'"></label>
    <label>Article<input v-model="text" type="search" placeholder="Codi o descripció de l’article"></label>
   </div>
   <div class="years-heading"><strong>Anys per calcular les tones</strong><button type="button" class="button secondary compact" :disabled="!years.length" @click="selectedYears=[...years]">Tots els anys</button></div>
   <div class="year-options"><label v-for="year in years" :key="year"><input v-model="selectedYears" type="checkbox" :value="year">{{year}}</label><span v-if="!years.length" class="muted">Sense anys amb vendes confirmades.</span></div>
   <div class="code-controls">
    <label>Tones mínimes<input v-model="minimum" inputmode="decimal" placeholder="Sense mínim"></label>
    <label>Tones màximes<input v-model="maximum" inputmode="decimal" placeholder="Sense màxim"></label>
    <label>Ordenar per<select v-model="sort"><option value="desc">Més tones primer</option><option value="asc">Menys tones primer</option><option value="name">Nom de l’article</option></select></label>
   </div>
   <p class="filter-help">Els límits s’apliquen a la suma de tones dels anys marcats. Canviar els filtres desmarca la selecció d’articles.</p>
  </fieldset>
  <div v-if="error||filterError" class="alert error" role="alert">{{error||filterError}}</div>
  <div v-if="notice" class="alert success" role="status">{{notice}}</div>
  <template v-if="!loading">
   <p role="status"><strong>{{visible.length}}</strong> articles trobats · <strong>{{selectedArticles.length}}</strong> seleccionats · <strong>{{tonnes(selectedTonnes)}} t</strong> seleccionades en el període.</p>
   <div v-if="can('sales_clients.manage')" class="code-controls selection-controls">
    <div class="current-classification"><strong>Classificació actual dels seleccionats</strong><span>{{currentClassification||'Marqueu articles a la llista.'}}</span></div>
    <label>Nova classificació<select v-model="category" :disabled="busy||confirmOpen"><option disabled value="">Seleccioneu una classificació</option><option value="__none__">Sense classificar</option><option v-for="[value,label] in articleCategories" :key="value" :value="value">{{label}}</option></select></label>
    <button class="button primary" :disabled="busy||!category||!selectedArticles.length" @click="requestChange">Classificar {{selectedArticles.length}} seleccionats</button>
   </div>
   <p v-if="!visible.length&&!error&&!filterError" class="muted">No hi ha articles amb aquests filtres.</p>
   <div v-if="visible.length" class="table-wrap"><table class="code-results"><thead><tr><th v-if="can('sales_clients.manage')"><input type="checkbox" :checked="allSelected" :indeterminate="selectedArticles.length>0&&!allSelected" :disabled="busy||confirmOpen" aria-label="Seleccionar tots els articles trobats" @change="toggleAll($event.target.checked)"></th><th>Codi article</th><th>Descripció</th><th>LER</th><th>Classificació actual</th><th v-for="year in visibleYears" :key="year">{{year}} · t</th><th>Total període · t</th></tr></thead><tbody><tr v-for="row in visible" :key="articleKey(row)" :class="{selected:selected.has(articleKey(row))}"><td v-if="can('sales_clients.manage')"><input type="checkbox" :checked="selected.has(articleKey(row))" :disabled="busy||confirmOpen" :aria-label="'Seleccionar '+row.product_name+' ('+row.product_code+')'" @change="toggle(row,$event.target.checked)"></td><td>{{row.product_code}}</td><td>{{row.product_name}}</td><td>{{lerCodes(row.product_name).join(', ')||'Sense LER'}}</td><td>{{categoryName(row.category)}}</td><td v-for="year in visibleYears" :key="year" class="tonnes">{{tonnes(row.quantities?.[year])}}</td><td class="tonnes"><strong>{{tonnes(totalTonnes(row,visibleYears))}}</strong></td></tr></tbody></table></div>
  </template>
 </section>
 <ConfirmDialog :open="confirmOpen" title="Classificar els articles seleccionats" :message="confirmation" :busy="saving" :error="confirmError" busy-text="Desant classificació…" @cancel="confirmOpen=false" @confirm="apply"/>
</template>
<style scoped>
.code-classification h2{margin:0;font-size:1.1rem}
.search-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.filters-panel{border:1px solid var(--border);padding:10px 12px;border-radius:8px;min-width:0}
.filters-panel legend{font-weight:700;font-size:.85rem}
.code-controls{display:flex;align-items:flex-end;flex-wrap:wrap;gap:12px;margin:12px 0}
.current-classification{display:grid;gap:5px;flex:1 1 240px;padding:10px 12px;background:#f4f7f5;border:1px solid var(--border);border-radius:8px;font-size:.85rem}
.current-classification span{color:var(--muted)}
.code-controls label{min-width:min(180px,100%);max-width:100%;flex:1 1 180px;font-size:.8rem}
.code-results th,.code-results td{padding:8px;font-size:.78rem}
.code-results .tonnes{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.code-results input[type=checkbox],.year-options input{width:18px;height:18px;min-height:18px;margin:0;accent-color:var(--primary)}
.code-results tr.selected{background:#eef8f1}
.code-classification .alert{margin-top:12px}
.years-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:.8rem}
.year-options{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0}
.year-options label{display:flex;align-items:center;gap:6px;font-size:.8rem;cursor:pointer;padding:4px 6px}
.filter-help{font-size:.75rem;color:var(--muted);margin:5px 0}
</style>
