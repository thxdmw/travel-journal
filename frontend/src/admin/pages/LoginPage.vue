<script setup lang="ts">
import { reactive, ref } from 'vue'
import { authApi } from '@/api/auth'
import { ensureCsrf } from '@/api/client'
import { publicApi } from '@/api/public'
import { useRouter } from '@/vendor/vue-router-global'
import type { AdminInfo } from '@/types/auth'
import type { ThemeInput } from '@/types/theme'

export interface AdminSessionState {
  user: AdminInfo | null
  checked: boolean
  offline: boolean
}

export interface LoginPageDeps {
  completeSession(user: AdminInfo): void
  rememberSession(user: AdminInfo): void
  applyTheme(theme: ThemeInput): void
  fail(error: unknown): void
}

const props = defineProps<LoginPageDeps>()
const router = useRouter()
const form = reactive({ username: 'admin', password: '' })
const loading = ref(false)

async function submit() {
  if (loading.value) return
  loading.value = true
  try {
    const user = await authApi.login(form)
    props.completeSession(user)
    props.rememberSession(user)
    const profile = await publicApi.profile()
    props.applyTheme(profile.theme ?? user.themeKey)
    await ensureCsrf()
    await router.replace('/')
  } catch (error) {
    props.fail(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="admin-login">
    <section class="login-visual"><h1>远行手记</h1><p>把城市、照片和当时的心情，安静地收进自己的旅行档案。</p></section>
    <section class="login-panel">
      <div class="login-card">
        <div class="brand">远行手记</div><h2>欢迎回来</h2><p>登录后继续整理你的旅途。</p>
        <el-form @submit.prevent="submit">
          <el-form-item><el-input v-model="form.username" size="large" placeholder="用户名" /></el-form-item>
          <el-form-item><el-input v-model="form.password" size="large" type="password" show-password placeholder="密码" @keyup.enter="submit" /></el-form-item>
          <el-button type="primary" size="large" :loading="loading" @click="submit">登录</el-button>
        </el-form>
        <div style="margin-top: 24px"><a href="/" style="color: var(--tj-accent)">← 返回公开网站</a></div>
      </div>
    </section>
  </div>
</template>
