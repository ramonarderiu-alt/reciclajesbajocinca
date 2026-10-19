<script setup>
import {ref} from 'vue'
import ArticleExactCodeTab from './ArticleExactCodeTab.vue'
import ArticleLerTonnesTab from './ArticleLerTonnesTab.vue'
import CentreObservationsTab from './CentreObservationsTab.vue'
const mode=ref('code')
</script>
<template>
 <div class="tabs" aria-label="Tipus de cerca de classificació">
  <button type="button" :class="{active:mode==='code'}" :aria-pressed="mode==='code'" @click="mode='code'">Per codi (tots els coincidents)</button>
  <button type="button" :class="{active:mode==='tonnes'}" :aria-pressed="mode==='tonnes'" @click="mode='tonnes'">Per LER i tones (seleccionar articles)</button>
  <button type="button" :class="{active:mode==='centres'}" :aria-pressed="mode==='centres'" @click="mode='centres'">Centres i observacions</button>
 </div>
 <ArticleExactCodeTab v-if="mode==='code'"/>
 <ArticleLerTonnesTab v-else-if="mode==='tonnes'"/>
 <CentreObservationsTab v-else/>
</template>
