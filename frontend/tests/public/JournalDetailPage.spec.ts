import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JournalDetailPage from '@/public/pages/JournalDetailPage.vue'
import type { JournalDetail } from '@/types/journal'
import type { MarkerHandle, TravelMapInstance } from '@/types/travel-map'

const mocks = vi.hoisted(() => ({
  journal: vi.fn(),
  preview: vi.fn(),
  params: { slug: 'kyoto-morning', token: 'preview-token' },
}))
vi.mock('@/api/public', () => ({ publicApi: { journal: mocks.journal, preview: mocks.preview } }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: mocks.params, query: {} }) }))

const RouterLink = { props: ['to'], template: '<a :href="String(to)"><slot /></a>' }
const MapProviderSwitch = { emits: ['change'], template: '<button class="provider-switch" @click="$emit(\'change\')">切换</button>' }

function detail(overrides: Partial<JournalDetail> = {}): JournalDetail {
  return {
    journal: {
      id: 1, title: '京都的第三个清晨', slug: 'kyoto-morning', excerpt: '清晨散步', occurredOn: '2026-04-03',
      tripTitle: '关西春日', tripSlug: 'kansai', cityName: '京都', coverUrl: null,
    },
    contentJson: {
      schemaVersion: 1,
      blocks: [
        { id: 'paragraph', type: 'paragraph', version: 1, title: '', data: { text: '沿着鸭川慢慢走。' }, settings: {} },
        { id: 'image', type: 'image', version: 1, title: '', data: { previewUrl: '/test-photo.jpg', caption: '鸭川清晨' }, settings: {} },
      ],
    },
    media: [], previousSlug: 'previous', nextSlug: 'next', theme: null,
    route: [{ order: 1, time: '07:30', title: '鸭川', note: '散步', latitude: 35.02, longitude: 135.77, coordinateSystem: 'WGS84', photos: [], source: 'moment' }],
    ...overrides,
  }
}

function markerHandle(): MarkerHandle {
  return { setActive: vi.fn(), openPopup: vi.fn(), getPosition: () => [35.02, 135.77], remove: vi.fn() }
}

function mapInstance(): TravelMapInstance {
  return {
    provider: 'OSM', raw: null, destroy: vi.fn(), setCenter: vi.fn(), panTo: vi.fn(), invalidateSize: vi.fn(),
    getZoom: () => 4, zoomBy: vi.fn(), setStyle: vi.fn(), fitBounds: vi.fn(), addMarker: vi.fn(() => markerHandle()),
    setRoute: vi.fn(), removeRoute: vi.fn(), onClick: vi.fn(), onInteractionStart: vi.fn(),
  }
}

function mountPage(options: { preview?: boolean, createMap?: ReturnType<typeof vi.fn> } = {}) {
  const createMap = options.createMap ?? vi.fn().mockResolvedValue(mapInstance())
  const destroyMap = vi.fn()
  const setScopedTheme = vi.fn()
  const clearScopedTheme = vi.fn()
  const wrapper = mount(JournalDetailPage, {
    props: {
      preview: options.preview ?? false,
      mapProviderSwitch: markRaw(MapProviderSwitch),
      createMap,
      destroyMap,
      setScopedTheme,
      clearScopedTheme,
    },
    global: { stubs: { RouterLink } },
    attachTo: document.body,
  })
  return { wrapper, createMap, destroyMap, setScopedTheme, clearScopedTheme }
}

describe('JournalDetailPage', () => {
  beforeEach(() => {
    mocks.journal.mockReset()
    mocks.preview.mockReset()
    localStorage.clear()
    document.documentElement.style.removeProperty('--reading-scale')
  })

  it('从 Blocks JSON 渲染正文、元信息和实际路线', async () => {
    const value = detail()
    mocks.journal.mockResolvedValue(value)
    const { wrapper, createMap, setScopedTheme } = mountPage()
    await flushPromises()

    expect(mocks.journal).toHaveBeenCalledWith('kyoto-morning')
    expect(wrapper.get('.article-head h1').text()).toBe('京都的第三个清晨')
    expect(wrapper.get('.journal-document').text()).toContain('沿着鸭川慢慢走')
    expect(wrapper.get('.day-route h2').text()).toBe('这一天走过的路')
    expect(wrapper.get('.day-route-list strong').text()).toBe('鸭川')
    expect(createMap).toHaveBeenCalledWith(expect.any(HTMLElement), [], {})
    expect(setScopedTheme).toHaveBeenCalledWith(value.theme)
    wrapper.unmount()
  })

  it('预览令牌使用预览接口，失败时显示过期状态', async () => {
    mocks.preview.mockRejectedValue(new Error('expired'))
    const { wrapper } = mountPage({ preview: true })
    await flushPromises()
    expect(mocks.preview).toHaveBeenCalledWith('preview-token')
    expect(wrapper.get('.loading').text()).toBe('预览链接无效或已过期。')
    wrapper.unmount()
  })

  it('灯箱只响应正文媒体选择器并支持键盘关闭', async () => {
    mocks.journal.mockResolvedValue(detail({ route: [] }))
    const { wrapper } = mountPage()
    await flushPromises()
    const decoration = document.createElement('img')
    decoration.className = 'theme-decoration'
    wrapper.get('.journal-document').element.appendChild(decoration)
    decoration.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('.photo-lightbox')).toBeNull()

    await wrapper.get('.journal-figure img').trigger('click')
    expect(document.body.querySelector('.photo-lightbox')).not.toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('.photo-lightbox')).toBeNull()
    wrapper.unmount()
  })

  it('保存阅读字号并在离页时销毁地图、媒体和主题作用域', async () => {
    mocks.journal.mockResolvedValue(detail())
    const map = mapInstance()
    const createMap = vi.fn().mockResolvedValue(map)
    const { wrapper, destroyMap, clearScopedTheme } = mountPage({ createMap })
    await flushPromises()
    await wrapper.get('[aria-label="增大正文字号"]').trigger('click')
    expect(localStorage.getItem('travel-journal.reading-scale')).toBe('2')
    expect(document.documentElement.style.getPropertyValue('--reading-scale')).toBe('1.14')
    wrapper.unmount()
    expect(map.destroy).toHaveBeenCalledOnce()
    expect(destroyMap).toHaveBeenCalledWith(expect.any(HTMLElement))
    expect(clearScopedTheme).toHaveBeenCalledOnce()
  })
})
