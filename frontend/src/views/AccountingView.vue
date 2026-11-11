<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue'
import {api} from '../services/api.js'

const frame=ref(null),loading=ref(true),error=ref('')
let keepalive,refreshing,disposed=false
function renewSession(){
 if(!refreshing)refreshing=api.post('/accounting/session',{}).finally(()=>{refreshing=null})
 return refreshing
}
async function start(){
 loading.value=true;error.value=''
 try{await renewSession();await api.get('/accounting/context')}
 catch(cause){error.value=cause.message}
 finally{if(!disposed)loading.value=false}
}
async function receive(event){
 if(event.origin!==location.origin||event.source!==frame.value?.contentWindow||event.data?.type!=='accounting:refresh-session')return
 const requestId=event.data.requestId
 let success=false
 try{await renewSession();success=true}catch{error.value='La sessió ha caducat. Torna a iniciar sessió.'}
 if(!disposed)event.source.postMessage({type:'accounting:session',requestId,success},location.origin)
}
onMounted(()=>{
 window.addEventListener('message',receive)
 void start()
 keepalive=setInterval(()=>{if(document.visibilityState==='visible')renewSession().catch(()=>{})},60000)
})
onBeforeUnmount(()=>{disposed=true;clearInterval(keepalive);window.removeEventListener('message',receive)})
</script>

<template>
 <section class="accounting-module" aria-label="Comptabilitat">
  <p v-if="loading" class="card" role="status">Carregant la comptabilitat…</p>
  <div v-else-if="error" class="card" role="alert"><p>{{error}}</p><button class="button secondary" @click="start">Tornar-ho a provar</button></div>
  <iframe v-else ref="frame" src="/accounting-app/index.html" title="Comptabilitat: comptes, assentaments, factures i informes" class="accounting-frame"></iframe>
 </section>
</template>

<style scoped>
.accounting-module{margin:-28px;min-width:0}.accounting-module>.card{margin:28px}.accounting-frame{display:block;width:100%;height:calc(100dvh - 84px);min-height:550px;border:0;background:#f5f7fa}
@media(max-width:760px){.accounting-module{margin:-12px}.accounting-module>.card{margin:12px}.accounting-frame{height:calc(100dvh - 72px);min-height:420px}}
</style>
