<script setup>
import{ref,computed,onMounted}from'vue';import{api}from'../services/api.js';import{can}from'../stores/auth.js';import UiState from'./UiState.vue'
const groups=[['compost','Compost'],['excrements','Excrements'],['fangs','Fangs'],['teixits','Teixits'],['cendres','Cendres'],['altres','Altres'],['no_comptabilitzar','No comptabilitzar']]
const zones=[[null,'Sense classificar'],...groups]
const articles=ref([]),search=ref(''),loading=ref(true),savingCount=ref(0),error=ref(''),success=ref(''),selectedKey=ref(null),hoveredZone=ref(null)
const articleKey=row=>JSON.stringify([row.product_code,row.product_name])
const matches=row=>!search.value||row.product_code.toLowerCase().includes(search.value.toLowerCase())||row.product_name.toLowerCase().includes(search.value.toLowerCase())
const inGroup=category=>articles.value.filter(row=>(row.category||null)===category&&matches(row))
const classifiedCount=computed(()=>articles.value.filter(row=>row.category).length)
const selectedArticle=computed(()=>articles.value.find(row=>articleKey(row)===selectedKey.value))
async function load(){loading.value=true;error.value='';try{articles.value=await api.get('/sales/articles/classification')}catch(e){error.value=e.message}finally{loading.value=false}}
async function assign(key,category){if(!can('sales_clients.manage')||!key)return;const row=articles.value.find(item=>articleKey(item)===key);if(!row)return;const previous=row.category||null;row.category=category;selectedKey.value=null;savingCount.value++;error.value='';success.value='';try{const saved=await api.patch('/sales/articles/classification',{product_code:row.product_code,product_name:row.product_name,category});row.category=saved.category;success.value='Canvi desat.'}catch(e){row.category=previous;error.value=e.message}finally{savingCount.value--}}
function chooseZone(category){if(selectedKey.value)assign(selectedKey.value,category)}
function startDrag(event,row){if(!can('sales_clients.manage'))return;selectedKey.value=articleKey(row);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',articleKey(row))}
const zoneKey=category=>category||'unclassified'
function drop(event,category){hoveredZone.value=null;assign(event.dataTransfer.getData('text/plain')||selectedKey.value,category)}
onMounted(load)
</script>

<template>
 <div class="card grouping-intro">
  <div><h2>Classificació d’articles</h2><p class="muted">Arrossega un article a un tipus o selecciona’l i toca el tipus de destinació.</p></div>
  <span class="badge success">{{classifiedCount}} de {{articles.length}} classificats</span>
 </div>
 <div class="classification-palette" aria-label="Tipus d’article">
  <button v-for="zone in zones" :key="zone[0]||'none'" type="button" class="classification-target" :class="{dragover:hoveredZone===zoneKey(zone[0])}" :disabled="!can('sales_clients.manage')" @click="chooseZone(zone[0])" @dragenter.prevent="hoveredZone=zoneKey(zone[0])" @dragover.prevent @dragleave="hoveredZone=null" @drop="drop($event,zone[0])">
   <strong>{{zone[1]}}</strong><span>{{inGroup(zone[0]).length}}</span>
  </button>
 </div>
 <p v-if="selectedArticle" class="selection-hint" role="status">Seleccionat: <strong>{{selectedArticle.product_name}}</strong>. Ara toca una categoria.</p>
 <div class="toolbar"><label class="search article-table-search"><span class="sr-only">Cercar article</span><input v-model="search" type="search" placeholder="Cercar per codi o nom"></label><span v-if="savingCount" class="badge neutral" role="status">Desant…</span></div>
 <div v-if="success" class="alert success" role="status">{{success}}</div>
 <UiState :loading="loading" :error="error" :empty="!articles.length" empty-text="No s’han trobat articles.">
  <div class="classification-lists">
   <section v-for="zone in zones" :key="zone[0]||'none'" class="classification-list" @dragover.prevent @drop="drop($event,zone[0])">
    <header><h3>{{zone[1]}}</h3><span class="badge neutral">{{inGroup(zone[0]).length}}</span></header>
    <div class="article-stack">
     <button v-for="row in inGroup(zone[0])" :key="articleKey(row)" type="button" class="article-chip" :class="{selected:selectedKey===articleKey(row)}" :draggable="can('sales_clients.manage')" :disabled="!can('sales_clients.manage')" @click="selectedKey=selectedKey===articleKey(row)?null:articleKey(row)" @dragstart="startDrag($event,row)">
      <strong>{{row.product_name}}</strong><small>Codi {{row.product_code}}</small>
     </button>
    </div>
    <p v-if="!inGroup(zone[0]).length" class="muted empty-drop">Cap article.</p>
   </section>
  </div>
 </UiState>
</template>
