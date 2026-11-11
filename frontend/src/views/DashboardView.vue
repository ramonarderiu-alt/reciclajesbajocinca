<script setup>
import {computed} from 'vue'
import {auth,can} from '../stores/auth.js'
const modules=computed(()=>[
 {to:'/sales-clients',title:'Vendes clients',description:'Vendes, albarans, classificacions i centres.',permission:'sales_clients.view'},
 {to:'/time-clock',title:'Fitxatge',description:'Entrades, sortides i control horari.',permission:'time_clock.view'},
 {to:'/accounting',title:'Comptabilitat',description:'Comptes, assentaments, factures, cartera, conciliació i informes.',permission:'accounting.view'}
].filter(module=>can(module.permission)))
</script>
<template>
 <section class="welcome card"><p class="eyebrow">Espai de treball</p><h2>Bon dia, {{auth.user.name}}</h2><p>Us donem la benvinguda a la plataforma de <strong>{{auth.user.company_name}}</strong>.</p></section>
 <section class="cards-grid module-shortcuts" aria-label="Mòduls disponibles"><article v-for="module in modules" :key="module.to" class="card"><h2>{{module.title}}</h2><p class="muted">{{module.description}}</p><RouterLink :to="module.to" class="button primary">Obrir {{module.title.toLocaleLowerCase('ca')}}</RouterLink></article><p v-if="!modules.length" class="card muted">No teniu mòduls assignats. Contacteu amb l’administrador.</p></section>
 <p v-if="can('users.view')"><RouterLink to="/users" class="button secondary">Anar a administració</RouterLink></p>
</template>
<style scoped>.module-shortcuts{margin-top:20px}.module-shortcuts h2{margin-top:0}</style>
