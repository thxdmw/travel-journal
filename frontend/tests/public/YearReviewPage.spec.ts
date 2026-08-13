import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import YearReviewPage from '@/public/pages/YearReviewPage.vue'
import type { YearReview } from '@/types/public'

const mocks = vi.hoisted(() => ({
  years: vi.fn(),
  yearReview: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  route: { params: {} as Record<string, string> },
}))

vi.mock('@/api/public', () => ({
  publicApi: { years: mocks.years, yearReview: mocks.yearReview },
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))

const RouterLink = {
  props: ['to'],
  template: '<a :href="String(to)"><slot /></a>',
}

function review(overrides: Partial<YearReview> = {}): YearReview {
  return {
    year: 2026,
    tripCount: 2,
    cityCount: 5,
    countryCount: 2,
    journalCount: 7,
    photoCount: 128,
    distanceKm: 12345,
    cities: [],
    trips: [{ title: '京都之旅', slug: 'kyoto', startDate: '2026-04-01', endDate: '2026-04-05', cityCount: 2, journalCount: 3 }],
    farthestCity: '雷克雅未克',
    longestTripDays: 8,
    ...overrides,
  }
}

describe('YearReviewPage', () => {
  beforeEach(() => {
    mocks.route.params = {}
    mocks.years.mockReset()
    mocks.yearReview.mockReset()
    mocks.push.mockReset()
    mocks.replace.mockReset()
  })

  it('未指定年份时跳到最近有内容的一年', async () => {
    mocks.years.mockResolvedValue([2026, 2025])
    const wrapper = mount(YearReviewPage, { global: { components: { RouterLink } } })
    await flushPromises()

    expect(mocks.replace).toHaveBeenCalledWith('/years/2026')
    expect(mocks.yearReview).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('渲染年度统计、旅行链接并可切换年份', async () => {
    mocks.route.params = { year: '2026' }
    mocks.years.mockResolvedValue([2026, 2025])
    mocks.yearReview.mockResolvedValue(review())
    const wrapper = mount(YearReviewPage, { global: { components: { RouterLink } } })
    await flushPromises()

    expect(mocks.yearReview).toHaveBeenCalledWith(2026)
    expect(wrapper.text()).toContain('12,345')
    expect(wrapper.text()).toContain('雷克雅未克')
    expect(wrapper.get('a[href="/trips/kyoto"]')).toBeTruthy()

    await wrapper.findAll('.year-switch button').find(button => button.text() === '2025')?.trigger('click')
    expect(mocks.push).toHaveBeenCalledWith('/years/2025')
  })

  it('年度接口失败时显示无公开日记', async () => {
    mocks.route.params = { year: '2024' }
    mocks.years.mockResolvedValue([2024])
    mocks.yearReview.mockRejectedValue(new Error('断网'))
    const wrapper = mount(YearReviewPage, { global: { components: { RouterLink } } })
    await flushPromises()

    expect(wrapper.get('.empty').text()).toBe('2024 年还没有公开的日记。')
  })
})
