import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JournalManagerPage from '@/admin/pages/JournalManagerPage.vue'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  mediaCount: vi.fn(),
  remove: vi.fn(),
  options: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  route: null as unknown as { query: Record<string, string> },
}))
vi.mock('@/api/journal', () => ({
  journalApi: { list: mocks.list, mediaCount: mocks.mediaCount, remove: mocks.remove },
}))
vi.mock('@/api/trip', () => ({ tripApi: { options: mocks.options } }))
vi.mock('vue-router', async () => {
  const { reactive } = await vi.importActual<typeof import('vue')>('vue')
  mocks.route = reactive({ query: {} as Record<string, string> })
  return { useRoute: () => mocks.route, useRouter: () => ({ replace: mocks.replace, push: mocks.push }) }
})

const ElButton = { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' }
const passthrough = (tag: string) => ({ template: `<${tag}><slot /></${tag}>` })
const stubs = {
  ElButton,
  ElInput: { props: ['modelValue'], template: '<input :value="modelValue">' },
  ElSelect: passthrough('div'),
  ElOption: passthrough('div'),
  ElTable: { props: ['data'], template: '<div class="el-table"><slot /></div>' },
  ElTableColumn: { template: '<div class="el-table-column"><slot :row="{}" /></div>' },
  ElEmpty: passthrough('div'),
  ElPagination: { props: ['total', 'currentPage'], template: '<div class="el-pagination" />' },
}

function journal(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z', tripId: null, tripStopId: null,
    title: `日记 ${id}`, slug: `journal-${id}`, excerpt: null, contentJson: null, status: 'DRAFT',
    occurredOn: '2026-08-01', coverMediaId: null, publishedAt: null, themeKey: null, templateId: null,
    templateVersion: null, tags: null, tripTitle: null, ...overrides,
  }
}

const deps = () => ({ message: vi.fn(), fail: vi.fn(), confirm: vi.fn().mockResolvedValue(true) })

function mountPage(props = deps()) {
  return { props, wrapper: mount(JournalManagerPage, { props, global: { stubs } }) }
}

describe('JournalManagerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.route.query = {}
    mocks.list.mockResolvedValue({ items: [journal(1), journal(2, { tripTitle: '京都四日' })], page: 1, pageSize: 20, total: 2, totalPages: 1 })
    mocks.options.mockResolvedValue([{ id: 7, title: '京都四日' }])
    mocks.mediaCount.mockResolvedValue({ count: 3 })
    mocks.remove.mockResolvedValue({ removedMedia: 3 })
  })

  it('按分页参数加载，不再一次拉一百条', async () => {
    mountPage()
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }))
    // 旅行下拉走轻量选项接口，避免被前 100 条静默截断
    expect(mocks.options).toHaveBeenCalledTimes(1)
  })

  it('从地址栏恢复页码和筛选条件', async () => {
    mocks.route.query = { page: '3', q: '京都', status: 'PUBLISHED', tripId: '7' }
    mountPage()
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledWith({ page: 3, pageSize: 20, keyword: '京都', status: 'PUBLISHED', tripId: 7 })
  })

  it('换筛选条件回到第一页并写进地址栏', async () => {
    mocks.route.query = { page: '3' }
    const { wrapper } = mountPage()
    await flushPromises()
    const page = wrapper.vm as unknown as { query: { keyword: string }, search(): Promise<void> }
    page.query.keyword = '奈良'
    await page.search()
    expect(mocks.replace).toHaveBeenLastCalledWith({ path: '/journals', query: { q: '奈良' } })
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, keyword: '奈良' }))
  })

  it('独立日记和空标题有明确降级文案', async () => {
    const { wrapper } = mountPage()
    await flushPromises()
    const page = wrapper.vm as unknown as {
      tripLabel(row: unknown): string
      titleLabel(row: unknown): string
    }
    expect(page.tripLabel(journal(1))).toBe('独立日记')
    expect(page.tripLabel(journal(2, { tripTitle: '京都四日' }))).toBe('京都四日')
    expect(page.titleLabel(journal(3, { title: '' }))).toBe('未命名日记')
  })

  it('删除前先问清楚会连带删掉多少张图片', async () => {
    const { props, wrapper } = mountPage()
    await flushPromises()
    const page = wrapper.vm as unknown as { remove(row: unknown): Promise<void> }
    await page.remove(journal(1))
    expect(mocks.mediaCount).toHaveBeenCalledWith(1)
    expect(props.confirm).toHaveBeenCalledWith(expect.stringContaining('3 张图片'))
    expect(mocks.remove).toHaveBeenCalledWith(1)
  })
})
