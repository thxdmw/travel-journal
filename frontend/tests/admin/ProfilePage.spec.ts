import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProfilePage from '@/admin/pages/ProfilePage.vue'
import type { AdminInfo } from '@/types/auth'

const mocks = vi.hoisted(() => ({
  uploadAvatar: vi.fn(),
  updateDisplayName: vi.fn(),
  changePassword: vi.fn(),
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

function mountPage() {
  const session = reactive<{ user: AdminInfo | null }>({
    user: { id: 1, username: 'admin', displayName: '站长', avatarUrl: null, themeKey: null },
  })
  const updateUser = vi.fn((user: AdminInfo) => { session.user = user })
  const message = vi.fn()
  const fail = vi.fn()
  const wrapper = mount(ProfilePage, {
    props: { session, updateUser, message, fail },
    global: { components: { ElButton, ElInput, ElForm, ElFormItem } },
  })
  return { wrapper, session, updateUser, message, fail }
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateDisplayName.mockResolvedValue({ displayName: '新昵称', avatarUrl: null, themeKey: null, themeMode: 'FIXED' })
    mocks.changePassword.mockResolvedValue(undefined)
    mocks.uploadAvatar.mockResolvedValue({ displayName: '站长', avatarUrl: '/media/avatar.webp', themeKey: null, themeMode: 'FIXED' })
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
    expect(message).toHaveBeenCalledWith('密码修改成功')
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
})
