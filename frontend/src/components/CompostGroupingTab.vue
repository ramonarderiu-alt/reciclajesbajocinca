<script setup>
import{ref,computed,onMounted}from'vue';import{api}from'../services/api.js';import{can}from'../stores/auth.js';import UiState from'./UiState.vue'
import {articleCategories as groups} from '../constants/articleCategories.js'
const zones=[[null,'Sense classificar'],...groups]
const firstCategory=ref(null)
const orderedZones=computed(()=>[...zones.filter(([category])=>category===firstCategory.value),...zones.filter(([category])=>category!==firstCategory.value)])
const articles=ref([]),search=ref(''),loading=ref(true),savingCount=ref(0),error=ref(''),success=ref(''),selectedKey=ref(null),hoveredZone=ref(null)
const years=computed(()=>[...new Set(articles.value.flatMap(row=>Object.keys(row.quantities||{})))].map(Number).sort((a,b)=>b-a))
const tonnes=value=>new Intl.NumberFormat('ca-ES',{maximumFractionDigits:4}).format(Number(value||0))
const articleKey=row=>JSON.stringify([row.product_code,row.product_name])
const matches=row=>!search.value||row.product_code.toLowerCase().includes(search.value.toLowerCase())||row.product_name.toLowerCase().includes(search.value.toLowerCase())
const inGroup=category=>articles.value.filter(row=>(row.category||null)===category&&matches(row))
const classifiedCount=computed(()=>articles.value.filter(row=>row.category).length)
const selectedArticle=computed(()=>articles.value.find(row=>articleKey(row)===selectedKey.value))
async function load(){loading.value=true;error.value='';try{articles.value=await api.get('/sales/articles/classification')}catch(e){error.value=e.message}finally{loading.value=false}}
async function assign(key,category){if(!can('sales_clients.manage')||!key)return;const row=articles.value.find(item=>articleKey(item)===key);if(!row)return;const previous=row.category||null;row.category=category;selectedKey.value=null;savingCount.value++;error.value='';success.value='';try{const saved=await api.patch('/sales/articles/classification',{product_code:row.product_code,product_name:row.product_name,category});row.category=saved.category;success.value='Canvi desat.'}catch(e){row.category=previous;error.value=e.message}finally{savingCount.value--}}
function chooseZone(category){firstCategory.value=category;if(selectedKey.value)assign(selectedKey.value,category)}
function startDrag(event,row){if(!can('sales_clients.manage'))return;selectedKey.value=articleKey(row);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',articleKey(row))}
const zoneKey=category=>category||'unclassified'
function drop(event,category){hoveredZone.value=null;assign(event.dataTransfer.getData('text/plain')||selectedKey.value,category)}
onMounted(load)
</script>

<template>
 <div class="card grouping-intro">
  <div><h2>Classificació d’articles</h2><p class="muted">Arrossega un article a un tipus o selecciona’l i toca el tipus de destinació. Clica un tipus de dalt per posar-lo a la primera columna. Consulta les tones de cada any per decidir.</p></div>
  <span class="badge success">{{classifiedCount}} de {{articles.length}} classificats</span>
 </div>
 <div class="classification-palette" aria-label="Tipus d’article">
  <button v-for="zone in zones" :key="zone[0]||'none'" type="button" class="classification-target" :class="{dragover:hoveredZone===zoneKey(zone[0]),active:firstCategory===zone[0]}" :aria-pressed="firstCategory===zone[0]" @click="chooseZone(zone[0])" @dragenter.prevent="hoveredZone=zoneKey(zone[0])" @dragover.prevent @dragleave="hoveredZone=null" @drop="drop($event,zone[0])">
   <strong>{{zone[1]}}</strong><span>{{inGroup(zone[0]).length}}</span>
  </button>
 </div>
 <p v-if="selectedArticle" class="selection-hint" role="status">Seleccionat: <strong>{{selectedArticle.product_name}}</strong>. Ara toca una categoria.</p>
 <div class="toolbar"><label class="search article-table-search"><span class="sr-only">Cercar article</span><input v-model="search" type="search" placeholder="Cercar per codi o nom"></label><span v-if="savingCount" class="badge neutral" role="status">Desant…</span></div>
 <div v-if="success" class="alert success" role="status">{{success}}</div>
 <UiState :loading="loading" :error="error" :empty="!articles.length" empty-text="No s’han trobat articles.">
  <div class="classification-lists">
   <section v-for="zone in orderedZones" :key="zone[0]||'none'" class="classification-list" @dragover.prevent @drop="drop($event,zone[0])">
    <header><h3>{{zone[1]}}</h3><span class="badge neutral">{{inGroup(zone[0]).length}}</span></header>
    <div class="article-stack">
     <button v-for="row in inGroup(zone[0])" :key="articleKey(row)" type="button" class="article-chip" :class="{selected:selectedKey===articleKey(row)}" :draggable="can('sales_clients.manage')" :disabled="!can('sales_clients.manage')" @click="selectedKey=selectedKey===articleKey(row)?null:articleKey(row)" @dragstart="startDrag($event,row)">
      <strong>{{row.product_name}}</strong><small>Codi {{row.product_code}}</small>
      <span v-if="years.length" class="article-tonnes" aria-label="Tones per any">
       <span v-for="year in years" :key="year" class="article-tonnes-year"><span class="article-year">{{year}}</span><span class="article-quantity">{{tonnes(row.quantities?.[year])}} t</span></span>
      </span>
      <small v-else>Sense vendes confirmades amb data.</small>
     </button>
    </div>
    <p v-if="!inGroup(zone[0]).length" class="muted empty-drop">Cap article.</p>
   </section>
  </div>
 </UiState>
</template>

<style scoped>
.classification-palette{display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;padding-bottom:4px}
.classification-palette .classification-target{flex:0 0 auto;white-space:nowrap}

.classification-lists{gap:10px}
.classification-list{padding:8px;min-height:90px;border-radius:9px}
.classification-list>header{margin-bottom:6px;gap:6px}
.classification-list h3{font-size:.88rem}
.article-stack{gap:5px}
.classification-list .article-chip{grid-template-columns:minmax(0,1fr);justify-content:stretch;padding:6px 8px;gap:3px;border-radius:6px}
.classification-list .article-chip>strong{font-size:.8rem;line-height:1.25;overflow-wrap:anywhere}
.classification-list .article-chip>small{margin-top:0;font-size:.65rem;line-height:1.2}
.article-chip .article-tonnes{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));column-gap:10px;row-gap:2px;overflow:visible;width:100%;border-top:1px solid var(--border);padding-top:4px;margin-top:2px}
.article-chip .article-tonnes-year{display:flex;align-items:baseline;justify-content:space-between;gap:5px;overflow:visible;line-height:1.3}
.article-chip .article-year{font-size:.68rem;color:var(--muted);flex:none}
.article-chip .article-quantity{font-weight:600;font-size:.72rem;color:inherit;font-variant-numeric:tabular-nums;overflow:visible;text-align:right;overflow-wrap:anywhere;min-width:0}
.classification-list .empty-drop{padding:10px 5px;font-size:.8rem}
.classification-target{min-height:36px;padding:5px 8px;font-size:.78rem}
.classification-target.active{border-color:var(--primary);background:#eef8f1;box-shadow:inset 0 -2px 0 var(--primary)}
.classification-target span{min-width:20px;height:20px;font-size:.65rem}
</style>
