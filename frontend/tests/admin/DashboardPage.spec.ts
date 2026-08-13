import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from '@/admin/pages/DashboardPage.vue'

const mocks = vi.hoisted(() => ({
  trips: vi.fn(),
  journals: vi.fn(),
  push: vi.fn(),
}))
vi.mock('@/api/trip', () => ({ tripApi: { list: mocks.trips } }))
vi.mock('@/api/journal', () => ({ journalApi: { list: mocks.journals } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }) }))

const ElButton = { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' }
const ElTable = { props: ['data'], template: '<div class="el-table"><slot /></div>' }
const ElTableColumn = { template: '<div class="el-table-column"><slot :row="{}" /></div>' }

function journal(id: number, status: 'DRAFT' | 'PUBLISHED') {
  return {
    id, createdAt: '2026-08-01T10:00:00+08:00', updatedAt: '2026-08-02T10:00:00+08:00', tripId: null,
    tripStopId: null, title: `日记 ${id}`, slug: `journal-${id}`, excerpt: null, contentJson: null, status,
    occurredOn: '2026-08-01', coverMediaId: null, publishedAt: null, themeKey: null, templateId: null,
    templateVersion: null, tags: null,
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
    mocks.trips.mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 3, totalPages: 1 })
    mocks.journals.mockResolvedValue({
      items: [journal(1, 'DRAFT'), journal(2, 'PUBLISHED'), journal(3, 'DRAFT'), journal(4, 'PUBLISHED'), journal(5, 'PUBLISHED'), journal(6, 'PUBLISHED'), journal(7, 'PUBLISHED')],
      page: 1, pageSize: 100, total: 7, totalPages: 1,
    })
  })

  it('统计旅行、草稿、已发布日记并只保留最近六篇', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.findAll('.metric strong').map(item => item.text())).toEqual(['3', '2', '5', '远行手记'])
    expect(wrapper.get('.el-table').attributes('data')).toBeUndefined()
    expect(mocks.trips).toHaveBeenCalledWith({ page: 1, pageSize: 100 })
    expect(mocks.journals).toHaveBeenCalledWith({ page: 1, pageSize: 100 })
  })

  it('管理旅行按钮进入旅行列表', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('.page-head button').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith('/trips')
  })

  it('加载失败交给后台统一错误提示器', async () => {
    const error = new Error('服务不可用')
    mocks.trips.mockRejectedValue(error)
    const fail = vi.fn()
    mountPage(fail)
    await flushPromises()
    expect(fail).toHaveBeenCalledWith(error)
  })
})
