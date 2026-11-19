<script setup>
import {ref,computed,onMounted,watch} from 'vue'
import {api} from '../services/api.js'
const props=defineProps({capture:Object})
const options=ref({centres:[],plates:[]}),query=ref(''),centre=ref(''),client=ref(''),plate=ref(''),weight=ref(''),date=ref(now()),pending=ref([]),showPending=ref(false),error=ref(''),message=ref(''),busy=ref(false),loaded=ref(false),active=ref(null),tare=ref(''),tareDate=ref(now())
function now(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19)}
const centres=computed(()=>[...new Set(options.value.centres.map(c=>c.centre_name))].filter(c=>c.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())))
const clients=computed(()=>[...new Map(options.value.centres.filter(c=>c.centre_name===centre.value).map(c=>[c.client_code,c])).values()])
watch(centre,()=>{client.value=clients.value.length===1?clients.value[0].client_code:''})
function kg(c){return c.reading.weight*(c.reading.unit==='t'?1000:c.reading.unit==='g'?.001:1)}
watch(()=>props.capture,c=>{if(!c||c.simulation)return;if(active.value){tare.value=kg(c);tareDate.value=now()}else{weight.value=kg(c);date.value=now()}})
async function load(){try{const [o,p]=await Promise.all([api.get('/scale/tickets/options'),api.get('/scale/tickets/pending')]);options.value=o;pending.value=p;loaded.value=true}catch(e){error.value=e.message}}
onMounted(load)
async function save(){if(busy.value)return;busy.value=true;error.value='';message.value='';try{const result=await api.post('/scale/tickets',{centre:centre.value,client:client.value,plate:plate.value,weight:Number(weight.value),date:new Date(date.value).toISOString()});message.value=`Tiquet #${result.id} desat. Pendent de tara.`;weight.value='';plate.value='';date.value=now();await load()}catch(e){error.value=e.message}finally{busy.value=false}}
function selectTare(t){active.value=t;tare.value='';tareDate.value=now();error.value=''}
async function saveTare(){if(busy.value)return;busy.value=true;error.value='';try{await api.put(`/scale/tickets/${active.value.id}/tare`,{weight:Number(tare.value),date:new Date(tareDate.value).toISOString()});message.value=`Tiquet #${active.value.id} completat. Pes net: ${Number(active.value.gross_kg)-Number(tare.value)} kg.`;active.value=null;await load()}catch(e){error.value=e.message}finally{busy.value=false}}
const displayDate=s=>new Date(s).toLocaleString('ca-ES')
</script>
<template>
<article class="ticket">
 <div class="toolbar"><h3>Nou tiquet de bàscula</h3><button type="button" class="button pending" :disabled="!loaded||busy" @click="showPending=!showPending;load()">Camions pendents de tara ({{pending.length}})</button></div>
 <p v-if="error" role="alert">{{error}} <button type="button" @click="load">Tornar a carregar</button></p><p v-if="message" role="status">{{message}}</p>
 <form @submit.prevent="save">
 <div class="ticket-steps">
 <fieldset :disabled="busy||!loaded">
 <legend>1. Centre utilitzat el 2025–2026</legend>
 <label>Cercar centre <input v-model="query" type="search" placeholder="Escriu el nom del centre" /></label>
 <label>Centre <select v-model="centre" required><option value="">Selecciona un centre</option><option v-if="centre&&!centres.includes(centre)" :value="centre">{{centre}}</option><option v-for="c in centres" :key="c" :value="c">{{c}}</option></select></label>
 <p v-if="loaded&&!centres.length">No s'han trobat centres.</p>
 </fieldset>
 <fieldset v-if="centre" :disabled="busy"><legend>2. Client del centre</legend><label>Client <select v-model="client" required><option value="">Selecciona un client</option><option v-for="c in clients" :key="c.client_code" :value="c.client_code">{{c.client_name}} ({{c.client_code}})</option></select></label></fieldset>
 <fieldset v-if="client" :disabled="busy"><legend>3. Matrícula</legend><label>Matrícula <input v-model="plate" list="recent-plates" maxlength="30" required placeholder="Selecciona o escriu una matrícula" /></label><datalist id="recent-plates"><option v-for="p in options.plates" :key="p.vehicle_plate" :value="p.vehicle_plate" /></datalist><small>Matrícules utilitzades els últims 6 mesos. També pots introduir-ne una de nova.</small></fieldset>
 </div>
 <fieldset v-if="client&&plate.trim()" :disabled="busy"><legend>4. Pes i data</legend><label>Pes brut (kg) <input v-model="weight" type="number" min="0.001" max="99999999999" step="0.001" required /></label><p>Pots introduir el pes o utilitzar CAPTURAR PES de la bàscula.</p><label>Data i hora <input v-model="date" type="datetime-local" step="1" required /></label><button class="button" :disabled="busy">Desar tiquet pendent de tara</button></fieldset>
 </form>
 <section v-if="showPending"><h3>Camions pendents de tara</h3><p v-if="!pending.length">No hi ha camions pendents de tara.</p><ul class="pending-list"><li v-for="t in pending" :key="t.id"><strong>#{{t.id}} · {{t.vehicle_plate}}</strong> · {{t.centre_name}} · {{t.client_name}} · {{t.gross_kg}} kg · {{displayDate(t.weighed_at)}} <button class="button secondary" type="button" :disabled="busy" @click="selectTare(t)">Posar tara</button></li></ul></section>
 <form v-if="active" @submit.prevent="saveTare"><h3>Tara del camió {{active.vehicle_plate}} · #{{active.id}}</h3><label>Tara (kg) <input v-model="tare" type="number" min="0" :max="Number(active.gross_kg)" step="0.001" required :disabled="busy" /></label><p>Pots capturar el pes actual de la bàscula.</p><label>Data i hora de tara <input v-model="tareDate" type="datetime-local" step="1" required :disabled="busy" /></label><p v-if="tare!==''">Pes net: {{Number(active.gross_kg)-Number(tare)}} kg</p><button class="button" :disabled="busy">Desar tara i completar tiquet</button> <button class="button secondary" type="button" :disabled="busy" @click="active=null">Cancel·lar</button></form>
</article>
</template>
<style scoped>
.ticket{background:white;border:1px solid #ddd;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}.pending{background:#92400e;color:white}fieldset{border:1px solid #ddd;border-radius:8px;margin:1rem 0;padding:1rem}label{display:grid;gap:.4rem;margin:.8rem 0}input,select{width:100%;max-width:650px;padding:.65rem;font:inherit;box-sizing:border-box}.pending-list{padding-left:1.2rem}.pending-list li{margin:1rem 0}
.ticket-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;align-items:stretch}.ticket-steps fieldset{min-width:0}.ticket-steps input,.ticket-steps select{min-width:0;max-width:100%}@media(max-width:800px){.ticket-steps{grid-template-columns:1fr;gap:0}}
</style>
