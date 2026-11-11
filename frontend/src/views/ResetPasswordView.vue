<script setup>
import {ref} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {api} from '../services/api.js'
import {clearSession} from '../stores/auth.js'

const route=useRoute(),router=useRouter()
const token=new URLSearchParams(route.hash.slice(1)).get('token')||''
const validLink=/^[A-Za-z0-9_-]{43}$/.test(token)
const password=ref(''),confirmation=ref(''),busy=ref(false),error=ref(''),success=ref(false)
// Keep the token only in this view's memory, never in history or session storage.
if(route.hash)router.replace({path:route.path,query:{}})
async function submit(){
 error.value=''
 if(password.value!==confirmation.value){error.value='Les contrasenyes no coincideixen.';return}
 if(new TextEncoder().encode(password.value).length>72){error.value='La contrasenya és massa llarga. Utilitza com a màxim 72 bytes.';return}
 busy.value=true
 try{
  await api.post('/auth/reset-password',{token,password:password.value,confirmPassword:confirmation.value})
  clearSession();password.value='';confirmation.value='';success.value=true
 }catch(e){error.value=e.code==='VALIDATION_ERROR'?'La contrasenya ha de tenir entre 8 i 72 caràcters i coincidir amb la confirmació.':e.message}
 finally{busy.value=false}
}
</script>

<template>
 <main class="login-page"><section class="login-card">
  <div class="login-brand">RBC</div><p class="eyebrow">Portal empresarial</p>
  <h1>Restablir la contrasenya</h1>
  <div v-if="success" class="alert success" role="status">Contrasenya actualitzada. Les sessions anteriors s’han tancat. Ja pots iniciar sessió amb la nova contrasenya.</div>
  <template v-else-if="validLink">
   <p class="muted">Escull una nova contrasenya de 8 caràcters com a mínim.</p>
   <form @submit.prevent="submit">
    <label>Nova contrasenya<input v-model="password" type="password" autocomplete="new-password" minlength="8" maxlength="72" required autofocus :disabled="busy"></label>
    <label>Repeteix la contrasenya<input v-model="confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="72" required :disabled="busy"></label>
    <div v-if="error" class="alert error" role="alert">{{error}}</div>
    <button class="button primary wide" :disabled="busy">{{busy?'Desant…':'Desar la nova contrasenya'}}</button>
   </form>
  </template>
  <div v-else class="alert error" role="alert">L’enllaç de recuperació no és vàlid. Obre l’enllaç complet del correu o demana’n un de nou.</div>
  <p v-if="!success"><RouterLink class="link" to="/forgot-password">Demanar un nou enllaç</RouterLink></p>
  <p><RouterLink class="link" to="/login">Tornar a iniciar sessió</RouterLink></p>
 </section></main>
</template>
