<script setup>
import {ref,computed,onMounted} from 'vue'
import {api} from '../services/api.js'
import {articleCategories} from '../constants/articleCategories.js'
import BaseModal from './BaseModal.vue'
import UiState from './UiState.vue'

const data=ref({years:[],rows:[]}),loading=ref(false),error=ref(''),showAll=ref(false),expanded=ref(null),view=ref('clients'),selectedCategory=ref(''),selectedYears=ref([]),expandedClients=ref([]),detail=ref(null),detailRows=ref([]),detailLoading=ref(false),detailError=ref('')
const categoryKey=category=>category??'__none__'
const categoryName=category=>category==null?'Sense classificar':articleCategories.find(([key])=>key===category)?.[1]||category
const categoryOrder=category=>category==null?articleCategories.length:articleCategories.findIndex(([key])=>key===category)
const rows=computed(()=>[...data.value.rows].sort((a,b)=>categoryOrder(a.category)-categoryOrder(b.category)))
const orderedYears=computed(()=>[...data.value.years].sort((a,b)=>Number(a)-Number(b)))
const years=computed(()=>showAll.value?orderedYears.value:orderedYears.value.slice(-4))
const categoryOptions=computed(()=>rows.value.map(row=>({key:categoryKey(row.category),category:row.category,label:categoryName(row.category)})))
const selectedPriceRow=computed(()=>rows.value.find(row=>categoryKey(row.category)===(selectedCategory.value||categoryOptions.value[0]?.key))||rows.value[0])
const clientYearOptions=orderedYears
const selectedClientYears=computed(()=>clientYearOptions.value.filter(year=>selectedYears.value.includes(String(year))))
const tonnes=value=>new Intl.NumberFormat('ca-ES',{maximumFractionDigits:4}).format(Number(value||0))
const money=value=>new Intl.NumberFormat('ca-ES',{style:'currency',currency:'EUR'}).format(Number(value||0))
const percent=value=>new Intl.NumberFormat('ca-ES',{maximumFractionDigits:1}).format(Number(value||0)*100)+' %'
const price=value=>value==null?'—':new Intl.NumberFormat('ca-ES',{minimumFractionDigits:2,maximumFractionDigits:4}).format(Number(value))+' €/t'
const date=value=>value?new Intl.DateTimeFormat('ca-ES',{dateStyle:'short'}).format(new Date(value)):'—'
const averagePrice=(base,quantity)=>{const q=Number(quantity||0);return q?Number(base||0)/q:null}
const detailTotals=computed(()=>detailRows.value.reduce((sum,row)=>({quantity:sum.quantity+Number(row.quantity||0),taxableBase:sum.taxableBase+Number(row.taxable_base||0),totalAmount:sum.totalAmount+Number(row.total_amount||0)}),{quantity:0,taxableBase:0,totalAmount:0}))
const isOpen=(row,year)=>expanded.value?.category===categoryKey(row.category)&&expanded.value?.year===year
function toggle(row,year){expanded.value=isOpen(row,year)?null:{category:categoryKey(row.category),year}}
function toggleYears(){showAll.value=!showAll.value;expanded.value=null}
function ensureClientSelection(){if(!categoryOptions.value.some(item=>item.key===selectedCategory.value))selectedCategory.value=categoryOptions.value[0]?.key||'';if(!selectedYears.value.length)selectedYears.value=orderedYears.value.map(String)}
function selectAllClientYears(){selectedYears.value=orderedYears.value.map(String)}
function clearClientYears(){selectedYears.value=[]}
function addYearData(target,source){target.quantity+=Number(source.quantity||0);target.taxableBase+=Number(source.taxableBase||0);target.averagePrice=averagePrice(target.taxableBase,target.quantity)}
function sortedByYearQuantity(items,year){return [...items].sort((a,b)=>Number(b.years?.[year]?.quantity||0)-Number(a.years?.[year]?.quantity||0)||Number(b.quantity||0)-Number(a.quantity||0)||String(a.centreName||a.clientName||a.clientCode).localeCompare(String(b.centreName||b.clientName||b.clientCode),'ca'))}
const strongestDeviation=(current,next)=>Number(next?.ratio||0)>Number(current?.ratio||0)?next:current
function clientPriceRows(){
 const clients=new Map()
 for(const year of selectedClientYears.value){
  for(const centre of selectedPriceRow.value?.years?.[year]?.centres||[]){
   const clientKey=String(centre.clientCode||centre.clientName||'')
   if(!clients.has(clientKey))clients.set(clientKey,{rowKey:clientKey,isCentre:false,clientCode:centre.clientCode,clientName:centre.clientName,centreName:null,years:{},quantity:0,taxableBase:0,averagePrice:null,centres:new Map()})
   const client=clients.get(clientKey)
   client.years[year]??={quantity:0,taxableBase:0,averagePrice:null}
   addYearData(client.years[year],centre)
   addYearData(client,centre)
   const centreKey=JSON.stringify([clientKey,centre.centreName])
   if(!client.centres.has(centreKey))client.centres.set(centreKey,{rowKey:centreKey,isCentre:true,clientKey,clientCode:centre.clientCode,clientName:centre.clientName,centreName:centre.centreName,comment:centre.comment||'',years:{},quantity:0,taxableBase:0,averagePrice:null})
   const centreRow=client.centres.get(centreKey)
   centreRow.years[year]??={quantity:0,taxableBase:0,averagePrice:null,priceDeviation:null}
   addYearData(centreRow.years[year],centre)
   centreRow.years[year].priceDeviation=strongestDeviation(centreRow.years[year].priceDeviation,centre.priceDeviation)
   addYearData(centreRow,centre)
  }
 }
 const currentSortYear=selectedClientYears.value[selectedClientYears.value.length-1]
 const result=[]
 for(const client of clients.values()){
  const centres=[...client.centres.values()]
  result.push({...client,centres:sortedByYearQuantity(centres,currentSortYear)})
 }
 return sortedByYearQuantity(result,currentSortYear)
}
const clientRows=computed(clientPriceRows)
function isClientExpanded(row){return expandedClients.value.includes(row.rowKey)}
function toggleClient(row){expandedClients.value=isClientExpanded(row)?expandedClients.value.filter(key=>key!==row.rowKey):[...expandedClients.value,row.rowKey]}
function alertLevel(deviation){const ratio=Number(deviation?.ratio||0);if(ratio>0.5)return 'critical';if(ratio>0.2)return 'high';if(ratio>0.1)return 'medium';return ''}
function alertTitle(deviation){const ratio=Number(deviation?.ratio||0);if(!ratio)return '';const direction=deviation.direction==='above'?'per sobre':'per sota',note=deviation.deliveryNoteNumber?` · albarà ${deviation.deliveryNoteNumber}`:'';return `${percent(ratio)} ${direction} de la mitjana del mateix centre i any${note}`}
const yearsText=years=>years.join(', ')
async function openClientPriceDetail(row,yearsToOpen){
 const yearList=[...new Set(yearsToOpen.map(Number).filter(Boolean))].sort((a,b)=>a-b),category=selectedPriceRow.value?.category??null
 if(!row?.clientCode||!yearList.length||!selectedPriceRow.value)return
 detail.value={clientName:row.clientName||row.clientCode,clientCode:row.clientCode,centreName:row.isCentre?row.centreName:undefined,isCentre:!!row.isCentre,categoryName:categoryName(category),years:yearList}
 detailRows.value=[];detailError.value='';detailLoading.value=true
 try{
  const results=await Promise.all(yearList.map(year=>{const params=new URLSearchParams({from:`${year}-01-01`,to:`${year}-12-31`,article:''});params.set('category',category==null?'__none__':category);if(row.isCentre)params.set('centre',row.centreName||'');return api.get(`/sales/clients/${encodeURIComponent(row.clientCode)}?${params}`)}))
  detailRows.value=results.flat().sort((a,b)=>String(b.delivery_date||'').localeCompare(String(a.delivery_date||''))||String(b.delivery_note_number||'').localeCompare(String(a.delivery_note_number||''))||Number(b.id||0)-Number(a.id||0))
 }catch(e){detailError.value=e.message}finally{detailLoading.value=false}
}
async function load(){loading.value=true;error.value='';expanded.value=null;expandedClients.value=[];try{data.value=await api.get('/sales/articles/classification/prices');ensureClientSelection()}catch(e){error.value=e.message}finally{loading.value=false}}
onMounted(load)
</script>
<template>
 <div class="tabs price-tabs" role="tablist" aria-label="Vistes de preus per classificació"><button type="button" :class="{active:view==='matrix'}" @click="view='matrix'">Matriu per classificació</button><button type="button" :class="{active:view==='clients'}" @click="view='clients'">Preus per client</button></div>
 <div class="toolbar price-toolbar"><button class="button secondary" :disabled="loading" @click="load">Actualitzar</button><button v-if="view==='matrix'&&data.years.length>4" class="button secondary" :aria-pressed="showAll" @click="toggleYears">{{showAll?'Veure últims 4 anys':'Veure tots els anys'}}</button></div>
 <p class="price-explanation"><strong>Preu mitjà ponderat (€/t):</strong> suma de bases sense IVA dividida per les tones. S'utilitzen vendes confirmades amb data, tones diferents de zero i base informada; s'inclouen els imports a zero i les rectificacions.</p>
 <UiState :loading="loading" :error="error" :empty="!rows.length" empty-text="No hi ha vendes amb dades per calcular els preus mitjans.">
  <template v-if="view==='matrix'">
   <div class="table-wrap"><table class="price-matrix"><thead><tr><th>Classificació</th><th v-for="year in years" :key="year">{{year}}</th></tr></thead><tbody>
    <template v-for="row in rows" :key="categoryKey(row.category)">
     <tr><th scope="row">{{categoryName(row.category)}}</th><td v-for="year in years" :key="year"><button v-if="row.years[year]" class="price-button" :class="{active:isOpen(row,year)}" :aria-expanded="isOpen(row,year)" :aria-label="'Veure preus per client i centre de '+categoryName(row.category)+' de '+year" @click="toggle(row,year)"><strong>{{price(row.years[year].averagePrice)}}</strong><small>{{isOpen(row,year)?'▾':'▸'}} {{tonnes(row.years[year].quantity)}} t</small></button><span v-else>—</span></td></tr>
     <tr v-if="expanded?.category===categoryKey(row.category)" class="expanded-prices"><td :colspan="years.length+1">
      <section class="price-detail">
       <header><h3>{{categoryName(row.category)}} · {{expanded.year}} — Clients i centres</h3><button class="button secondary compact" @click="expanded=null">Tancar detall</button></header>
       <p><strong>{{price(row.years[expanded.year].averagePrice)}}</strong> · {{tonnes(row.years[expanded.year].quantity)}} t · Base sense IVA: {{money(row.years[expanded.year].taxableBase)}}</p>
       <div class="table-wrap"><table class="centre-prices"><thead><tr><th>Client</th><th>Centre</th><th>Tones</th><th>Base sense IVA</th><th>Preu mitjà</th></tr></thead><tbody><tr v-for="centre in row.years[expanded.year].centres" :key="JSON.stringify([centre.clientCode,centre.centreName])"><td><strong>{{centre.clientName||centre.clientCode}}</strong><small>{{centre.clientCode}}</small></td><td>{{centre.centreName||'Sense centre informat'}}<small v-if="centre.comment" class="centre-comment">{{centre.comment}}</small></td><td class="number">{{tonnes(centre.quantity)}} t</td><td class="number">{{money(centre.taxableBase)}}</td><td class="number"><strong>{{price(centre.averagePrice)}}</strong></td></tr></tbody></table></div>
      </section>
     </td></tr>
    </template>
   </tbody></table></div>
  </template>
  <template v-else>
   <section class="card client-price-controls"><label>Classificació<select v-model="selectedCategory"><option v-for="item in categoryOptions" :key="item.key" :value="item.key">{{item.label}}</option></select></label><div class="year-picker"><span>Anys</span><div><label v-for="year in clientYearOptions" :key="year" class="year-check"><input v-model="selectedYears" type="checkbox" :value="String(year)">{{year}}</label></div><footer><button type="button" class="button secondary compact" @click="selectAllClientYears">Tots</button><button type="button" class="button secondary compact" @click="clearClientYears">Netejar</button></footer></div></section>
   <div class="table-wrap"><table class="client-prices"><thead><tr><th>Client</th><th v-for="year in selectedClientYears" :key="year">{{year}}</th></tr></thead><tbody>
    <template v-for="row in clientRows" :key="row.rowKey">
     <tr class="client-row"><td><button type="button" class="client-toggle" :aria-expanded="isClientExpanded(row)" :aria-label="(isClientExpanded(row)?'Plegar':'Desplegar')+' centres de '+(row.clientName||row.clientCode)" @click="toggleClient(row)"><span class="toggle-icon">{{isClientExpanded(row)?'▾':'▸'}}</span><span><strong>{{row.clientName||row.clientCode}}</strong><small>{{row.clientCode}} · {{row.centres.length}} centres</small></span></button></td><td v-for="year in selectedClientYears" :key="year" class="number"><button v-if="row.years[year]" type="button" class="client-price-button" :aria-label="'Veure llistat de '+(row.clientName||row.clientCode)+' de '+year" @click="openClientPriceDetail(row,[year])"><span><strong>{{price(row.years[year].averagePrice)}}</strong></span><small>{{tonnes(row.years[year].quantity)}} t</small></button><span v-else>—</span></td></tr>
     <template v-if="isClientExpanded(row)">
      <tr v-for="centre in row.centres" :key="centre.rowKey" class="centre-row"><td><span class="centre-name">{{centre.centreName||'Sense centre informat'}}</span><small v-if="centre.comment" class="centre-comment">{{centre.comment}}</small></td><td v-for="year in selectedClientYears" :key="year" class="number"><button v-if="centre.years[year]" type="button" class="client-price-button" :aria-label="'Veure llistat de '+(centre.clientName||centre.clientCode)+' - '+(centre.centreName||'Sense centre informat')+' de '+year" @click="openClientPriceDetail(centre,[year])"><span><i v-if="alertLevel(centre.years[year].priceDeviation)" class="price-alert-dot" :class="alertLevel(centre.years[year].priceDeviation)" :title="alertTitle(centre.years[year].priceDeviation)"></i><strong>{{price(centre.years[year].averagePrice)}}</strong></span><small>{{tonnes(centre.years[year].quantity)}} t</small></button><span v-else>—</span></td></tr>
     </template>
    </template>
   </tbody></table></div>
  </template>
 </UiState>
 <BaseModal :open="!!detail" size="large" :title="detail?`${detail.clientName} · ${yearsText(detail.years)}`:''" @close="detail=null">
  <p v-if="detail"><strong>Classificació:</strong> {{detail.categoryName}}</p>
  <p v-if="detail?.isCentre"><strong>Centre:</strong> {{detail.centreName||'Sense centre informat'}}</p>
  <UiState :loading="detailLoading" :error="detailError" :empty="!detailRows.length" empty-text="No hi ha línies amb aquests filtres.">
   <div class="detail-summary"><span><strong>{{detailRows.length}}</strong> línies</span><span><strong>{{tonnes(detailTotals.quantity)}} t</strong></span><span>Base: <strong>{{money(detailTotals.taxableBase)}}</strong></span><span>Total: <strong>{{money(detailTotals.totalAmount)}}</strong></span></div>
   <div class="table-wrap detail-lines-wrap"><table class="detail-lines-table"><thead><tr><th>Data</th><th>Client</th><th>Centre</th><th>Albarà</th><th>Article i concepte</th><th>t</th><th>Preu</th><th>Base</th><th>Total</th></tr></thead><tbody><tr v-for="row in detailRows" :key="row.id"><td>{{date(row.delivery_date)}}</td><td><strong>{{row.client_name}}</strong><small>{{row.client_code}}</small></td><td>{{row.centre_name||'Sense centre informat'}}<small v-if="row.centre_comment" class="centre-comment">{{row.centre_comment}}</small></td><td>{{row.delivery_note_number}}</td><td><strong>{{row.product_code}}</strong><div>{{row.concept}}</div></td><td class="number">{{tonnes(row.quantity)}}</td><td class="number">{{money(row.unit_price)}}</td><td class="number">{{money(row.taxable_base)}}</td><td class="number">{{money(row.total_amount)}}</td></tr></tbody></table></div>
  </UiState>
  <template #actions><button class="button secondary" @click="detail=null">Tancar</button></template>
 </BaseModal>
</template>
<style scoped>
.price-tabs{margin-bottom:12px}.price-toolbar{justify-content:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:10px}
.price-explanation{font-size:.8rem;color:var(--muted);line-height:1.5;margin:0 0 12px}
.price-matrix{min-width:600px;table-layout:fixed;font-size:.8rem}
.price-matrix>thead th,.price-matrix>tbody>tr>th,.price-matrix>tbody>tr>td{padding:8px}
.price-matrix>thead th:first-child{width:22%}
.price-matrix>thead th:not(:first-child),.price-matrix>tbody>tr>td{text-align:right}
.price-matrix>tbody>tr>th{font-size:.8rem;text-transform:none;letter-spacing:0;color:inherit}
.price-button{display:grid;gap:4px;width:100%;border:1px solid var(--border);border-radius:5px;background:#fff;padding:8px 6px;color:var(--primary);cursor:pointer;text-align:right;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.price-button:hover,.price-button.active,.client-price-button:hover{background:#eef8f1;border-color:var(--primary)}
.price-button small{color:var(--muted);font-size:.7rem}
.price-matrix>tbody>.expanded-prices>td{text-align:left;background:#f4f7f5;padding:12px}
.price-detail header{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.price-detail h3{font-size:.9rem;margin:0}.price-detail p{font-size:.8rem}
.centre-prices,.client-prices{min-width:680px;font-size:.78rem}
.centre-prices th,.centre-prices td,.client-prices th,.client-prices td{padding:8px;text-align:left}
.centre-prices .number,.client-prices .number{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.client-row>td{background:#fff}.centre-comment{display:block;color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere;margin-top:3px}.centre-row>td{background:#f7faf8}.centre-row td:first-child{border-left:3px solid #d9e7dc}
.client-toggle{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;padding:2px 0}.client-toggle strong,.client-toggle small{display:block}.client-toggle small,.centre-name{color:var(--muted)}.toggle-icon{display:inline-grid;place-items:center;width:18px;height:18px;border:1px solid var(--border);border-radius:4px;background:#fff;color:var(--primary);font-size:.72rem;line-height:1}.centre-name{display:block;padding-left:26px;font-weight:650}
.client-price-controls{display:flex;align-items:end;gap:12px;flex-wrap:wrap;padding:12px;margin-bottom:12px;border-radius:8px}.client-price-controls>label{min-width:180px}.year-picker{display:grid;gap:5px;flex:1;min-width:260px;font-weight:650;font-size:.82rem}.year-picker>div{display:flex;flex-wrap:nowrap;gap:5px;overflow-x:auto;padding-bottom:2px}.year-picker footer{display:flex;gap:6px}.year-check{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;width:max-content;min-width:0;border:1px solid var(--border);border-radius:4px;padding:3px 5px;background:#fff;font-size:.68rem;line-height:1}.year-check input{width:12px;min-height:12px}
.client-price-button{display:grid;gap:2px;justify-items:end;width:100%;border:1px solid transparent;border-radius:6px;background:transparent;color:inherit;padding:5px 6px;text-align:right;cursor:pointer}.client-price-button>span{display:inline-flex;align-items:center;gap:6px}.client-price-button small{color:var(--muted)}.price-alert-dot{display:inline-block;width:10px;height:10px;border-radius:50%;border:1px solid #0002;box-shadow:inset 0 -1px 2px #0002}.price-alert-dot.medium{background:#f7d774}.price-alert-dot.high{background:#f97316}.price-alert-dot.critical{background:#7f1d1d}
.detail-lines-wrap{max-height:calc(94vh - 230px)}.detail-lines-table{min-width:1120px;font-size:.78rem}.detail-lines-table th{position:sticky;top:0;z-index:2}.detail-lines-table td{vertical-align:top}.detail-lines-table .number{text-align:right;white-space:nowrap}.detail-summary{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:14px;padding:12px 14px;background:#f4f7f5;border-radius:9px}
</style>