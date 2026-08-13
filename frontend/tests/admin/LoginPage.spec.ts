import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '@/admin/pages/LoginPage.vue'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  profile: vi.fn(),
  ensureCsrf: vi.fn(),
  replace: vi.fn(),
}))
vi.mock('@/api/auth', () => ({ authApi: { login: mocks.login } }))
vi.mock('@/api/public', () => ({ publicApi: { profile: mocks.profile } }))
vi.mock('@/api/client', () => ({ ensureCsrf: mocks.ensureCsrf }))
vi.mock('@/vendor/vue-router-global', () => ({ useRouter: () => ({ push: vi.fn(), replace: mocks.replace }) }))

const ElForm = { emits: ['submit'], template: '<form @submit.prevent="$emit(\'submit\')"><slot /></form>' }
const ElFormItem = { template: '<label><slot /></label>' }
const ElInput = {
  props: ['modelValue', 'placeholder', 'type', 'size', 'showPassword'],
  emits: ['update:modelValue', 'keyup'],
  template: '<input :value="modelValue" :placeholder="placeholder" :type="type || \'text\'" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup="$emit(\'keyup\', $event)">',
}
const ElButton = { props: ['loading'], emits: ['click'], template: '<button type="button" :disabled="loading" @click="$emit(\'click\')"><slot /></button>' }

function mountPage() {
  const completeSession = vi.fn()
  const rememberSession = vi.fn()
  const applyTheme = vi.fn()
  const fail = vi.fn()
  const wrapper = mount(LoginPage, {
    props: { completeSession, rememberSession, applyTheme, fail },
    global: { components: { ElForm, ElFormItem, ElInput, ElButton } },
  })
  return { wrapper, completeSession, rememberSession, applyTheme, fail }
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.login.mockResolvedValue({ id: 1, username: 'admin', displayName: '站长', avatarUrl: null, themeKey: 'travel-classic' })
    mocks.profile.mockResolvedValue({ displayName: '站长', avatarUrl: null, themeKey: 'travel-classic', theme: null })
    mocks.ensureCsrf.mockResolvedValue({ token: 'test' })
    mocks.replace.mockResolvedValue(undefined)
  })

  it('登录成功后更新会话、应用主题、初始化 CSRF 并进入管理首页', async () => {
    const { wrapper, completeSession, rememberSession, applyTheme } = mountPage()
    await wrapper.get('input[placeholder="密码"]').setValue('secret')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(mocks.login).toHaveBeenCalledWith({ username: 'admin', password: 'secret' })
    const user = expect.objectContaining({ displayName: '站长' })
    expect(completeSession).toHaveBeenCalledWith(user)
    expect(rememberSession).toHaveBeenCalledWith(user)
    expect(applyTheme).toHaveBeenCalledWith('travel-classic')
    expect(mocks.ensureCsrf).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith('/')
  })

  it('请求失败交给统一错误提示并恢复按钮', async () => {
    const error = new Error('密码错误')
    mocks.login.mockRejectedValue(error)
    const { wrapper, fail } = mountPage()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(fail).toHaveBeenCalledWith(error)
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })
})
