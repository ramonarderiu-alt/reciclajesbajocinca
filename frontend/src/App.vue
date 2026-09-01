<script setup>import {auth} from './stores/auth.js';import AppLayout from './layouts/AppLayout.vue'</script>
<template><div v-if="!auth.ready" class="splash" role="status"><span class="spinner"></span> Carregant…</div><RouterView v-else-if="!auth.user"/><AppLayout v-else/></template>
