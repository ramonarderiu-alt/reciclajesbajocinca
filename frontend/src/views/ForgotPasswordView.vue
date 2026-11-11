<script setup>
import {ref} from 'vue'
import {api} from '../services/api.js'

const username=ref(''),busy=ref(false),error=ref(''),message=ref('')
async function submit(){
 busy.value=true;error.value=''
 try{message.value=(await api.post('/auth/forgot-password',{username:username.value})).message}
 catch(e){error.value=e.message}
 finally{busy.value=false}
}
</script>

<template>
 <main class="login-page"><section class="login-card">
  <div class="login-brand">RBC</div><p class="eyebrow">Portal empresarial</p>
  <h1>Recuperar la contrasenya</h1>
  <p class="muted">Indica el teu nom d’usuari. Enviarem un enllaç al correu de recuperació de l’empresa perquè la persona responsable pugui ajudar-te.</p>
  <div v-if="message" class="alert success" role="status">{{message}}</div>
  <form v-else @submit.prevent="submit">
   <label>Nom d’usuari<input v-model="username" type="text" autocomplete="username" maxlength="80" required autofocus :disabled="busy"></label>
   <div v-if="error" class="alert error" role="alert">{{error}}</div>
   <button class="button primary wide" :disabled="busy">{{busy?'Sol·licitant…':'Sol·licitar recuperació'}}</button>
  </form>
  <p><RouterLink class="link" to="/login">Tornar a iniciar sessió</RouterLink></p>
 </section></main>
</template>
