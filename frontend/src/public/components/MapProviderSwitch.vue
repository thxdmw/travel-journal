<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  manualProvider,
  providerUsable,
  resolveProvider,
  runtime,
  setManualProvider,
} from '@/map/provider'
import type { MapProvider } from '@/types/map'

const emit = defineEmits<{ change: [] }>()
const current = ref<MapProvider>(manualProvider() ?? 'AUTO')
const amapEnabled = ref(true)
const autoResolved = ref('')
const autoLabel = computed(() => `自动${autoResolved.value ? `（${autoResolved.value === 'AMAP' ? '高德' : 'OSM'}）` : ''}`)

async function refreshAutoProvider() {
  try {
    const resolved = await resolveProvider()
    if (current.value === 'AUTO') autoResolved.value = resolved.provider
  } catch {
    if (current.value === 'AUTO') autoResolved.value = ''
  }
}

function select(value: MapProvider) {
  if (current.value === value || (value === 'AMAP' && !amapEnabled.value)) return
  current.value = value
  setManualProvider(value === 'AUTO' ? null : value)
  if (value === 'AUTO') {
    autoResolved.value = ''
    void refreshAutoProvider()
  }
  emit('change')
}

onMounted(async () => {
  try {
    amapEnabled.value = providerUsable('AMAP', await runtime())
  } catch {
    amapEnabled.value = false
  }
  if (current.value === 'AUTO') await refreshAutoProvider()
})
</script>

<template>
  <div class="map-provider-switch" role="group" aria-label="地图 Provider">
    <button type="button" :class="{ active: current === 'AUTO' }" @click="select('AUTO')">{{ autoLabel }}</button>
    <button
      type="button"
      :class="{ active: current === 'AMAP' }"
      :disabled="!amapEnabled"
      :title="amapEnabled ? '' : '未配置高德 Web端(JS API) Key'"
      @click="select('AMAP')"
    >高德</button>
    <button type="button" :class="{ active: current === 'OSM' }" @click="select('OSM')">OSM</button>
  </div>
</template>
