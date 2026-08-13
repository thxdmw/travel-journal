<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { authApi } from '@/api/auth'
import { backupApi } from '@/api/template'
import type { AdminInfo, ProfileUpdate } from '@/types/auth'

export interface ProfilePageDeps {
  session: { user: AdminInfo | null }
  updateUser(user: AdminInfo): void
  message(text: string): void
  fail(error: unknown): void
}

const props = defineProps<ProfilePageDeps>()
const avatarInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const changingPassword = ref(false)
const password = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const avatarUrl = computed(() => props.session.user?.avatarUrl)
const editingName = ref(false)
const nameDraft = ref('')
const savingName = ref(false)

function mergeProfile(updated: ProfileUpdate) {
  if (props.session.user) props.updateUser({ ...props.session.user, ...updated })
}

function chooseAvatar() {
  avatarInput.value?.click()
}

async function picked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    mergeProfile(await authApi.uploadAvatar(form))
    props.message('头像已更新')
  } catch (error) {
    props.fail(error)
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function changePassword() {
  if (password.newPassword.length < 8) {
    props.fail(new Error('新密码至少需要 8 位'))
    return
  }
  if (password.newPassword !== password.confirmPassword) {
    props.fail(new Error('两次输入的新密码不一致'))
    return
  }
  changingPassword.value = true
  try {
    await authApi.changePassword({
      currentPassword: password.currentPassword,
      newPassword: password.newPassword,
    })
    password.currentPassword = ''
    password.newPassword = ''
    password.confirmPassword = ''
    props.message('密码修改成功')
  } catch (error) {
    props.fail(error)
  } finally {
    changingPassword.value = false
  }
}

function startEditName() {
  nameDraft.value = props.session.user?.displayName || ''
  editingName.value = true
}

function cancelEditName() {
  editingName.value = false
}

async function saveName() {
  if (!editingName.value) return
  const next = nameDraft.value.trim()
  if (!next) {
    props.fail(new Error('昵称不能为空'))
    return
  }
  if (next === props.session.user?.displayName) {
    cancelEditName()
    return
  }
  savingName.value = true
  try {
    mergeProfile(await authApi.updateDisplayName({ displayName: next }))
    editingName.value = false
    props.message('昵称已更新')
  } catch (error) {
    props.fail(error)
  } finally {
    savingName.value = false
  }
}

function download(includePhotos: boolean) {
  const link = document.createElement('a')
  link.href = backupApi.url(includePhotos)
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  props.message('已开始导出，文件较大时请稍候')
}
</script>

<template>
  <div><div class="page-head"><div><h2>个人资料</h2><p>管理昵称、登录密码和网站展示头像。</p></div></div>
    <div class="profile-grid">
      <section class="panel panel-pad profile-card"><h3>头像与昵称</h3>
        <div class="profile-avatar"><img v-if="avatarUrl" :src="avatarUrl" alt="管理员头像"><span v-else>{{ session.user?.displayName?.slice(0, 1) || '旅' }}</span></div>
        <div class="profile-name">
          <div v-if="!editingName" class="profile-name-view"><strong>{{ session.user?.displayName }}</strong><el-button link size="small" @click="startEditName">改昵称</el-button></div>
          <div v-else class="profile-name-edit"><el-input v-model="nameDraft" size="small" maxlength="60" show-word-limit placeholder="前台展示的昵称" @keyup.enter="saveName" @keyup.esc="cancelEditName" /><el-button link size="small" :loading="savingName" @click="saveName">保存</el-button><el-button link size="small" @click="cancelEditName">取消</el-button></div>
          <p>{{ session.user?.username }}<small class="form-hint">登录用户名，不可修改</small></p>
        </div>
        <el-button type="primary" :loading="uploading" @click="chooseAvatar">上传新头像</el-button>
        <input ref="avatarInput" hidden type="file" accept="image/jpeg,image/png,image/webp" @change="picked">
        <small>支持 JPEG、PNG、WebP，最大 5MB；上传后前台头像会同步更新。</small>
      </section>
      <section class="panel panel-pad password-card"><h3>修改密码</h3>
        <el-form label-position="top" @submit.prevent="changePassword">
          <el-form-item label="当前密码"><el-input v-model="password.currentPassword" type="password" show-password autocomplete="current-password" /></el-form-item>
          <el-form-item label="新密码"><el-input v-model="password.newPassword" type="password" show-password autocomplete="new-password" placeholder="至少 8 位" /></el-form-item>
          <el-form-item label="确认新密码"><el-input v-model="password.confirmPassword" type="password" show-password autocomplete="new-password" /></el-form-item>
          <el-button type="primary" :loading="changingPassword" @click="changePassword">确认修改</el-button>
        </el-form>
      </section>
      <section class="panel panel-pad backup-card"><h3>备份导出</h3>
        <p>把全部旅行、行程、预算和日记导出成一个 zip：每篇日记一份可恢复的 Block JSON，照片按日记分目录，另有 manifest.json 保存完整结构化数据。</p>
        <p class="backup-note">内容存在数据库和对象存储两处，导出是换服务器、换方案或哪天不想维护了的退路。建议定期存一份到本地。</p>
        <div class="backup-actions">
          <el-button type="primary" @click="download(true)">导出全部（含照片）</el-button>
          <el-button @click="download(false)">仅导出文字</el-button>
        </div>
      </section>
    </div>
  </div>
</template>
