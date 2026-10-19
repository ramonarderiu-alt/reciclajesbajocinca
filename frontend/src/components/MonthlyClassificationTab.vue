<script setup>
import {ref,computed,onMounted} from 'vue'
import {api} from '../services/api.js'
import {articleCategories} from '../constants/articleCategories.js'
import UiState from './UiState.vue'
import BaseModal from './BaseModal.vue'
const data=ref({years:[],rows:[]}),loading=ref(true),error=ref(''),selectedYear=ref(''),metric=ref('quantity')
const detail=ref(null),detailData=ref({rows:[],total:{}}),detailLoading=ref(false),detailError=ref('')
let detailRequest=0
async function openDetail(row,month){
 const request=++detailRequest
 detail.value={year:row.year,category:row.category,label:categories.find(([key])=>key===row.category)?.[1]||row.category,month}
 detailData.value={rows:[],total:{}};detailLoading.value=true;detailError.value=''
 const query=new URLSearchParams({year:row.year,category:row.category});if(month)query.set('month',month)
 try{const result=await api.get('/sales/articles/classification/monthly/clients?'+query);if(request===detailRequest)detailData.value=result}catch(e){if(request===detailRequest)detailError.value=e.message}finally{if(request===detailRequest)detailLoading.value=false}
}
const months=['Gener','Febrer','Març','Abril','Maig','Juny','Juliol','Agost','Setembre','Octubre','Novembre','Desembre']
const categories=articleCategories.filter(([key])=>key!=='no_comptabilitzar')
const quantity=new Intl.NumberFormat('ca-ES',{maximumFractionDigits:4})
const percentageFormat=new Intl.NumberFormat('ca-ES',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2})
const tonnesPercentage=value=>{const total=Number(detailData.value.total.quantity||0);return total===0?'—':percentageFormat.format(Number(value||0)/total)}
const money=new Intl.NumberFormat('ca-ES',{style:'currency',currency:'EUR'})
const format=cell=>metric.value==='quantity'?quantity.format(Number(cell?.quantity||0)):money.format(Number(cell?.totalAmount||0))
const groups=computed(()=>{
 const years=data.value.years.filter(year=>!selectedYear.value||String(year)===selectedYear.value)
 return categories.map(([category,label])=>({category,label,rows:years.map(year=>data.value.rows.find(row=>row.year===year&&row.category===category)||{year,category,months:{},total:{quantity:'0',totalAmount:'0'}})}))
})
async function load(){loading.value=true;error.value='';try{data.value=await api.get('/sales/articles/classification/monthly');if(!data.value.years.some(year=>String(year)===selectedYear.value))selectedYear.value=''}catch(e){error.value=e.message}finally{loading.value=false}}
onMounted(load)
</script>
<template>
 <section>
  <div class="toolbar monthly-toolbar">
   <label>Any<select v-model="selectedYear"><option value="">Tots els anys</option><option v-for="year in data.years" :key="year" :value="String(year)">{{year}}</option></select></label>
   <label>Mostrar<select v-model="metric"><option value="quantity">Tones</option><option value="totalAmount">Euros</option></select></label>
   <button class="button secondary" :disabled="loading" @click="load">Actualitzar</button>
  </div>
  <p class="monthly-legend">Vendes confirmades per classificació, any i mes. Imports amb IVA. Exclosos: sense classificar i No comptabilitzar.</p>
  <UiState :loading="loading" :error="error" :empty="!data.rows.length" empty-text="No hi ha vendes confirmades classificades per mostrar.">
   <div class="monthly-mobile">
    <section v-for="group in groups" :key="group.category" class="mobile-category">
     <h2>{{group.label}}</h2>
     <article v-for="row in group.rows" :key="row.year" class="mobile-year card">
      <header><h3>{{row.year}}</h3><span>{{metric==='quantity'?'Tones':'Euros amb IVA'}}</span></header>
      <div class="mobile-months"><div v-for="(month,index) in months" :key="month" class="mobile-month"><span>{{month}}</span><button v-if="row.months[index+1]" type="button" class="monthly-detail" :aria-label="'Veure clients de '+group.label+' de '+month+' '+row.year" @click="openDetail(row,index+1)">{{format(row.months[index+1])}}</button><span v-else class="mobile-no-sales">—</span></div></div>
      <footer><strong>Total anual</strong><button v-if="Object.keys(row.months).length" type="button" class="monthly-detail" :aria-label="'Veure clients de '+group.label+' de tot '+row.year" @click="openDetail(row)">{{format(row.total)}}</button><span v-else>{{format(row.total)}}</span></footer>
     </article>
    </section>
   </div>
   <div class="table-wrap monthly-wrap"><table class="monthly-matrix">
    <caption>Vendes mensuals per classificació ({{metric==='quantity'?'tones':'euros'}})</caption>
    <thead><tr><th scope="col">Classificació</th><th scope="col">Any</th><th v-for="month in months" :key="month" scope="col">{{month}}</th><th scope="col">Total anual</th></tr></thead>
    <tbody v-for="group in groups" :key="group.category">
     <tr v-for="(row,index) in group.rows" :key="row.year" :class="{'group-start':index===0}">
      <th v-if="index===0" scope="rowgroup" :rowspan="group.rows.length" class="category-cell">{{group.label}}</th>
      <th scope="row" class="year-cell">{{row.year}}</th>
      <td v-for="(month,index) in months" :key="month"><button v-if="row.months[index+1]" type="button" class="monthly-detail" :aria-label="'Veure clients de '+group.label+' de '+month+' '+row.year" @click="openDetail(row,index+1)">{{format(row.months[index+1])}}</button><span v-else>—</span></td>
      <td class="annual-total"><button v-if="Object.keys(row.months).length" type="button" class="monthly-detail" :aria-label="'Veure clients de '+group.label+' de tot '+row.year" @click="openDetail(row)">{{format(row.total)}}</button><span v-else>{{format(row.total)}}</span></td>
     </tr>
    </tbody>
   </table></div>
  </UiState>
  <BaseModal :open="!!detail" size="large" :title="detail?detail.label+' · '+(detail.month?months[detail.month-1]+' ':'Tot l’any ')+detail.year:''" @close="detail=null">
   <UiState :loading="detailLoading" :error="detailError" :empty="!detailData.rows.length" empty-text="No hi ha vendes per mostrar.">
    <div class="table-wrap"><table class="monthly-clients"><thead><tr><th>Client</th><th>Tones (% del total)</th><th>Euros (amb IVA)</th></tr></thead><tbody><tr v-for="client in detailData.rows" :key="client.clientCode"><td data-label="Client"><strong>{{client.clientName}}</strong><small>{{client.clientCode}}</small></td><td data-label="Tones">{{quantity.format(Number(client.quantity))}} t <span class="tonnes-percentage">({{tonnesPercentage(client.quantity)}})</span></td><td data-label="Euros (amb IVA)">{{money.format(Number(client.totalAmount))}}</td></tr></tbody><tfoot><tr><th scope="row">Total</th><td>{{quantity.format(Number(detailData.total.quantity||0))}} t <span class="tonnes-percentage">({{tonnesPercentage(detailData.total.quantity)}})</span></td><td>{{money.format(Number(detailData.total.totalAmount||0))}}</td></tr></tfoot></table></div>
   </UiState>
   <template #actions><button class="button secondary" @click="detail=null">Tancar</button></template>
  </BaseModal>
 </section>
</template>
<style scoped>
.monthly-mobile{display:none}

.monthly-detail{border:0;background:transparent;color:var(--primary);font:inherit;font-weight:700;text-decoration:underline;text-decoration-style:dotted;cursor:pointer;padding:4px;min-height:32px}.monthly-detail:hover{background:#e9f5ed;border-radius:5px}.monthly-clients td:not(:first-child){text-align:right;white-space:nowrap}.tonnes-percentage{color:var(--muted);font-size:.85em;margin-left:5px}.monthly-clients small{display:block;color:var(--muted)}.monthly-clients tfoot{font-weight:700;background:#edf4ef}

.monthly-toolbar{align-items:end;gap:12px;flex-wrap:wrap}.monthly-toolbar label{min-width:150px;display:grid;gap:5px}.monthly-legend{color:var(--muted);font-size:.85rem;margin:10px 0 16px}
.monthly-wrap{max-height:70vh;overflow:auto}.monthly-matrix{min-width:1350px;width:100%;font-size:.78rem;border-collapse:separate;border-spacing:0}.monthly-matrix caption{text-align:left;padding:12px;font-weight:700}.monthly-matrix th,.monthly-matrix td{padding:9px 8px;white-space:nowrap}.monthly-matrix thead th{position:sticky;top:0;z-index:3}.monthly-matrix td{text-align:right;font-variant-numeric:tabular-nums}.monthly-matrix .category-cell{position:sticky;left:0;z-index:2;background:#edf4ef;vertical-align:top;min-width:140px;text-align:left}.monthly-matrix .year-cell{position:sticky;left:140px;z-index:1;background:#fff;min-width:60px;text-align:left}.monthly-matrix .annual-total{font-weight:700;background:#f1f7f3}.monthly-matrix .group-start>*{border-top:2px solid var(--border)}
@media(max-width:760px){
.monthly-wrap{display:none}.monthly-mobile{display:grid;gap:24px}.mobile-category h2{font-size:1.1rem;color:var(--primary);margin:0 0 10px}.mobile-year{padding:14px;margin-bottom:12px}.mobile-year>header,.mobile-year>footer{display:flex;align-items:center;justify-content:space-between;gap:10px}.mobile-year h3{margin:0;font-size:1.1rem}.mobile-year>header>span{font-size:.75rem;color:var(--muted)}.mobile-months{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px;margin-top:10px}.mobile-month{display:flex;align-items:center;justify-content:space-between;gap:4px;border-bottom:1px solid var(--border);min-height:48px;font-size:.8rem}.mobile-month>span:first-child{color:var(--muted)}.mobile-month .monthly-detail{padding:5px 0;min-height:44px;font-size:.8rem;overflow-wrap:anywhere;min-width:0}.mobile-no-sales{color:var(--muted)}.mobile-year>footer{margin-top:10px;font-size:.85rem}.monthly-toolbar{display:grid;grid-template-columns:1fr 1fr;align-items:end}.monthly-toolbar label{min-width:0}.monthly-toolbar>button{grid-column:1/-1}.monthly-clients{min-width:0}.monthly-clients td{flex-wrap:wrap}.monthly-clients td:first-child{overflow-wrap:anywhere}.monthly-clients tfoot{display:block;margin-top:12px;padding:12px;border-radius:8px}.monthly-clients tfoot tr{border:0;padding:0}.monthly-clients tfoot th{display:block;padding:8px}.monthly-clients tfoot td{display:block;text-align:right}
.monthly-matrix{display:table}.monthly-matrix thead{display:table-header-group}.monthly-matrix tbody{display:table-row-group}.monthly-matrix tr{display:table-row}.monthly-matrix th,.monthly-matrix td{display:table-cell}.monthly-matrix td::before{display:none}.monthly-matrix .year-cell,.monthly-matrix .category-cell{position:static}.monthly-toolbar label{min-width:120px}}
</style>
