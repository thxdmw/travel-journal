import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TripsPage from '@/public/pages/TripsPage.vue'
import type { TripCard } from '@/types/public'

const { trips } = vi.hoisted(() => ({
  trips: vi.fn<() => Promise<TripCard[]>>(),
}))

vi.mock('@/api/public', () => ({
  publicApi: { trips },
}))

const RouterLink = {
  props: ['to'],
  template: '<a :href="String(to)"><slot /></a>',
}

function trip(overrides: Partial<TripCard>): TripCard {
  return {
    id: 1,
    title: '京都之旅',
    slug: 'kyoto',
    summary: null,
    status: 'COMPLETED',
    startDate: '2026-04-01',
    endDate: '2026-04-05',
    cities: ['京都'],
    journalCount: 3,
    coverUrl: null,
    ...overrides,
  }
}

describe('TripsPage', () => {
  beforeEach(() => trips.mockReset())

  it('加载旅行并按年份筛选', async () => {
    trips.mockResolvedValue([
      trip({ id: 1, title: '京都之旅', slug: 'kyoto' }),
      trip({ id: 2, title: '冰岛环岛', slug: 'iceland', startDate: '2025-10-01', endDate: '2025-10-08' }),
    ])
    const wrapper = mount(TripsPage, { global: { components: { RouterLink } } })
    await flushPromises()

    expect(trips).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('京都之旅')
    expect(wrapper.text()).toContain('冰岛环岛')
    expect(wrapper.get('a[href="/trips/kyoto"]')).toBeTruthy()

    const year2025 = wrapper.findAll('button').find(button => button.text() === '2025')
    await year2025?.trigger('click')
    expect(wrapper.text()).not.toContain('京都之旅')
    expect(wrapper.text()).toContain('冰岛环岛')
  })

  it('没有公开旅行时显示空状态', async () => {
    trips.mockResolvedValue([])
    const wrapper = mount(TripsPage, { global: { components: { RouterLink } } })
    await flushPromises()

    expect(wrapper.get('.empty').text()).toBe('还没有公开的旅行。')
  })
})
