<script setup>
import {computed,onMounted,ref} from 'vue'
import {api} from '../services/api.js'
import {articleCategories} from '../constants/articleCategories.js'
import {can} from '../stores/auth.js'
import UiState from './UiState.vue'

const centres=ref([])
const drafts=ref({})
const expanded=ref([])
const onlyMissing=ref(false)
const selectedYears=ref([])
const selectedCategoryKeys=ref([])
const showAllCategories=ref(false)
const loading=ref(false)
const saving=ref('')
const error=ref('')
const notice=ref('')
const search=ref('')

const noneCategory='__none__'
const categoryShortLabels={excrements:'Excr.',teixits:'Teix.',no_comptabilitzar:'No comp.'}
const categoryKey=value=>value==null?noneCategory:String(value)
const categoryLabel=value=>value==null?'Sense classificar':articleCategories.find(([key])=>key===value)?.[1]||value
const categoryShortLabel=value=>value==null?'Sense':categoryShortLabels[value]||categoryLabel(value)
const categoryOrder=key=>key===noneCategory?articleCategories.length:articleCategories.findIndex(([value])=>value===key)
const key=row=>JSON.stringify([row.clientCode,row.centreName])
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('ca').trim()
const date=value=>value?new Intl.DateTimeFormat('ca-ES',{dateStyle:'short'}).format(new Date(value)):'-'
const yearOf=value=>{if(!value)return null;const year=new Date(value).getFullYear();return Number.isFinite(year)?year:null}
const uniqueYears=years=>[...new Set(years.map(Number).filter(Boolean))]
const rowYears=row=>Array.isArray(row.years)&&row.years.length?uniqueYears(row.years):uniqueYears([yearOf(row.firstDate),yearOf(row.lastDate)])
const selectedYearNumbers=computed(()=>uniqueYears(selectedYears.value))
const selectedCategorySet=computed(()=>new Set(selectedCategoryKeys.value))
const yearOptions=computed(()=>uniqueYears(centres.value.flatMap(rowYears)).sort((a,b)=>b-a))
function categoriesForYears(row,years){
 const stats=row.yearStats||{},values=[]
 const yearsToCheck=years.length?years:rowYears(row)
 for(const year of yearsToCheck){
  const stat=stats[year]||stats[String(year)]
  if(Array.isArray(stat?.categories))values.push(...stat.categories)
 }
 if(!years.length&&!values.length&&Array.isArray(row.categories))values.push(...row.categories)
 return [...new Set(values.map(categoryKey))]
}
const categoryOptions=computed(()=>{
 const seen=new Set()
 for(const row of centres.value)for(const key of categoriesForYears(row,selectedYearNumbers.value))seen.add(key)
 return [...articleCategories.map(([category,label])=>({key:category,category,label,shortLabel:categoryShortLabel(category)})),{key:noneCategory,category:null,label:'Sense classificar',shortLabel:'Sense'}]
  .filter(item=>seen.has(item.key)||selectedCategorySet.value.has(item.key))
  .sort((a,b)=>categoryOrder(a.key)-categoryOrder(b.key)||a.label.localeCompare(b.label,'ca'))
})
const visibleCategoryOptions=computed(()=>!selectedCategoryKeys.value.length||showAllCategories.value?categoryOptions.value:categoryOptions.value.filter(item=>selectedCategorySet.value.has(item.key)))
const matchesYear=row=>!selectedYearNumbers.value.length||rowYears(row).some(year=>selectedYearNumbers.value.includes(year))
const matchesCategory=row=>!selectedCategoryKeys.value.length||categoriesForYears(row,selectedYearNumbers.value).some(key=>selectedCategorySet.value.has(key))
const hasObservation=row=>String(drafts.value[key(row)]||'').trim().length>0
const rowMatches=(row,term)=>matchesYear(row)&&matchesCategory(row)&&(!onlyMissing.value||!hasObservation(row))&&(!term||normalize(row.clientName).includes(term)||normalize(row.clientCode).includes(term)||normalize(row.centreName).includes(term)||normalize(drafts.value[key(row)]).includes(term))
function rowStats(row){
 const stats=row.yearStats||{}
 if(!Object.keys(stats).length)return {noteCount:Number(row.noteCount||0),firstDate:row.firstDate,lastDate:row.lastDate}
 const years=selectedYearNumbers.value.length?selectedYearNumbers.value.filter(year=>rowYears(row).includes(year)):rowYears(row)
 let noteCount=0,firstDate='',lastDate=''
 for(const year of years){
  const stat=stats[year]||stats[String(year)]
  if(!stat)continue
  noteCount+=Number(stat.noteCount||0)
  if(stat.firstDate&&(!firstDate||String(stat.firstDate)<String(firstDate)))firstDate=stat.firstDate
  if(stat.lastDate&&(!lastDate||String(stat.lastDate)>String(lastDate)))lastDate=stat.lastDate
 }
 return {noteCount,firstDate,lastDate}
}
const formatRange=(firstDate,lastDate)=>firstDate||lastDate?(firstDate===lastDate?date(firstDate):`${date(firstDate)} - ${date(lastDate)}`):'-'
const groupedClients=computed(()=>{
 const term=normalize(search.value),clients=new Map()
 for(const row of centres.value){
  if(!rowMatches(row,term))continue
  const stats=rowStats(row),id=row.clientCode||row.clientName
  if(!clients.has(id))clients.set(id,{clientCode:row.clientCode,clientName:row.clientName,centres:[],noteCount:0,firstDate:'',lastDate:''})
  const client=clients.get(id)
  client.centres.push({...row,visibleNoteCount:stats.noteCount,visibleFirstDate:stats.firstDate,visibleLastDate:stats.lastDate})
  client.noteCount+=stats.noteCount
  if(stats.firstDate&&(!client.firstDate||String(stats.firstDate)<String(client.firstDate)))client.firstDate=stats.firstDate
  if(stats.lastDate&&(!client.lastDate||String(stats.lastDate)>String(client.lastDate)))client.lastDate=stats.lastDate
 }
 return [...clients.values()]
})
const isExpanded=client=>expanded.value.includes(client.clientCode)
function toggle(client){expanded.value=isExpanded(client)?expanded.value.filter(code=>code!==client.clientCode):[...expanded.value,client.clientCode]}
function toggleYear(year){const value=Number(year);selectedYears.value=selectedYearNumbers.value.includes(value)?selectedYearNumbers.value.filter(item=>item!==value):[...selectedYearNumbers.value,value].sort((a,b)=>b-a)}
function toggleCategory(category){selectedCategoryKeys.value=selectedCategorySet.value.has(category)?selectedCategoryKeys.value.filter(item=>item!==category):[...selectedCategoryKeys.value,category];showAllCategories.value=false}
function clearYears(){selectedYears.value=[]}
function clearCategories(){selectedCategoryKeys.value=[];showAllCategories.value=false}
async function load(){loading.value=true;error.value='';notice.value='';try{centres.value=await api.get('/sales/centres');drafts.value=Object.fromEntries(centres.value.map(row=>[key(row),row.comment||'']));expanded.value=[]}catch(e){error.value=e.message}finally{loading.value=false}}
async function save(row){const id=key(row);saving.value=id;error.value='';notice.value='';try{const result=await api.put('/sales/centres/observation',{clientCode:row.clientCode,centreName:row.centreName,comment:drafts.value[id]||''});row.comment=result.comment;drafts.value[id]=result.comment;notice.value='Observació desada'}catch(e){error.value=e.message}finally{saving.value=''}}
onMounted(load)
</script>
<template>
 <section class="card centre-observation-tools">
  <label class="centre-search">Cercar centre<input v-model="search" type="search" placeholder="Client o centre"></label>
  <div class="filter-stack">
   <div v-if="categoryOptions.length" class="chip-filter" role="group" aria-label="Classificacio">
    <span>Class.</span>
    <button type="button" class="filter-chip" :class="{active:!selectedCategoryKeys.length}" :aria-pressed="!selectedCategoryKeys.length" @click="clearCategories">Totes</button>
    <button v-if="selectedCategoryKeys.length&&!showAllCategories" type="button" class="filter-chip" @click="showAllCategories=true">Canviar</button>
    <button v-if="selectedCategoryKeys.length&&showAllCategories" type="button" class="filter-chip" @click="showAllCategories=false">Fet</button>
    <button v-for="item in visibleCategoryOptions" :key="item.key" type="button" class="filter-chip" :class="{active:selectedCategorySet.has(item.key)}" :aria-pressed="selectedCategorySet.has(item.key)" :title="item.label" @click="toggleCategory(item.key)">{{item.shortLabel}}</button>
   </div>
   <div class="chip-filter" role="group" aria-label="Anys">
    <span>Anys</span>
    <button type="button" class="filter-chip" :class="{active:!selectedYearNumbers.length}" :aria-pressed="!selectedYearNumbers.length" @click="clearYears">Tots</button>
    <button v-for="year in yearOptions" :key="year" type="button" class="filter-chip" :class="{active:selectedYearNumbers.includes(year)}" :aria-pressed="selectedYearNumbers.includes(year)" @click="toggleYear(year)">{{year}}</button>
   </div>
  </div>
  <button type="button" class="button secondary compact" :class="{active:onlyMissing}" :aria-pressed="onlyMissing" @click="onlyMissing=!onlyMissing">{{onlyMissing?'Tot':'Sense observació'}}</button>
  <button class="button secondary compact" :disabled="loading" @click="load">Actualitzar</button>
 </section>
 <div v-if="notice" class="alert success" role="status">{{notice}}</div>
 <UiState :loading="loading" :error="error" :empty="!groupedClients.length" empty-text="No hi ha centres confirmats amb aquests filtres.">
  <div class="table-wrap"><table class="centre-observations"><thead><tr><th>Client / centre</th><th>Albarans</th><th>Periode</th><th>Observació</th><th></th></tr></thead><tbody>
   <template v-for="client in groupedClients" :key="client.clientCode">
    <tr class="client-row"><td><button type="button" class="client-toggle" :aria-expanded="isExpanded(client)" @click="toggle(client)"><span>{{isExpanded(client)?'▾':'▸'}}</span><strong>{{client.clientName||client.clientCode}}</strong><small>{{client.clientCode}} · {{client.centres.length}} centres</small></button></td><td class="number">{{client.noteCount}}</td><td><small>{{formatRange(client.firstDate,client.lastDate)}}</small></td><td></td><td></td></tr>
    <template v-if="isExpanded(client)">
     <tr v-for="row in client.centres" :key="key(row)" class="centre-row"><td><span class="centre-name">{{row.centreName}}</span></td><td class="number">{{row.visibleNoteCount}}</td><td><small>{{formatRange(row.visibleFirstDate,row.visibleLastDate)}}</small></td><td><textarea v-model="drafts[key(row)]" maxlength="2000" rows="2" :readonly="!can('sales_clients.manage')" placeholder="Observació visible als llistats"></textarea></td><td><button class="button primary compact" :disabled="!can('sales_clients.manage')||saving===key(row)||drafts[key(row)]===(row.comment||'')" @click="save(row)">{{saving===key(row)?'Desant...':'Desar'}}</button></td></tr>
    </template>
   </template>
  </tbody></table></div>
 </UiState>
</template>
<style scoped>
.centre-observation-tools{display:flex;align-items:end;gap:6px;flex-wrap:nowrap;margin-bottom:12px;padding:10px;border-radius:8px;overflow-x:auto}.centre-observation-tools .centre-search{flex:0 0 135px;min-width:115px}.centre-observation-tools .centre-search input{width:100%;min-width:0}.centre-observation-tools .button.compact{padding:5px 9px;min-height:30px;white-space:nowrap}.filter-stack{display:grid;gap:2px;flex:0 0 auto;min-width:max-content}.chip-filter{display:flex;align-items:center;gap:4px;min-width:max-content}.chip-filter>span{font-weight:650;font-size:.74rem;color:var(--muted)}.filter-chip{border:1px solid var(--border);border-radius:4px;background:#fff;color:inherit;padding:3px 6px;min-height:26px;font:inherit;font-size:.68rem;line-height:1;cursor:pointer;white-space:nowrap}.filter-chip.active{border-color:var(--primary);background:#eef8f1;color:var(--primary);font-weight:700}.centre-observations{min-width:900px;font-size:.82rem}.centre-observations th,.centre-observations td{vertical-align:top}.centre-observations textarea{width:100%;box-sizing:border-box;min-width:240px;resize:vertical}.centre-observations .number{text-align:right;font-variant-numeric:tabular-nums}.client-row td{background:#fff}.centre-row td{background:#f7faf8}.client-toggle{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;text-align:left;color:inherit;cursor:pointer;padding:0}.client-toggle span{display:inline-grid;place-items:center;width:18px;height:18px;border:1px solid var(--border);border-radius:4px;background:#fff;color:var(--primary);font-size:.72rem}.client-toggle strong,.client-toggle small{display:block}.client-toggle small{color:var(--muted)}.centre-name{display:block;padding-left:30px;font-weight:650;color:var(--muted)}
</style>