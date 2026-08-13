import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TripWorkspacePage from '@/admin/pages/TripWorkspacePage.vue'

const mocks = vi.hoisted(() => ({
  getTrip: vi.fn(), dashboard: vi.fn(), stops: vi.fn(), itinerary: vi.fn(), budget: vi.fn(), expenses: vi.fn(), journals: vi.fn(),
  replace: vi.fn(), push: vi.fn(),
}))
vi.mock('@/api/trip', () => ({ tripApi: { get: mocks.getTrip, dashboard: mocks.dashboard, stops: mocks.stops } }))
vi.mock('@/api/itinerary', () => ({ itineraryApi: { list: mocks.itinerary } }))
vi.mock('@/api/budget', () => ({ budgetApi: { summary: mocks.budget, expenses: mocks.expenses } }))
vi.mock('@/api/journal', () => ({ journalApi: { list: mocks.journals } }))
vi.mock('@/api/map', () => ({ mapApi: {} }))
vi.mock('@/map', () => ({ create: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '7' }, query: {}, fullPath: '/trips/7', meta: {} }),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}))

const trip = {
  id: 7, createdAt: '2026-01-01T00:00:00+08:00', updatedAt: '2026-01-01T00:00:00+08:00',
  title: '京都四月', slug: 'kyoto', summary: '樱花与小巷', status: 'PLANNING', startDate: '2026-04-01', endDate: '2026-04-08',
  defaultCurrency: 'JPY', coverMediaId: null, internalNote: null, themeKey: null,
} as const

describe('TripWorkspacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    })
    mocks.getTrip.mockResolvedValue(trip)
    mocks.dashboard.mockResolvedValue({ trip, stopCount: 2, itineraryCount: 4, draftCount: 1, publishedCount: 3, budgetTotal: 1000, actualExpense: 200, remainingBudget: 800 })
    mocks.replace.mockResolvedValue(undefined)
    mocks.push.mockResolvedValue(undefined)
  })

  it('按概览数据块加载并显示旅行统计', async () => {
    const wrapper = mount(TripWorkspacePage, {
      props: { message: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn(), fail: vi.fn(), confirm: vi.fn() },
      global: {
        components: {
          ElTabs: { template: '<section><slot /></section>' },
          ElTabPane: { props: ['label', 'name'], template: '<article><slot /></article>' },
          ElButton: { template: '<button><slot /></button>' },
          ElTable: { template: '<div><slot /></div>' }, ElTableColumn: { template: '<div />' },
          ElEmpty: { template: '<div />' }, ElDialog: { template: '<div />' },
          ElDescriptions: { template: '<div><slot /></div>' }, ElDescriptionsItem: { template: '<div><slot /></div>' },
        },
        directives: { loading: () => undefined },
      },
    })
    await flushPromises()
    expect(mocks.getTrip).toHaveBeenCalledWith(7)
    expect(mocks.dashboard).toHaveBeenCalledWith(7)
    expect(wrapper.find('.workspace-head').text()).toContain('京都四月')
    expect(wrapper.findAll('.dashboard-grid .metric').map(item => item.text())).toEqual(['城市2', '行程4', '草稿1', '已发布3'])
  })
})
