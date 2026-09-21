<script setup>
import {ref,watch,computed} from 'vue'
import {api} from '../services/api.js'
import BaseModal from './BaseModal.vue'
import UiState from './UiState.vue'
const props=defineProps({selection:Object})
defineEmits(['close'])
const rows=ref([]),loading=ref(false),error=ref('');let requestId=0
const quantity=v=>new Intl.NumberFormat('ca-ES',{maximumFractionDigits:4}).format(Number(v||0))
const money=v=>new Intl.NumberFormat('ca-ES',{style:'currency',currency:'EUR'}).format(Number(v||0))
const price=v=>new Intl.NumberFormat('ca-ES',{style:'currency',currency:'EUR',maximumFractionDigits:4}).format(Number(v||0))
const totals=computed(()=>rows.value.reduce((sum,row)=>({quantity:sum.quantity+Number(row.quantity||0),amount:sum.amount+Number(row.total_amount||0)}),{quantity:0,amount:0}))
watch(()=>props.selection,async selection=>{
 const current=++requestId;rows.value=[];error.value='';loading.value=false;if(!selection)return
 loading.value=true
 const params=new URLSearchParams({from:selection.from,to:selection.to,article:selection.article})
 if(selection.isCentre)params.set('centre',selection.centreName||'')
 try{const result=await api.get(`/sales/clients/${encodeURIComponent(selection.clientCode)}?${params}`);if(current===requestId)rows.value=result}catch(e){if(current===requestId)error.value=e.message}finally{if(current===requestId)loading.value=false}
},{immediate:true})
</script>
<template>
 <BaseModal :open="!!selection" size="large" :title="selection?`${selection.clientName} · ${selection.year}`:''" @close="$emit('close')">
  <p v-if="selection?.isCentre"><strong>Centre:</strong> {{selection.centreName||'Sense centre informat'}}</p>
  <p v-if="selection?.article"><strong>Article:</strong> {{selection.article}}</p>
  <UiState :loading="loading" :error="error" :empty="!rows.length" empty-text="No hi ha línies amb aquests filtres.">
   <div class="detail-summary"><span><strong>{{rows.length}}</strong> línies</span><span><strong>{{quantity(totals.quantity)}} t</strong></span><span>Total: <strong>{{money(totals.amount)}}</strong></span></div>
   <div class="table-wrap"><table class="sales-lines"><thead><tr><th>Data</th><th>Albarà</th><th>Centre</th><th>Article i concepte</th><th>t</th><th>Preu unitari</th><th>Base</th><th>IVA</th><th>Total</th></tr></thead><tbody>
    <tr v-for="row in rows" :key="row.id"><td>{{new Date(row.delivery_date).toLocaleDateString('ca-ES')}}</td><td>{{row.delivery_note_number}}<small>{{row.client_name}}</small></td><td>{{row.centre_name||'Sense centre informat'}}</td><td><strong>{{row.product_code}}</strong><div>{{row.concept}}</div></td><td class="number">{{quantity(row.quantity)}}</td><td class="number">{{price(row.unit_price)}}</td><td class="number">{{money(row.taxable_base)}}</td><td class="number">{{row.vat_amount==null?'No informat':money(row.vat_amount)}}</td><td class="number">{{money(row.total_amount)}}</td></tr>
   </tbody></table></div>
  </UiState>
  <template #actions><button class="button secondary" @click="$emit('close')">Tancar</button></template>
 </BaseModal>
</template>
<style scoped>
.sales-lines{min-width:1050px}.number{text-align:right;white-space:nowrap}.detail-summary{display:flex;flex-wrap:wrap;gap:20px;margin-bottom:16px}
</style>
