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
  deletionSummary: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('@/api/trip', () => ({ tripApi: {
  list: mocks.list,
  create: mocks.create,
  update: mocks.update,
  uploadCover: mocks.uploadCover,
  clearCover: mocks.clearCover,
  deletionSummary: mocks.deletionSummary,
  remove: mocks.remove,
} }))
vi.mock('@/api/theme', () => ({ themeApi: { list: mocks.themeList } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))

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

const ElSkeleton = { template: '<div class="el-skeleton" />' }
const ElSkeletonItem = { template: '<div class="el-skeleton-item" />' }
function mountPage() {
  const message = vi.fn()
  const warning = vi.fn()
  const fail = vi.fn()
  const confirm = vi.fn().mockResolvedValue(undefined)
  const wrapper = mount(TripsPage, {
    props: { message, warning, fail, confirm },
    global: {
      components: { ElButton, ElInput, ElSelect, ElOption, ElDatePicker, ElDialog, ElForm, ElFormItem, ElEmpty, ElSkeleton, ElSkeletonItem },
      directives: { loading: () => undefined },
    },
  })
  return { wrapper, message, warning, fail, confirm }
}

describe('TripsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue({ items: [trip], page: 1, pageSize: 100, total: 1, totalPages: 1 })
    mocks.themeList.mockResolvedValue([])
    mocks.update.mockResolvedValue(trip)
    mocks.clearCover.mockResolvedValue(undefined)
    mocks.push.mockResolvedValue(undefined)
    mocks.deletionSummary.mockResolvedValue({
      title: '京都四月', journalCount: 3, momentCount: 12, photoCount: 40,
      stopCount: 2, itineraryCount: 5, expenseCount: 8,
    })
    mocks.remove.mockResolvedValue({
      title: '京都四月', journalCount: 3, momentCount: 12, photoCount: 40,
      stopCount: 2, itineraryCount: 5, expenseCount: 8,
    })
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

  /*
   * 删除是不可撤销的，确认框必须先说清楚这一下会带走什么。
   * 只问一句「确定吗」等于把一整场旅行的日记和照片压在一次误点上。
   */

  it('删除前先清点，并把数量写进确认框', async () => {
    const { wrapper, confirm, message } = mountPage()
    await flushPromises()
    await wrapper.get('.admin-trip-card footer button').trigger('click')

    await wrapper.get('.dialog footer button:first-child').trigger('click')
    await flushPromises()

    expect(mocks.deletionSummary).toHaveBeenCalledWith(7)
    const asked = confirm.mock.calls[0]?.[0] as string
    expect(asked).toContain('京都四月')
    expect(asked).toContain('3 篇日记')
    expect(asked).toContain('12 条随手记')
    expect(asked).toContain('40 张照片')
    // 只是想收起来的话该用归档，确认框里要说出来
    expect(asked).toContain('已归档')
    expect(mocks.remove).toHaveBeenCalledWith(7)
    expect(message).toHaveBeenCalledWith('旅行已删除')
  })

  it('确认框里取消就什么都不做', async () => {
    const { wrapper, confirm } = mountPage()
    await flushPromises()
    confirm.mockRejectedValueOnce(new Error('cancel'))
    await wrapper.get('.admin-trip-card footer button').trigger('click')

    await wrapper.get('.dialog footer button:first-child').trigger('click')
    await flushPromises()

    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
