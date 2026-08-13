<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { publicApi } from '@/api/public'
import type { PublicProfile } from '@/types/auth'
import type { ThemeView } from '@/types/theme'

export interface PublicAppShellDeps {
  isThemePreview: boolean
  currentPath(): string
  setSiteTheme(theme: ThemeView | string | null): void
  applyTheme(theme: ThemeView | string | null, options?: { persist?: boolean }): void
}

const props = defineProps<PublicAppShellDeps>()
const menu = ref(false)
const profile = ref<PublicProfile>({ displayName: '旅行者', avatarUrl: null, themeKey: 'travel-classic', theme: null })

watch(() => props.currentPath(), () => { menu.value = false })

function highlightPreviewTarget(selector: string) {
  if (!selector) return
  document.querySelectorAll(selector).forEach(element => {
    element.classList.remove('tj-preview-highlight')
    void (element as HTMLElement).offsetWidth
    element.classList.add('tj-preview-highlight')
    window.setTimeout(() => element.classList.remove('tj-preview-highlight'), 900)
  })
}

function previewTheme(event: MessageEvent) {
  if (event.origin !== location.origin || !event.data || typeof event.data !== 'object') return
  const message = event.data as { type?: unknown, theme?: ThemeView | string | null, selector?: unknown }
  if (message.type === 'travel-theme-preview') props.applyTheme(message.theme ?? null, { persist: false })
  else if (message.type === 'travel-theme-highlight' && typeof message.selector === 'string') highlightPreviewTarget(message.selector)
}

function closeMenuOutside(event: MouseEvent) {
  const target = event.target
  if (menu.value && target instanceof Element && !target.closest('.public-nav, .mobile-menu')) menu.value = false
}

function closeMenuOnEsc(event: KeyboardEvent) {
  if (event.key === 'Escape') menu.value = false
}

onMounted(async () => {
  window.addEventListener('message', previewTheme)
  document.addEventListener('click', closeMenuOutside)
  window.addEventListener('keydown', closeMenuOnEsc)
  if (props.isThemePreview) return
  try {
    profile.value = await publicApi.profile()
    props.setSiteTheme(profile.value.theme ?? profile.value.themeKey)
  } catch {
    // 公开资料失败不阻塞站点内容，保留默认头像和主题。
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('message', previewTheme)
  document.removeEventListener('click', closeMenuOutside)
  window.removeEventListener('keydown', closeMenuOnEsc)
})
</script>

<template>
  <div class="public-shell">
    <header v-if="!isThemePreview" class="public-header">
      <div class="header-inner">
        <router-link class="brand" to="/">远行手记</router-link>
        <button class="mobile-menu" type="button" :aria-expanded="menu" aria-label="打开前台导航" @click="menu = !menu">☰</button>
        <nav class="public-nav" :class="{ open: menu }">
          <router-link to="/">首页</router-link><router-link to="/trips">旅行</router-link><router-link to="/journals">日记</router-link><router-link to="/map">足迹地图</router-link><router-link to="/years">年度回顾</router-link>
        </nav>
        <a class="admin-link" href="/admin/" :title="profile.displayName + ' · 管理后台'" aria-label="进入管理后台">
          <img v-if="profile.avatarUrl" :src="profile.avatarUrl" alt="管理员头像"><span v-else>旅</span>
        </a>
      </div>
    </header>
    <header v-else class="public-header theme-preview-header" aria-label="固定示例站点导航">
      <div class="header-inner"><span class="brand">远行手记</span><nav class="public-nav"><span>首页</span><span>旅行</span><span>日记</span><span>足迹地图</span><span>年度回顾</span></nav><span class="admin-link" aria-hidden="true"><span>示</span></span></div>
    </header>
    <span v-if="isThemePreview" class="theme-preview-fixed-badge" aria-hidden="true">固定示例 · 不读取站点内容</span>
    <router-view></router-view>
    <footer class="public-footer">远行手记 · {{ isThemePreview ? '固定主题示例' : '把走过的路写成自己的故事' }}</footer>
  </div>
</template>
