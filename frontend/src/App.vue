<script setup>import {useRoute} from 'vue-router';import {auth} from './stores/auth.js';import AppLayout from './layouts/AppLayout.vue';const route=useRoute()</script>
<template><div v-if="!auth.ready" class="splash" role="status"><span class="spinner"></span> Carregant…</div><RouterView v-else-if="!auth.user||route.meta.public"/><AppLayout v-else/></template>
