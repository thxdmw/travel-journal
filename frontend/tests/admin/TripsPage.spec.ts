import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TripsPage from '@/admin/pages/TripsPage.vue'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  uploadCover: vi.fn(),
  clearCover: vi.fn(),
  themeList: vi.fn(),
  push: vi.fn(),
}))
vi.mock('@/api/trip', () => ({ tripApi: {
  list: mocks.list,
  create: mocks.create,
  update: mocks.update,
  uploadCover: mocks.uploadCover,
  clearCover: mocks.clearCover,
} }))
vi.mock('@/api/theme', () => ({ themeApi: { list: mocks.themeList } }))
vi.mock('@/vendor/vue-router-global', () => ({ useRouter: () => ({ push: mocks.push }) }))

const ElButton = {
  props: ['loading'],
  emits: ['click'],
  template: '<button type="button" :disabled="loading" @click="$emit(\'click\', $event)"><slot /></button>',
}
const ElInput = {
  props: ['modelValue', 'placeholder', 'type', 'rows', 'maxlength', 'clearable', 'showWordLimit'],
  emits: ['update:modelValue', 'keyup'],
  template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup="$emit(\'keyup\', $event)">',
}
const ElSelect = {
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<select :value="modelValue ?? \'\'" :aria-label="placeholder" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
}
const ElOption = { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' }
const ElDatePicker = {
  props: ['modelValue', 'placeholder', 'editable', 'format', 'valueFormat'],
  emits: ['update:modelValue'],
  template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)">',
}
const ElDialog = {
  props: ['modelValue', 'title'],
  emits: ['update:modelValue', 'closed'],
  template: '<section v-if="modelValue" class="dialog"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></section>',
}
const ElForm = {
  methods: { validate: () => Promise.resolve(), clearValidate: () => undefined },
  template: '<form><slot /></form>',
}
const ElFormItem = { props: ['label'], template: '<label>{{ label }}<slot /></label>' }
const ElEmpty = { props: ['description'], template: '<div>{{ description }}</div>' }

const trip = {
  id: 7,
  createdAt: '2026-08-01T10:00:00+08:00',
  updatedAt: '2026-08-02T10:00:00+08:00',
  title: '京都四月',
  slug: 'kyoto-2026',
  summary: '樱花与小巷',
  status: 'PLANNING',
  startDate: '2026-04-01',
  endDate: '2026-04-08',
  defaultCurrency: 'JPY',
  coverMediaId: 42,
  internalNote: null,
  themeKey: null,
} as const

function mountPage() {
  const message = vi.fn()
  const warning = vi.fn()
  const fail = vi.fn()
  const wrapper = mount(TripsPage, {
    props: { message, warning, fail },
    global: {
      components: { ElButton, ElInput, ElSelect, ElOption, ElDatePicker, ElDialog, ElForm, ElFormItem, ElEmpty },
      directives: { loading: () => undefined },
    },
  })
  return { wrapper, message, warning, fail }
}

describe('TripsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue({ items: [trip], page: 1, pageSize: 100, total: 1, totalPages: 1 })
    mocks.themeList.mockResolvedValue([])
    mocks.update.mockResolvedValue(trip)
    mocks.clearCover.mockResolvedValue(undefined)
    mocks.push.mockResolvedValue(undefined)
  })

  it('加载旅行并进入对应工作台', async () => {
    const { wrapper } = mountPage()
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledWith({ page: 1, pageSize: 100, keyword: '' })
    expect(mocks.themeList).toHaveBeenCalledWith(true)
    expect(wrapper.get('.admin-trip-card').text()).toContain('京都四月')
    await wrapper.get('.admin-trip-card').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith('/trips/7')
  })

  it('移除既有封面时先清理媒体再更新旅行', async () => {
    const { wrapper, message } = mountPage()
    await flushPromises()
    await wrapper.get('.admin-trip-card footer button').trigger('click')
    await wrapper.get('.cover-actions button:nth-child(2)').trigger('click')
    await wrapper.get('.dialog footer button:last-child').trigger('click')
    await flushPromises()
    expect(mocks.clearCover).toHaveBeenCalledWith(7)
    expect(mocks.update).toHaveBeenCalledWith(7, expect.objectContaining({ coverMediaId: null }))
    expect(mocks.clearCover.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]!)
    expect(message).toHaveBeenCalledWith('旅行已保存')
  })

  it('查询使用当前关键字并将失败交给统一处理', async () => {
    const { wrapper, fail } = mountPage()
    await flushPromises()
    await wrapper.get('input[placeholder="搜索旅行"]').setValue('京都')
    mocks.list.mockRejectedValueOnce(new Error('网络错误'))
    await wrapper.get('.toolbar button').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, pageSize: 100, keyword: '京都' })
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({ message: '网络错误' }))
  })
})
