import { flushPromises, mount, type DOMWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProfilePage from '@/admin/pages/ProfilePage.vue'
import type { AdminInfo } from '@/types/auth'

const mocks = vi.hoisted(() => ({
  uploadAvatar: vi.fn(),
  updateDisplayName: vi.fn(),
  changePassword: vi.fn(),
  devices: vi.fn(),
  revokeDevice: vi.fn(),
  revokeOtherDevices: vi.fn(),
  renameDevice: vi.fn(),
}))
vi.mock('@/api/auth', () => ({ authApi: mocks }))

const ElButton = {
  props: ['loading'],
  emits: ['click'],
  template: '<button type="button" :disabled="loading" @click="$emit(\'click\')"><slot /></button>',
}
const ElInput = {
  props: ['modelValue', 'placeholder', 'type', 'autocomplete', 'size', 'maxlength', 'showWordLimit'],
  emits: ['update:modelValue', 'keyup'],
  template: '<input :value="modelValue" :placeholder="placeholder" :type="type || \'text\'" :autocomplete="autocomplete" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup="$emit(\'keyup\', $event)">',
}
const ElForm = { emits: ['submit'], template: '<form @submit.prevent="$emit(\'submit\')"><slot /></form>' }
const ElFormItem = { props: ['label'], template: '<label>{{ label }}<slot /></label>' }
const ElEmpty = { props: ['description'], template: '<div class="el-empty">{{ description }}</div>' }

function mountPage() {
  const session = reactive<{ user: AdminInfo | null }>({
    user: { id: 1, username: 'admin', displayName: '站长', avatarUrl: null, themeKey: null },
  })
  const updateUser = vi.fn((user: AdminInfo) => { session.user = user })
  const message = vi.fn()
  const fail = vi.fn()
  const confirm = vi.fn().mockResolvedValue(undefined)
  const wrapper = mount(ProfilePage, {
    props: { session, updateUser, message, fail, confirm },
    global: { components: { ElButton, ElInput, ElForm, ElFormItem, ElEmpty } },
  })
  return { wrapper, session, updateUser, message, fail, confirm }
}

/** 卡片里按文本找按钮：一张卡上现在有「改名」和「退出登录」两个，按位置取会取错。 */
function button(card: DOMWrapper<Element> | undefined, label: string) {
  return card?.findAll('button').find(item => item.text().trim() === label)
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateDisplayName.mockResolvedValue({ displayName: '新昵称', avatarUrl: null, themeKey: null, themeMode: 'FIXED' })
    mocks.changePassword.mockResolvedValue(undefined)
    mocks.uploadAvatar.mockResolvedValue({ displayName: '站长', avatarUrl: '/media/avatar.webp', themeKey: null, themeMode: 'FIXED' })
    mocks.devices.mockResolvedValue([])
    mocks.revokeDevice.mockResolvedValue(undefined)
    mocks.revokeOtherDevices.mockResolvedValue({ removed: 0 })
    mocks.renameDevice.mockResolvedValue({ deviceName: '我的 iPhone' })
  })

  it('保存昵称后同步现有后台会话', async () => {
    const { wrapper, session, updateUser, message } = mountPage()
    await wrapper.get('.profile-name-view button').trigger('click')
    await wrapper.get('input[placeholder="前台展示的昵称"]').setValue(' 新昵称 ')
    await wrapper.get('.profile-name-edit button').trigger('click')
    await flushPromises()
    expect(mocks.updateDisplayName).toHaveBeenCalledWith({ displayName: '新昵称' })
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ id: 1, displayName: '新昵称' }))
    expect(session.user?.displayName).toBe('新昵称')
    expect(message).toHaveBeenCalledWith('昵称已更新')
  })

  it('校验密码并在成功后清空三个输入框', async () => {
    const { wrapper, fail, message } = mountPage()
    const inputs = wrapper.findAll('.password-card input')
    await inputs[1]!.setValue('short')
    await wrapper.get('.password-card button').trigger('click')
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({ message: '新密码至少需要 8 位' }))

    await inputs[0]!.setValue('old-secret')
    await inputs[1]!.setValue('new-secret')
    await inputs[2]!.setValue('new-secret')
    await wrapper.get('.password-card button').trigger('click')
    await flushPromises()
    expect(mocks.changePassword).toHaveBeenCalledWith({ currentPassword: 'old-secret', newPassword: 'new-secret' })
    expect(inputs.map(input => (input.element as HTMLInputElement).value)).toEqual(['', '', ''])
    // 改密码会连带把其他设备踢下线，提示要说清楚这件事
    expect(message).toHaveBeenCalledWith('密码修改成功，其他设备已退出登录')
  })

  it('头像上传更新会话，备份下载使用直接链接', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const { wrapper, session, message } = mountPage()
    const input = wrapper.get('input[type="file"]')
    const file = new File(['avatar'], 'avatar.webp', { type: 'image/webp' })
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change')
    await flushPromises()
    expect(mocks.uploadAvatar).toHaveBeenCalledWith(expect.any(FormData))
    expect(session.user?.avatarUrl).toBe('/media/avatar.webp')

    await wrapper.get('.backup-actions button').trigger('click')
    expect(click).toHaveBeenCalledOnce()
    expect(message).toHaveBeenCalledWith('已开始导出，文件较大时请稍候')
    click.mockRestore()
  })

  /*
   * 登录设备。会话存在数据库里，这份列表就是设备清单本身。
   */

  it('列出登录设备并标出本机', async () => {
    mocks.devices.mockResolvedValue([
      { sessionId: 'a', deviceId: 'd-a', named: false, deviceName: 'iPhone · Safari', ip: '1.2.3.4', loggedInAt: '2026-08-17T02:00:00Z', lastActiveAt: '2026-08-17T06:00:00Z', current: true },
      { sessionId: 'b', deviceId: 'd-b', named: false, deviceName: 'Windows · Edge', ip: '5.6.7.8', loggedInAt: '2026-08-10T02:00:00Z', lastActiveAt: '2026-08-11T06:00:00Z', current: false },
    ])
    const { wrapper } = mountPage()
    await flushPromises()

    const items = wrapper.findAll('.device-item')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('iPhone · Safari')
    expect(items[0]?.text()).toContain('本机')
    // 本机不给退出按钮，免得自己把自己踢下线；但「改名」两台都该有
    expect(button(items[0], '退出登录')).toBeUndefined()
    expect(button(items[0], '改名')).toBeDefined()
    expect(button(items[1], '退出登录')).toBeDefined()
  })

  it('踢掉一台设备后刷新列表', async () => {
    mocks.devices.mockResolvedValue([
      { sessionId: 'a', deviceId: 'd-a', named: false, deviceName: 'iPhone · Safari', ip: null, loggedInAt: '2026-08-17T02:00:00Z', lastActiveAt: '2026-08-17T06:00:00Z', current: true },
      { sessionId: 'b', deviceId: 'd-b', named: false, deviceName: 'Windows · Edge', ip: null, loggedInAt: '2026-08-10T02:00:00Z', lastActiveAt: '2026-08-11T06:00:00Z', current: false },
    ])
    const { wrapper, confirm } = mountPage()
    await flushPromises()

    await button(wrapper.findAll('.device-item')[1], '退出登录')!.trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalled()
    expect(mocks.revokeDevice).toHaveBeenCalledWith('b')
    expect(mocks.devices).toHaveBeenCalledTimes(2)
  })

  it('改完密码顺带刷新设备列表，因为服务端已经把其他设备踢掉了', async () => {
    const { wrapper, message } = mountPage()
    await flushPromises()
    const fields = wrapper.findAll('.password-card input')
    await fields[0]?.setValue('old-password')
    await fields[1]?.setValue('new-password')
    await fields[2]?.setValue('new-password')
    await wrapper.get('.password-card button').trigger('click')
    await flushPromises()

    expect(mocks.changePassword).toHaveBeenCalled()
    expect(message).toHaveBeenCalledWith(expect.stringContaining('其他设备已退出登录'))
    expect(mocks.devices).toHaveBeenCalledTimes(2)
  })

  it('可以给设备起名字，本机地址显示成「本机」', async () => {
    mocks.devices.mockResolvedValue([
      { sessionId: 'a', deviceId: 'd-a', named: false, deviceName: 'iPhone · iOS 17 · Safari',
        ip: '0:0:0:0:0:0:0:1', loggedInAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), current: true },
    ])
    const { wrapper, message } = mountPage()
    await flushPromises()

    // IPv6 回环展开写法又长又看不出含义
    expect(wrapper.get('.device-item').text()).toContain('本机')

    await button(wrapper.findAll('.device-item')[0], '改名')!.trigger('click')
    await wrapper.get('.device-rename input').setValue('我的 iPhone')
    await button(wrapper.findAll('.device-item')[0], '保存')!.trigger('click')
    await flushPromises()

    expect(mocks.renameDevice).toHaveBeenCalledWith('a', '我的 iPhone')
    expect(message).toHaveBeenCalledWith('设备名已更新')
  })
})
