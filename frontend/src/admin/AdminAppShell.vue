<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { AdminInfo } from '@/types/auth'

export interface AdminAppShellDeps {
  session: { user: AdminInfo | null }
  logout(): Promise<void>
}

const props = defineProps<AdminAppShellDeps>()
const route = useRoute()
const drawer = ref(false)
const full = computed(() => Boolean(route.meta.full))
const collapsed = ref(localStorage.getItem('travel-journal.sidebar') === 'collapsed')

watch(collapsed, value => {
  localStorage.setItem('travel-journal.sidebar', value ? 'collapsed' : 'expanded')
  document.body.classList.toggle('sidebar-collapsed', value)
}, { immediate: true })
watch(() => route.fullPath, () => { drawer.value = false })
</script>

<template>
  <router-view v-if="route.meta.public" />
  <div v-else class="admin-shell">
    <div class="sidebar-backdrop" :class="{ open: drawer }" @click="drawer = false"></div>
    <aside class="admin-sidebar" :class="{ open: drawer, collapsed }"><button class="sidebar-close" type="button" aria-label="收起侧边栏" @click="drawer = false">×</button>
      <div class="sidebar-brand">远行手记<small>TRAVEL JOURNAL</small></div>
      <button class="sidebar-collapse" type="button" :aria-pressed="collapsed" :title="collapsed ? '展开侧边栏' : '折叠侧边栏'" :aria-label="collapsed ? '展开侧边栏' : '折叠侧边栏'" @click="collapsed = !collapsed">{{ collapsed ? '»' : '«' }}</button>
      <nav class="side-nav"><router-link to="/" title="管理首页" @click="drawer = false"><i aria-hidden="true">⌂</i><span>管理首页</span></router-link><router-link to="/journals/new" title="写日记" @click="drawer = false"><i aria-hidden="true">✎</i><span>写日记</span></router-link><router-link to="/journals" title="日记管理" @click="drawer = false"><i aria-hidden="true">▥</i><span>日记管理</span></router-link><router-link to="/trips" title="旅行管理" @click="drawer = false"><i aria-hidden="true">▣</i><span>旅行管理</span></router-link><router-link to="/moments" title="随手记" @click="drawer = false"><i aria-hidden="true">◉</i><span>随手记</span></router-link><router-link to="/templates" title="日记模板" @click="drawer = false"><i aria-hidden="true">▤</i><span>日记模板</span></router-link><router-link to="/tags" title="标签管理" @click="drawer = false"><i aria-hidden="true">◇</i><span>标签管理</span></router-link><router-link to="/themes" title="主题外观" @click="drawer = false"><i aria-hidden="true">◈</i><span>主题外观</span></router-link><router-link to="/profile" title="个人资料" @click="drawer = false"><i aria-hidden="true">◎</i><span>个人资料</span></router-link><a href="/" target="_blank" title="查看网站" @click="drawer = false"><i aria-hidden="true">↗</i><span>查看网站</span></a></nav>
      <div class="sidebar-user" :title="session.user?.displayName"><div class="sidebar-avatar"><img v-if="session.user?.avatarUrl" :src="session.user.avatarUrl" alt="头像"><span v-else>{{ session.user?.displayName?.slice(0, 1) || '旅' }}</span></div><div><div>{{ session.user?.displayName }}</div><small>{{ session.user?.username }}</small></div></div>
    </aside>
    <main class="admin-main"><template v-if="!full"><header class="admin-topbar"><el-button class="mobile-toggle" @click="drawer = !drawer">☰</el-button><h1>{{ route.meta.title }}</h1><div class="top-actions"><el-button link @click="props.logout">退出登录</el-button></div></header><div class="admin-content"><router-view /></div></template><router-view v-else /></main>
  </div>
</template>
