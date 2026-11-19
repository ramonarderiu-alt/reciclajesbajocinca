<script setup>
import {ref,computed,onMounted,onBeforeUnmount} from 'vue'
import ScaleTicketForm from '../components/ScaleTicketForm.vue'
import {api} from '../services/api.js'
import {can,auth} from '../stores/auth.js'
const scales=ref([]),error=ref(''),networkError=ref(''),captures=ref([]),selected=ref(''),encoding=ref('ascii'),command=ref(''),busy=ref(false)
const defaults={path:'auto',baudRate:9600,dataBits:8,parity:'none',stopBits:1,rtscts:false,xon:false,xoff:false},portOptions=ref({...defaults})
function editConfig(s){if(!s)return;selected.value=s.id;portOptions.value={...defaults,...s.serial,path:s.serial?.path==='SIMULATION'?'auto':s.serial?.path||'auto'}}
const clock=ref(Date.now()),visibleScales=computed(()=>scales.value.map(s=>({...s,reading:s.reading&&clock.value<s.expiresAt?s.reading:null,status:(s.status==='receiving'&&clock.value>=s.statusExpiresAt)||(s.reading&&clock.value>=s.expiresAt)?'no-data':s.status})))
let timer,ticker,stopped=false
async function refresh(){try{const result=await api.get('/scale');scales.value=result.map(s=>({...s,expiresAt:Date.now()+(s.reading?.expiresInMs||0),statusExpiresAt:Date.now()+5000}));networkError.value='';if(!selected.value&&scales.value.length)editConfig(scales.value[0])}catch(e){scales.value=[];networkError.value=e.message}finally{if(!stopped)timer=setTimeout(refresh,1000)}}
onMounted(()=>{refresh();ticker=setInterval(()=>clock.value=Date.now(),250)});onBeforeUnmount(()=>{stopped=true;clearTimeout(timer);clearInterval(ticker)})
const labels={receiving:'Connectat i rebent dades','no-data':'Connectat però sense dades',disconnected:'Desconnectat',error:'Error'}
async function capture(id){try{const result=await api.post(`/scale/${id}/capture`,{});captures.value.unshift(result)}catch(e){error.value=e.message}}
async function configure(){try{busy.value=true;await api.post(`/scale/${selected.value}/command`,{type:'configure',serial:portOptions.value});error.value=''}catch(e){error.value=e.message}finally{busy.value=false}}
async function manual(){if(!window.confirm(`Confirmes l'enviament de l'ordre ${encoding.value.toUpperCase()} a ${selected.value}?\n${command.value}`))return
 try{busy.value=true;await api.post(`/scale/${selected.value}/command`,{type:'manual',encoding:encoding.value,data:command.value,confirmed:true});error.value=''}catch(e){error.value=e.message}finally{busy.value=false}}
function format(value){return new Intl.NumberFormat('ca-ES',{maximumFractionDigits:3}).format(value)}
</script>
<template>
 <section><h2>BÀSCULA</h2><p v-if="error||networkError" role="alert">{{error||networkError}}</p><p v-if="!scales.length">No hi ha bàscules disponibles. Configura l'agent i els permisos.</p>
 <ScaleTicketForm :capture="captures[0]" />
 <article v-for="s in visibleScales" :key="s.id" class="scale-card">
  <h3>{{s.id}} <mark v-if="s.simulation">SIMULACIÓ</mark></h3><p role="status">{{labels[s.status]}}</p>
  <div class="weight">{{s.reading?format(s.reading.weight):'--'}} <small>{{s.reading?.unit||'kg'}}</small></div>
  <p v-if="s.reading">{{s.reading.stable===null?'Estabilitat desconeguda':s.reading.stable?'Lectura estable':'Lectura inestable'}}</p><p v-else-if="s.status==='receiving'">Dades rebudes sense un pes vàlid.</p>
  <p>Última lectura: {{s.lastTimestamp?new Date(s.lastTimestamp).toLocaleString('ca-ES'):'--'}}</p>
  <button class="button" :disabled="!s.reading" @click="capture(s.id)">CAPTURAR PES</button>
  <details v-if="can('scale.configure')"><summary>Diagnòstic</summary><p>Agent: {{s.agentOnline?'Connectat':'Desconnectat'}}</p><p>{{s.error}}</p><pre>{{s.serial}}</pre>
   <button class="button secondary" @click="editConfig(s)">Carregar configuració al formulari</button>
   <p>Últim bloc en brut (mostreig màxim de 4 blocs/s, 512 bytes/bloc)</p><pre v-if="s.raw">ASCII: {{s.raw.ascii}}
HEX: {{s.raw.hex}}</pre><p>Últimes trames</p>
   <ul><li v-for="(f,i) in s.frames" :key="i"><time>{{f.timestamp}}</time><pre>ASCII: {{f.ascii}}
HEX: {{f.hex}}</pre></li></ul>
  </details>
 </article>
 <details v-if="can('scale.configure')"><summary>Configuració del port</summary><form @submit.prevent="configure"><label>Bàscula <select v-model="selected" @change="editConfig(scales.find(s=>s.id===selected))"><option v-for="s in scales" :key="s.id">{{s.id}}</option></select></label>
 <label>Port COM <input v-model="portOptions.path" placeholder="auto o COM3" required pattern="auto|[Cc][Oo][Mm][1-9][0-9]*" /></label>
 <label>Velocitat (baud) <input v-model.number="portOptions.baudRate" type="number" min="300" max="921600" required /></label>
 <label>Bits de dades <select v-model.number="portOptions.dataBits"><option :value="7">7</option><option :value="8">8</option></select></label>
 <label>Paritat <select v-model="portOptions.parity"><option value="none">Sense</option><option value="even">Parell</option><option value="odd">Senar</option><option value="mark">Mark</option><option value="space">Space</option></select></label>
 <label>Bits de parada <select v-model.number="portOptions.stopBits"><option :value="1">1</option><option :value="2">2</option></select></label>
 <label><input v-model="portOptions.rtscts" type="checkbox" /> RTS/CTS</label><label><input v-model="portOptions.xon" type="checkbox" /> XON</label><label><input v-model="portOptions.xoff" type="checkbox" /> XOFF</label>
 <button class="button" :disabled="busy||!selected">Desar configuració</button></form>
 <div v-if="can('scale.command')&&auth.user?.role_name==='Administrador'"><h3>Ordre manual</h3><select v-model="encoding"><option>ascii</option><option>hex</option></select><input v-model="command" maxlength="256" aria-label="Ordre manual" /><button class="button" :disabled="busy||!command" @click="manual">Enviar amb confirmació</button></div></details>
 <h3>Captures d'aquesta sessió</h3><ul><li v-for="(c,i) in captures" :key="i">{{c.simulation?'SIMULACIÓ · ':''}}{{c.id}} · {{format(c.reading.weight)}} {{c.reading.unit}} · {{new Date(c.capturedAt).toLocaleString('ca-ES')}}</li></ul>
 </section>
</template>
<style scoped>
.scale-card{padding:1.5rem;margin-bottom:1rem;background:white;border:1px solid #ddd;border-radius:12px}.weight{font-size:clamp(3rem,10vw,6rem);font-weight:700;font-variant-numeric:tabular-nums}.weight small{font-size:2rem}mark{padding:.4rem;background:#ffda60}pre{white-space:pre-wrap;overflow-wrap:anywhere}label{display:block;margin:1rem 0}textarea{display:block;width:100%;max-width:650px}summary{cursor:pointer;margin:1rem 0}
</style>
