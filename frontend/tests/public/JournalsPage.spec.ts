import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JournalsPage from '@/public/pages/JournalsPage.vue'
import type { JournalCard, TagView } from '@/types/journal'

const mocks = vi.hoisted(() => ({
  journals: vi.fn(),
  tags: vi.fn(),
  push: vi.fn(),
  route: { query: {} as Record<string, string> },
}))

vi.mock('@/api/public', () => ({
  publicApi: { journals: mocks.journals, tags: mocks.tags },
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push }),
}))

const RouterLink = {
  props: ['to'],
  template: '<a :href="String(to)"><slot /></a>',
}

function journal(overrides: Partial<JournalCard> = {}): JournalCard {
  return {
    id: 1,
    title: '京都的第三个清晨',
    slug: 'kyoto-morning',
    excerpt: null,
    occurredOn: '2026-04-03',
    tripTitle: null,
    tripSlug: null,
    cityName: null,
    coverUrl: '/api/media/7/display',
    ...overrides,
  }
}

const tags: TagView[] = [
  { id: 1, name: '春天', slug: 'spring', journalCount: 2 },
  { id: 2, name: '徒步', slug: 'hiking', journalCount: 1 },
]

describe('JournalsPage', () => {
  beforeEach(() => {
    mocks.route.query = {}
    mocks.journals.mockReset()
    mocks.tags.mockReset()
    mocks.push.mockReset()
    mocks.journals.mockResolvedValue({ items: [journal()], page: 1, pageSize: 12, total: 1, totalPages: 1 })
    mocks.tags.mockResolvedValue(tags)
  })

  it('渲染日记卡片并保持响应式图片契约', async () => {
    const wrapper = mount(JournalsPage, { global: { components: { RouterLink } } })
    await flushPromises()

    const image = wrapper.get('img')
    expect(image.attributes('srcset')).toContain('/api/media/7/thumbnail 480w')
    expect(wrapper.text()).toContain('✎ 独立日记')
    expect(wrapper.get('a[href="/journals/kyoto-morning"]')).toBeTruthy()
  })

  it('搜索和标签状态写入可分享 URL', async () => {
    const wrapper = mount(JournalsPage, { global: { components: { RouterLink } } })
    await flushPromises()

    await wrapper.get('input[type="search"]').setValue('  京都  ')
    await wrapper.get('.search-box button').trigger('click')
    expect(mocks.push).toHaveBeenLastCalledWith({ path: '/journals', query: { q: '京都' } })

    await wrapper.findAll('.tag-chip').find(button => button.text().includes('春天'))?.trigger('click')
    expect(mocks.push).toHaveBeenLastCalledWith({ path: '/journals', query: { q: '京都', tag: 'spring' } })
  })

  it('请求失败时显示可恢复的空状态', async () => {
    mocks.journals.mockRejectedValue(new Error('断网'))
    const wrapper = mount(JournalsPage, { global: { components: { RouterLink } } })
    await flushPromises()

    expect(wrapper.get('.empty').text()).toContain('没有找到匹配的日记')
    await wrapper.get('.text-link-btn').trigger('click')
    expect(mocks.push).toHaveBeenLastCalledWith({ path: '/journals' })
  })
})
