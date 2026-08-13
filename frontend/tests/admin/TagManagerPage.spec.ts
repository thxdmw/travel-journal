import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TagManagerPage from '@/admin/pages/TagManagerPage.vue'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  rename: vi.fn(),
  merge: vi.fn(),
  remove: vi.fn(),
  purgeUnused: vi.fn(),
}))

vi.mock('@/api/journal', () => ({ journalTagApi: mocks }))

const ElButton = {
  props: ['loading'],
  emits: ['click'],
  template: '<button type="button" :disabled="loading" @click="$emit(\'click\')"><slot /></button>',
}
const ElSelect = {
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<select :aria-label="placeholder" :value="modelValue ?? \'\'" @change="$emit(\'update:modelValue\', Number($event.target.value))"><option value=""></option><slot /></select>',
}
const ElOption = { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' }
const ElInput = { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" />' }
const ElTable = { template: '<div class="el-table"></div>' }
const ElTableColumn = { template: '<div></div>' }
const ElEmpty = { props: ['description'], template: '<div class="el-empty">{{ description }}</div>' }

function mountPage(confirm = vi.fn().mockResolvedValue(undefined)) {
  const message = vi.fn()
  const warning = vi.fn()
  const fail = vi.fn()
  const wrapper = mount(TagManagerPage, {
    props: { message, warning, fail, confirm },
    global: {
      components: { ElButton, ElSelect, ElOption, ElInput, ElTable, ElTableColumn, ElEmpty },
      directives: { loading: () => undefined },
    },
  })
  return { wrapper, message, warning, fail, confirm }
}

describe('TagManagerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue([
      { id: 1, name: '山野', slug: 'mountain', journalCount: 2 },
      { id: 2, name: '徒步', slug: 'hiking', journalCount: 1 },
    ])
    mocks.merge.mockResolvedValue(undefined)
    mocks.purgeUnused.mockResolvedValue(2)
  })

  it('加载标签并在合并参数不完整时提示', async () => {
    const { wrapper, warning } = mountPage()
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledOnce()
    expect(wrapper.get('select[aria-label="把这个标签"]').text()).toContain('山野（2）')
    await wrapper.get('.tag-merge-bar button').trigger('click')
    expect(warning).toHaveBeenCalledWith('请选择要合并的两个标签')
    expect(mocks.merge).not.toHaveBeenCalled()
  })

  it('确认后合并标签并刷新列表', async () => {
    const { wrapper, confirm, message } = mountPage()
    await flushPromises()
    await wrapper.get('select[aria-label="把这个标签"]').setValue('1')
    await wrapper.get('select[aria-label="这个标签"]').setValue('2')
    await wrapper.get('.tag-merge-bar button').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith('把「山野」并入「徒步」？前者会被删除，它的日记全部转到后者。')
    expect(mocks.merge).toHaveBeenCalledWith(1, 2)
    expect(message).toHaveBeenCalledWith('已合并')
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })

  it('清理空标签并忽略取消确认', async () => {
    const { wrapper, message } = mountPage()
    await flushPromises()
    await wrapper.get('.page-head button').trigger('click')
    await flushPromises()
    expect(mocks.purgeUnused).toHaveBeenCalledOnce()
    expect(message).toHaveBeenCalledWith('已清理 2 个空标签')

    const cancelled = vi.fn().mockRejectedValue('cancel')
    const second = mountPage(cancelled)
    await flushPromises()
    await second.wrapper.get('.page-head button').trigger('click')
    await flushPromises()
    expect(second.fail).not.toHaveBeenCalled()
  })
})
