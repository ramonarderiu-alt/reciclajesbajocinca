<script setup>
import{ref,computed,onMounted}from'vue';import{api}from'../services/api.js';import UiState from'./UiState.vue';import BaseModal from'./BaseModal.vue'
const data=ref({years:[],rows:[],annual:{}}),loading=ref(true),error=ref(''),detail=ref(null),detailRows=ref([]),detailLoading=ref(false),detailError=ref('')
const showAllYears=ref(false)
const sortedYears=computed(()=>[...data.value.years].sort((a,b)=>Number(a)-Number(b)))
const visibleYears=computed(()=>showAllYears.value?sortedYears.value:sortedYears.value.slice(-4))
const restCategories=[['excrements','Excrements'],['fangs','Fangs'],['teixits','Teixits'],['cendres','Cendres'],['fruita','Fruita'],['paper','Paper'],['fusta','Fusta'],['mat_inade','Mat Inade'],['altres','Altres']]
const quantity=value=>new Intl.NumberFormat('ca-ES',{maximumFractionDigits:4}).format(Number(value||0))
const money=value=>new Intl.NumberFormat('ca-ES',{style:'currency',currency:'EUR'}).format(Number(value||0))
const date=value=>value?new Intl.DateTimeFormat('ca-ES',{dateStyle:'short'}).format(new Date(value)):'—'
const dateTime=value=>value?new Intl.DateTimeFormat('ca-ES',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—'
const compostPercentage=year=>{const compost=Number(data.value.annual[year]?.compost||0),rest=Number(data.value.annual[year]?.rest||0),total=compost+rest;return new Intl.NumberFormat('ca-ES',{minimumFractionDigits:2,maximumFractionDigits:2}).format(total?compost/total*100:0)+' %'}
async function load(){loading.value=true;error.value='';try{data.value=await api.get('/sales/articles')}catch(e){error.value=e.message}finally{loading.value=false}}
async function openDetail(row,year){if(row.quantities[year]==null)return;detail.value={row,year};detailRows.value=[];detailError.value='';detailLoading.value=true;try{detailRows.value=await api.get(`/sales/articles/${encodeURIComponent(row.articleCode)}/lines?year=${year}&product_name=${encodeURIComponent(row.articleName)}`)}catch(e){detailError.value=e.message}finally{detailLoading.value=false}}
const warnings=row=>{if(!row.warnings)return'Cap';if(Array.isArray(row.warnings))return row.warnings.join(' · ');try{return JSON.parse(row.warnings).join(' · ')}catch{return String(row.warnings)}}
onMounted(load)
</script>
<template><div class="toolbar article-sales-toolbar"><button class="button secondary" @click="load">Actualitzar</button>
<button v-if="sortedYears.length>4" type="button" class="button secondary" :aria-pressed="showAllYears" @click="showAllYears=!showAllYears">{{showAllYears?'Veure últims 4 anys':'Veure tots els anys'}}</button>
<aside class="sales-legend" aria-label="Llegenda dels totals">
 <p><strong>Compost:</strong> categoria Compost. <strong>Resta:</strong> Excrements, Fangs, Teixits, Cendres, Fruita, Paper, Fusta, Mat Inade i Altres.</p>
 <p>Tones i imports de vendes confirmades per any. Exclosos: sense classificar i No comptabilitzar.</p>
</aside></div>
<UiState :loading="loading" :error="error" :empty="!data.rows.length" empty-text="No hi ha vendes confirmades per mostrar."><section class="annual-summary"><article v-for="year in visibleYears" :key="year" class="card annual-card"><h3>{{year}}</h3><table class="annual-totals" :aria-label="'Tones i euros de '+year"><thead><tr><th scope="col">Tipus</th><th scope="col">Tones</th><th scope="col">Euros</th></tr></thead><tbody><tr><th scope="row">Compost</th><td>{{quantity(data.annual[year]?.compost)}} t</td><td>{{money(data.annual[year]?.compostAmount)}}</td></tr><tr><th scope="row">Resta</th><td>{{quantity(data.annual[year]?.rest)}} t</td><td>{{money(data.annual[year]?.restAmount)}}</td></tr></tbody></table><div class="percentage-row"><span>% compost</span><strong>{{compostPercentage(year)}}</strong></div><section class="rest-composition" aria-label="Composició de la resta d’articles"><h4>Composició de la resta</h4><div v-for="[category,label] in restCategories" :key="category"><span>{{label}}</span><strong>{{quantity(data.annual[year]?.restCategories?.[category])}} t</strong></div></section></article></section><div class="table-wrap"><table class="article-matrix"><thead><tr><th>Article</th><th v-for="year in visibleYears" :key="year">{{year}}</th></tr></thead><tbody><tr v-for="row in data.rows" :key="`${row.articleCode}:${row.articleName}`" :class="{'compost-row':row.articleCode==='__COMPOST__'}"><td data-label="Article"><strong>{{row.articleName}}</strong><small v-if="row.articleCode!=='__COMPOST__'">{{row.articleCode}}</small></td><td v-for="year in visibleYears" :key="year" :data-label="String(year)"><button v-if="row.quantities[year]!=null" class="cell-detail-button" :aria-label="`Veure línies de ${row.articleName} de ${year}`" @click="openDetail(row,year)"><span class="article-year-values"><strong>{{quantity(row.quantities[year])}} t</strong><span>{{money(row.amounts?.[year])}}</span></span></button><span v-else>—</span></td></tr></tbody></table></div></UiState>
<BaseModal :open="!!detail" size="large" :title="detail?`${detail.row.articleName} · ${detail.year}`:''" @close="detail=null"><div class="detail-summary"><span><strong>{{detailRows.length}}</strong> línies</span><span>t: <strong>{{quantity(detailRows.reduce((sum,row)=>sum+Number(row.quantity||0),0))}}</strong></span><span>Total: <strong>{{money(detailRows.reduce((sum,row)=>sum+Number(row.total_amount||0),0))}}</strong></span></div><UiState :loading="detailLoading" :error="detailError" :empty="!detailRows.length" empty-text="No s’han trobat línies."><div class="table-wrap detail-lines-wrap"><table class="detail-lines-table"><thead><tr><th>Data</th><th class="detail-client-column">Client</th><th>Centre</th><th>Albarà</th><th>Article i concepte</th><th>Matrícula</th><th>Remolc</th><th>t</th><th>Preu</th><th>Base</th></tr></thead><tbody><tr v-for="row in detailRows" :key="row.id"><td>{{date(row.delivery_date)}}</td><td class="detail-client-column"><strong>{{row.client_name}}</strong><small>{{row.client_code}}</small></td><td>{{row.centre_name||'Sense centre informat'}}<small v-if="row.centre_comment" class="centre-comment">{{row.centre_comment}}</small></td><td>{{row.delivery_note_number}}</td><td><strong>{{row.product_code}}</strong><div>{{row.concept}}</div></td><td>{{row.vehicle_plate||'—'}}<small v-if="row.vehicle_plate_normalized">{{row.vehicle_plate_normalized}}</small></td><td>{{row.trailer_plate||'—'}}</td><td class="number">{{quantity(row.quantity)}}</td><td class="number">{{money(row.unit_price)}}</td><td class="number">{{money(row.taxable_base)}}</td></tr></tbody></table></div></UiState><template #actions><button class="button secondary" @click="detail=null">Tancar</button></template></BaseModal></template>

<style scoped>
.article-matrix{table-layout:fixed;min-width:0;width:100%;font-size:.76rem}
.article-matrix th,.article-matrix td{padding:8px 5px}
.article-matrix th{font-size:.68rem;letter-spacing:0}
.article-matrix th:first-child,.article-matrix td:first-child{width:22%;min-width:0;overflow-wrap:anywhere}
.article-matrix .cell-detail-button{width:100%;min-width:0;padding:3px 0;font-size:.74rem;overflow-wrap:anywhere}
.article-matrix .article-year-values{min-width:0;gap:0;align-items:stretch;white-space:normal;font-variant-numeric:tabular-nums;border:1px solid var(--border);border-radius:3px;overflow:hidden;background:#fff}
.article-matrix .article-year-values>strong,.article-matrix .article-year-values>span{display:block;padding:5px 6px;text-align:right;overflow-wrap:anywhere}
.article-matrix .article-year-values>span{border-top:1px solid var(--border)}
.article-matrix .cell-detail-button{text-decoration:none}
.article-matrix .cell-detail-button:hover .article-year-values{border-color:var(--primary)}
.article-matrix .article-year-values>span{font-size:.7rem;color:var(--muted)}
@media(max-width:600px){.article-matrix{min-width:620px}}

.annual-summary{display:flex;flex-wrap:nowrap;gap:8px;overflow-x:auto;padding-bottom:6px;margin-bottom:12px}
.annual-summary .annual-card{flex:1 0 175px;min-width:0;padding:9px;border-radius:8px;font-size:.72rem}
.annual-card h3{font-size:.92rem;margin-bottom:6px}
.annual-card div{gap:5px;padding:3px 0;align-items:baseline}
.annual-card strong{text-align:right;font-variant-numeric:tabular-nums}
.annual-totals{width:100%;min-width:0;table-layout:fixed;border-collapse:collapse;border:1px solid var(--border);margin-bottom:6px;background:#fff}
.annual-totals th,.annual-totals td{border:1px solid var(--border);padding:5px 3px;font-size:.68rem;letter-spacing:0;text-transform:none;overflow-wrap:anywhere}
.annual-totals th:first-child{width:25%;text-align:left}
.annual-totals th:not(:first-child),.annual-totals td{text-align:right;font-variant-numeric:tabular-nums}
.annual-totals tbody th{font-weight:600;background:#fafcfb;color:inherit}
.annual-totals tbody tr{background:#fff}
.annual-card .percentage-row{margin-top:4px;padding-top:5px}
.annual-card .percentage-row strong{font-size:.82rem}
.rest-composition{border-top:1px solid var(--border);margin-top:5px;padding-top:5px}
.rest-composition h4{font-size:.72rem;margin:0 0 3px;color:var(--muted)}
.rest-composition div{padding:2px 0}

.article-sales-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:12px}
.article-sales-toolbar>.button{flex:none}
.sales-legend{flex:1;min-width:0;margin:0;padding:8px 10px;border-left:3px solid var(--border);color:var(--muted);font-size:.78rem;line-height:1.4}
.sales-legend p{margin:0}.sales-legend p+p{margin-top:3px}

.article-year-values{display:flex;flex-direction:column;gap:4px;align-items:flex-end}.centre-comment{display:block;color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere;margin-top:3px}
</style>
