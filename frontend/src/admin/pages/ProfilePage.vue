<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { authApi } from '@/api/auth'
import { backupApi } from '@/api/template'
import type { AdminInfo, LoginDevice, ProfileUpdate } from '@/types/auth'

export interface ProfilePageDeps {
  session: { user: AdminInfo | null }
  updateUser(user: AdminInfo): void
  message(text: string): void
  fail(error: unknown): void
  confirm(text: string): Promise<unknown>
}

const props = defineProps<ProfilePageDeps>()
const avatarInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const changingPassword = ref(false)
const password = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const avatarUrl = computed(() => props.session.user?.avatarUrl)
const devices = ref<LoginDevice[]>([])
const loadingDevices = ref(false)
const renamingDevice = ref('')
const deviceNameDraft = ref('')
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
    props.message('密码修改成功，其他设备已退出登录')
    await loadDevices()
  } catch (error) {
    props.fail(error)
  } finally {
    changingPassword.value = false
  }
}

/*
 * ============================================================ 登录设备
 *
 * 会话存在数据库里，这份列表就是设备清单本身。踢掉一台，它下一次请求就是未登录。
 */

async function loadDevices() {
  loadingDevices.value = true
  try {
    devices.value = await authApi.devices()
  } catch (error) {
    props.fail(error)
  } finally {
    loadingDevices.value = false
  }
}

async function revokeDevice(device: LoginDevice) {
  try {
    await props.confirm(`确定让「${device.deviceName}」退出登录吗？`)
  } catch {
    return
  }
  try {
    await authApi.revokeDevice(device.sessionId)
    props.message('该设备已退出登录')
    await loadDevices()
  } catch (error) {
    props.fail(error)
  }
}

async function revokeOthers() {
  try {
    await props.confirm('确定让其他所有设备退出登录吗？当前这台不受影响。')
  } catch {
    return
  }
  try {
    const result = await authApi.revokeOtherDevices()
    props.message(result.removed ? `已让 ${result.removed} 台设备退出登录` : '没有其他设备在登录')
    await loadDevices()
  } catch (error) {
    props.fail(error)
  }
}

/**
 * 相对时间。
 *
 * 「3 分钟前」比「2026/8/18 11:17」更容易判断哪条是旧的——这份列表要回答的问题是
 * 「哪台该踢掉」，不是「具体几点登录的」。超过一周就没有相对感了，回落到日期。
 */
function moment(value: string): string {
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return '—'
  const minutes = Math.floor((Date.now() - at.getTime()) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  return at.toLocaleDateString('zh-CN')
}

/**
 * 地址显示。
 *
 * 本机访问拿到的是 IPv6 回环，展开写法是 0:0:0:0:0:0:0:1，又长又看不出含义。
 */
function address(ip: string | null): string {
  if (!ip) return '未知地址'
  const normalized = ip.trim()
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1' || normalized.startsWith('127.')) return '本机'
  // IPv6 的全展开写法压回标准缩写：0:0:0:0:0:0:0:1 这种没必要占满一行
  return normalized.includes(':') ? normalized.replace(/(^|:)0(:0)+(:|$)/, '::').replace(/:{3,}/, '::') : normalized
}

/** 开始给一台设备起名字。 */
function startRenameDevice(device: LoginDevice) {
  renamingDevice.value = device.sessionId
  deviceNameDraft.value = device.named ? device.deviceName : ''
}

async function saveDeviceName(device: LoginDevice) {
  const next = deviceNameDraft.value.trim()
  renamingDevice.value = ''
  try {
    await authApi.renameDevice(device.sessionId, next)
    props.message(next ? '设备名已更新' : '已改回自动识别')
    await loadDevices()
  } catch (error) {
    props.fail(error)
  }
}

onMounted(loadDevices)

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
      <section class="panel panel-pad device-card"><h3>登录设备</h3>
        <p>这里列出当前所有保持登录的设备。手机丢了、或者在别人电脑上登录过忘了退出，都可以在这里让它立刻掉线。</p>
        <p class="form-hint">浏览器读不到你给设备起的名字（比如「我的 iPhone」），下面显示的是按浏览器信息认出来的型号。点「改名」可以自己命名，这台设备下次登录还叫这个名字。</p>
        <div v-loading="loadingDevices" class="device-list">
          <article v-for="device in devices" :key="device.sessionId" class="device-item" :class="{ 'is-current': device.current }">
            <div class="device-main">
              <div v-if="renamingDevice === device.sessionId" class="device-rename">
                <el-input v-model="deviceNameDraft" size="small" maxlength="60" placeholder="例如 我的 iPhone" @keyup.enter="saveDeviceName(device)" />
                <el-button link size="small" @click="saveDeviceName(device)">保存</el-button>
                <el-button link size="small" @click="renamingDevice = ''">取消</el-button>
              </div>
              <strong v-else>
                {{ device.deviceName }}
                <span v-if="device.current" class="device-badge">本机</span>
                <el-button link size="small" @click="startRenameDevice(device)">改名</el-button>
              </strong>
              <small>{{ address(device.ip) }} · {{ moment(device.loggedInAt) }}登录</small>
              <small>最近活跃 {{ moment(device.lastActiveAt) }}</small>
            </div>
            <el-button v-if="!device.current" link type="danger" size="small" @click="revokeDevice(device)">退出登录</el-button>
          </article>
          <el-empty v-if="!devices.length && !loadingDevices" :image-size="48" description="没有其他登录记录" />
        </div>
        <el-button v-if="devices.length > 1" type="danger" plain @click="revokeOthers">让其他设备全部退出</el-button>
        <small>修改密码时也会自动让其他设备退出登录。</small>
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
