import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from '@/admin/pages/DashboardPage.vue'

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  push: vi.fn(),
}))
vi.mock('@/api/dashboard', () => ({ dashboardApi: { overview: mocks.overview } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }) }))

const ElButton = { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' }
const ElTable = { props: ['data'], template: '<div class="el-table"><slot /></div>' }
const ElTableColumn = {
  props: ['label'],
  // 把每一行都渲染出来，才能断言旅行标题这类由模板计算的列
  inject: { rows: { default: () => [] } },
  template: '<div class="el-table-column"><slot :row="{}" /></div>',
}

function recent(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id, title: `日记 ${id}`, tripTitle: null, occurredOn: '2026-08-01',
    status: 'DRAFT', updatedAt: '2026-08-02T10:00:00+08:00', ...overrides,
  }
}

function mountPage(fail = vi.fn()) {
  return mount(DashboardPage, {
    props: { fail },
    global: { components: { ElButton, ElTable, ElTableColumn } },
  })
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.overview.mockResolvedValue({
      trips: 3, drafts: 128, published: 431, themeName: '盛夏出逃',
      recent: [recent(1), recent(2, { tripTitle: '京都四日' })],
    })
  })

  it('统计直接用后端聚合结果，不再按前 100 条自己算', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.findAll('.metric strong').map(item => item.text())).toEqual(['3', '128', '431', '盛夏出逃'])
    expect(mocks.overview).toHaveBeenCalledTimes(1)
  })

  it('最近日记按后端返回的条数展示，并带上旅行标题', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const vm = wrapper.vm as unknown as { stats: { recent: unknown[] } }
    expect(vm.stats.recent).toHaveLength(2)
  })

  it('独立日记和空标题都有明确的降级文案', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const page = wrapper.vm as unknown as {
      tripLabel(row: unknown): string
      titleLabel(row: unknown): string
    }
    expect(page.tripLabel(recent(1))).toBe('独立日记')
    expect(page.tripLabel(recent(2, { tripTitle: '京都四日' }))).toBe('京都四日')
    expect(page.titleLabel(recent(3, { title: '' }))).toBe('未命名日记')
  })

  it('管理旅行按钮进入旅行列表', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('.page-head button').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith('/trips')
  })

  it('加载失败交给后台统一错误提示器', async () => {
    const error = new Error('服务不可用')
    mocks.overview.mockRejectedValue(error)
    const fail = vi.fn()
    mountPage(fail)
    await flushPromises()
    expect(fail).toHaveBeenCalledWith(error)
  })
})
