import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TemplateManagerPage from '@/admin/pages/TemplateManagerPage.vue'
import { CATALOG } from '@/journal/catalog'

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), duplicate: vi.fn(), remove: vi.fn() }))
vi.mock('@/api/template', () => ({ templateApi: mocks }))

const ElButton = { emits: ['click'], template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' }
const ElDialog = { props: ['modelValue', 'title'], template: '<section v-if="modelValue" class="dialog"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></section>' }
const ElInput = { props: ['modelValue', 'placeholder', 'maxlength', 'type', 'rows', 'showWordLimit'], emits: ['update:modelValue'], template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)"><slot name="prepend" />' }
const passthrough = { template: '<div><slot /></div>' }
const ElSwitch = { props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="checkbox" :checked="modelValue">' }
const ElEmpty = { props: ['description'], template: '<div>{{ description }}</div>' }
const ElTooltip = { template: '<span><slot /></span>' }

const template = {
  id: 1, createdAt: '2026-08-01T10:00:00+08:00', updatedAt: '2026-08-01T10:00:00+08:00', name: '慢游模板', description: '记录慢旅行', category: 'CUSTOM', version: 1, enabled: true, builtin: false,
  definitionJson: { title: '慢游模板', blocks: [{ id: 'text-1', type: 'text', title: '今日故事', required: false, config: { placeholder: '写下这一段' } }] },
}

const ElSkeleton = { template: '<div class="el-skeleton" />' }
const ElSkeletonItem = { template: '<div class="el-skeleton-item" />' }
function mountPage() {
  const message = vi.fn(), warning = vi.fn(), fail = vi.fn(), confirm = vi.fn().mockResolvedValue(undefined)
  const wrapper = mount(TemplateManagerPage, {
    props: { message, warning, fail, confirm },
    global: {
      components: { ElButton, ElDialog, ElInput, ElSwitch, ElEmpty, ElTooltip, ElSkeleton, ElSkeletonItem, ElForm: passthrough, ElFormItem: passthrough, ElSelect: passthrough, ElOption: passthrough, ElInputNumber: passthrough },
      directives: { loading: () => undefined },
    },
  })
  return { wrapper, message, warning, fail, confirm }
}

describe('TemplateManagerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue([template])
    mocks.create.mockResolvedValue(template)
    mocks.update.mockResolvedValue(template)
    mocks.duplicate.mockResolvedValue({ ...template, id: 2, name: '慢游模板 副本' })
    mocks.remove.mockResolvedValue(undefined)
  })

  it('加载模板并渲染区块摘要', async () => {
    const { wrapper } = mountPage()
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledWith(false)
    expect(wrapper.get('.template-card').text()).toContain('慢游模板')
    expect(wrapper.get('.template-block-tags').text()).toContain('今日故事')
  })

  it('新建模板必须有区块，添加后可保存', async () => {
    const { wrapper, warning, message } = mountPage()
    await flushPromises()
    await wrapper.get('.page-head button').trigger('click')
    await wrapper.get('.template-editor-actions button:last-child').trigger('click')
    expect(warning).toHaveBeenCalledWith('请至少添加一个区块')
    // 区块库直接就是「添加区块」目录，第一个是正文
    await wrapper.findAll('.block-library button')[0]!.trigger('click')
    await wrapper.get('input[placeholder="例如：海边慢游的一天"]').setValue('我的模板')
    await wrapper.get('.template-editor-actions button:last-child').trigger('click')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: '我的模板', definitionJson: expect.objectContaining({ blocks: expect.arrayContaining([expect.objectContaining({ type: 'paragraph' })]) }) }))
    expect(message).toHaveBeenCalledWith('模板已保存')
  })

  it('区块库覆盖「添加区块」的全部类型，并按来路给出角标', async () => {
    const { wrapper } = mountPage()
    await flushPromises()
    await wrapper.get('.page-head button').trigger('click')
    expect(wrapper.findAll('.block-library button')).toHaveLength(CATALOG.length)
    // 三档来路各自有代表：花费自动取数、正文套用时填、天气记录生成后再填
    const labels = wrapper.findAll('.block-library button').map(item => item.text())
    expect(labels).toContain('＋ 花费自动')
    expect(labels).toContain('＋ 正文填写')
    expect(labels).toContain('＋ 天气记录待填')
  })

  it('老模板里的 text 读进编辑器时搬成正文', async () => {
    const { wrapper } = mountPage()
    await flushPromises()
    // 卡片上的「编辑」是第三个按钮（预览、复制、编辑、删除）
    await wrapper.findAll('.template-card footer button')[2]!.trigger('click')
    await wrapper.get('.template-editor-actions button:last-child').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(1, expect.objectContaining({
      definitionJson: expect.objectContaining({ blocks: [expect.objectContaining({ type: 'paragraph' })] }),
    }))
  })

  it('复制和确认删除后刷新列表', async () => {
    const { wrapper, confirm, message } = mountPage()
    await flushPromises()
    const buttons = wrapper.findAll('.template-card footer button')
    await buttons[1]!.trigger('click')
    await flushPromises()
    expect(message).toHaveBeenCalledWith('已复制为“慢游模板 副本”')
    await buttons[3]!.trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith('确定删除模板“慢游模板”吗？')
    expect(mocks.remove).toHaveBeenCalledWith(1)
  })
})
