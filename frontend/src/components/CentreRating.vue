<script setup>
import {ref} from 'vue'
import {api} from '../services/api.js'
const props=defineProps({clientCode:String,centreName:String,rating:Number,comment:String,editable:Boolean})
const emit=defineEmits(['saved','comment-saved'])
const saving=ref(false),error=ref(''),editing=ref(false),editingComment=ref(false),draftComment=ref('')
const color=score=>({'--rating-hue':(score-1)*30})
async function rate(score){
 if(saving.value||!props.editable)return
 if(score===props.rating){editing.value=false;return}
 saving.value=true;error.value=''
 try{const result=await api.put(`/sales/clients/${encodeURIComponent(props.clientCode)}/centre-rating`,{centreName:props.centreName,rating:score});emit('saved',result.rating);editing.value=false}catch(e){error.value=e.message}finally{saving.value=false}
}
function openComment(){draftComment.value=props.comment||'';editingComment.value=true;error.value=''}
async function saveComment(){
 if(saving.value||!props.rating)return
 saving.value=true;error.value=''
 try{await api.put(`/sales/clients/${encodeURIComponent(props.clientCode)}/centre-rating`,{centreName:props.centreName,rating:props.rating,comment:draftComment.value.trim()});emit('comment-saved',draftComment.value.trim());editingComment.value=false}catch(e){error.value=e.message}finally{saving.value=false}
}
</script>
<template>
 <div class="centre-rating">
  <div class="rating-status" aria-live="polite"><button v-if="rating && editable && !editing" type="button" class="rating-badge" :style="color(rating)" :aria-label="`Valoració ${rating} de 5. Clica per modificar-la`" :aria-expanded="false" @click="editing=true">{{rating}}</button><strong v-else-if="rating && !editable" class="rating-badge" :style="color(rating)" :aria-label="`Valoració ${rating} de 5`">{{rating}}</strong><span v-else-if="!rating">Sense valorar</span><button v-if="rating && editable && !editingComment" type="button" class="comment-button" :disabled="saving" @click="openComment">{{comment||'Afegir comentari'}}</button><span v-else-if="comment && !editingComment" class="comment-text">{{comment}}</span><span v-if="saving">Desant…</span></div>
  <div v-if="editable && (!rating || editing)" class="rating-buttons" role="group" :aria-label="`Valorar ${centreName} de l’1 al 5`" :aria-busy="saving">
   <button v-for="score in 5" :key="score" type="button" :style="color(score)" :class="{selected:rating===score}" :aria-pressed="rating===score" :aria-label="`${score} de 5${rating===score?', puntuació actual':''}`" :disabled="saving" @click="rate(score)">{{score}}</button>
  </div>
  <form v-if="editingComment" class="comment-form" @submit.prevent="saveComment"><label>Comentari<textarea v-model="draftComment" maxlength="2000" rows="3" :disabled="saving" placeholder="Escriu un comentari sobre el centre"></textarea></label><div><button type="submit" class="button primary compact" :disabled="saving">Desar</button><button type="button" class="button secondary compact" :disabled="saving" @click="editingComment=false">Cancel·lar</button></div></form>
  <small v-if="error" class="rating-error" role="alert">{{error}}</small>
 </div>
</template>
<style scoped>
.comment-button{border:0;background:transparent;text-align:left;color:inherit;font:inherit;text-decoration:underline;text-decoration-style:dotted;cursor:pointer;padding:4px;white-space:pre-wrap;overflow-wrap:anywhere}.comment-text{white-space:pre-wrap;overflow-wrap:anywhere}.comment-form{margin:8px 0;min-width:220px}.comment-form textarea{width:100%;box-sizing:border-box}.comment-form>div{display:flex;gap:6px;margin-top:6px}.centre-rating{margin-top:8px}.rating-status{display:flex;align-items:center;gap:8px;font-size:.8rem;color:#475569;margin-bottom:5px}.rating-badge{display:inline-block;min-width:36px;min-height:36px;font:inherit;font-weight:700;border:0;border-radius:6px;padding:3px 9px;color:#17212b;background:hsl(var(--rating-hue) 75% 80%);border-left:4px solid hsl(var(--rating-hue) 70% 38%)}button.rating-badge{cursor:pointer}button.rating-badge:focus-visible{outline:3px solid #1e40af;outline-offset:2px}.rating-buttons{display:flex;gap:5px}.rating-buttons button{width:36px;height:36px;padding:0;border:2px solid transparent;border-radius:7px;background:hsl(var(--rating-hue) 75% 80%);color:#17212b;font:inherit;font-weight:700;cursor:pointer}.rating-buttons button:hover{background:hsl(var(--rating-hue) 75% 70%)}.rating-buttons button.selected{border-color:#17212b;box-shadow:0 0 0 1px #fff inset}.rating-buttons button:focus-visible{outline:3px solid #1e40af;outline-offset:2px}.rating-buttons button:disabled{cursor:wait;opacity:.65}.rating-error{color:#b91c1c;display:block;margin-top:5px}
</style>
