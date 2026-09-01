<script setup>
import{ref}from'vue';import{useRouter}from'vue-router';import{login}from'../stores/auth.js'
const username=ref(''),password=ref(''),error=ref(''),busy=ref(false),router=useRouter()
async function submit(){busy.value=true;error.value='';try{await login({username:username.value,password:password.value});router.push('/')}catch(e){error.value=e.message}finally{busy.value=false}}
</script>
<template><main class="login-page"><section class="login-card"><div class="login-brand">RBC</div><p class="eyebrow">Portal empresarial</p><h1>Benvingut/da</h1><p class="muted">Accediu a Reciclajes Bajo Cinca</p><form @submit.prevent="submit"><label>Nom d’usuari<input v-model="username" type="text" autocomplete="username" required autofocus></label><label>Contrasenya<input v-model="password" type="password" autocomplete="current-password" required></label><div v-if="error" class="alert error" role="alert">{{error}}</div><button class="button primary wide" :disabled="busy">{{busy?'Accedint…':'Iniciar sessió'}}</button><button type="button" class="link" disabled title="Disponible pròximament">He oblidat la contrasenya</button></form></section></main></template>
