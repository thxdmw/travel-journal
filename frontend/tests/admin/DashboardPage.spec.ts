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
const ElEmpty = { template: '<div class="el-empty"><slot /></div>' }
// 骨架屏只关心「在不在」，内部结构由 Element Plus 负责
const ElSkeleton = { template: '<div class="el-skeleton"><slot name="template" /></div>' }
const ElSkeletonItem = { template: '<div class="el-skeleton-item" />' }

function recent(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id, title: `日记 ${id}`, tripTitle: null, occurredOn: '2026-08-01',
    status: 'DRAFT', updatedAt: '2026-08-02T10:00:00+08:00', ...overrides,
  }
}

function mountPage(fail = vi.fn()) {
  return mount(DashboardPage, {
    props: { fail },
    global: { components: { ElButton, ElEmpty, ElSkeleton, ElSkeletonItem } },
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

  it('最近日记是一张张卡片，操作不用横向滚动才够得着', async () => {
    /*
     * 以前这里是 el-table。五列在手机上塞不下，得先横向拖到最右边才看得见「编辑」，
     * 而这一屏的用途恰恰就是「点开继续写」。
     */
    const wrapper = mountPage()
    await flushPromises()
    const cards = wrapper.findAll('.recent-journal-card')
    expect(cards).toHaveLength(2)
    expect(cards[1]?.text()).toContain('京都四日')
    // 每张卡片自带编辑入口，位置固定
    expect(cards[0]?.find('footer button').exists()).toBe(true)
  })

  it('数据没回来时先占位，不让指标从 0 跳成真实值', async () => {
    /*
     * 不占位的话四个指标会先按初值渲染成 0，几百毫秒后突然跳变——看着像刚才统计错了。
     */
    let resolve: ((value: unknown) => void) | undefined
    mocks.overview.mockReturnValue(new Promise(done => { resolve = done }))
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('.el-skeleton').exists()).toBe(true)
    expect(wrapper.findAll('.metric strong')).toHaveLength(0)

    resolve?.({ trips: 3, drafts: 1, published: 2, themeName: '盛夏出逃', recent: [] })
    await flushPromises()
    expect(wrapper.find('.el-skeleton').exists()).toBe(false)
    expect(wrapper.findAll('.metric strong')).toHaveLength(4)
  })

  it('一条日记都没有时给空状态，而不是一片空白', async () => {
    mocks.overview.mockResolvedValue({ trips: 0, drafts: 0, published: 0, themeName: '—', recent: [] })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('.recent-journal-card').exists()).toBe(false)
    expect(wrapper.find('.el-empty').exists()).toBe(true)
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
