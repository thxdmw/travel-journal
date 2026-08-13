import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@/api/client'
import '@/legacy/travel-api-global'

/*
 * 兼容层的回归测试。
 *
 * 迁移期最危险的不是类型错，而是「某个 key 悄悄改了名字或换了 HTTP 方法」——
 * static/js 下的旧脚本没有类型检查，这种改动要等到用户点下保存才暴露。
 * 下面两组用例分别锁住形状和实际打出去的请求。
 */

/**
 * 原 js/common/api.js 暴露的全部 key，按原文件顺序抄录。
 * 这一份是迁移的验收基线：只允许在对应旧脚本迁走后删条目，不允许随手改名。
 */
const LEGACY_SHAPE = {
  root: ['http', 'ensureCsrf', 'public', 'auth', 'admin'],
  public: [
    'home', 'trips', 'trip', 'journals', 'tags', 'years',
    'yearReview', 'journal', 'preview', 'cities', 'profile',
  ],
  auth: [
    'login', 'logout', 'session', 'me', 'changePassword',
    'uploadAvatar', 'updateDisplayName', 'changeTheme',
  ],
  admin: [
    'trips', 'trip', 'createTrip', 'updateTrip', 'dashboard', 'uploadTripCover',
    'clearTripCover', 'stops', 'createStop', 'updateStop', 'deleteStop',
    'mapStatus', 'searchLocations', 'reverseLocation',
    'itinerary', 'createItinerary', 'updateItinerary', 'deleteItinerary', 'completeItinerary',
    'budget', 'createCategory', 'updateCategory', 'deleteCategory',
    'expenses', 'createExpense', 'updateExpense', 'deleteExpense',
    'journals', 'journal', 'createJournal', 'updateJournal', 'createJournalDraft',
    'saveJournalDraft', 'discardEmptyJournal', 'deleteJournal', 'journalMediaCount',
    'publishJournal', 'unpublishJournal', 'media', 'uploadMedia',
    'sortMediaByCaptureTime', 'suggestCity', 'createPreviewLink', 'revokePreviewLink',
    'journalTags', 'renameTag', 'mergeTag', 'deleteTag', 'purgeUnusedTags',
    'setCover', 'reorderMedia', 'updateMediaCaption', 'deleteMedia',
    'templates', 'template', 'createTemplate', 'updateTemplate', 'deleteTemplate',
    'duplicateTemplate', 'generateTemplate',
    'moments', 'moment', 'unsortedMoments', 'createMoment', 'updateMoment', 'deleteMoment',
    'addMomentPhoto', 'removeMomentPhoto', 'momentRoute', 'momentAiStatus', 'composeMoments',
    'themes', 'siteThemeState', 'createTheme', 'updateTheme', 'deleteTheme',
    'duplicateTheme', 'resetTheme', 'backupUrl', 'uploadThemeHero',
  ],
} as const

describe('window.TravelApi 契约', () => {
  it('顶层与各分组的 key 集合和旧 api.js 完全一致', () => {
    const api = window.TravelApi
    expect(Object.keys(api).sort()).toEqual([...LEGACY_SHAPE.root].sort())
    expect(Object.keys(api.public).sort()).toEqual([...LEGACY_SHAPE.public].sort())
    expect(Object.keys(api.auth).sort()).toEqual([...LEGACY_SHAPE.auth].sort())
    expect(Object.keys(api.admin).sort()).toEqual([...LEGACY_SHAPE.admin].sort())
  })

  it('除 http 外全部是函数', () => {
    const api = window.TravelApi
    const groups = [api.public, api.auth, api.admin] as Record<string, unknown>[]
    for (const group of groups) {
      for (const [name, value] of Object.entries(group)) {
        expect(typeof value, name).toBe('function')
      }
    }
    expect(typeof api.ensureCsrf).toBe('function')
  })
})

describe('高风险调用打出去的请求', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  /** 记下最后一次请求的方法和地址，用来比对 URL 拼装和 HTTP 动词。 */
  function capture() {
    const seen: { method?: string; url?: string; params?: unknown } = {}
    mock.onAny().reply(config => {
      seen.method = config.method
      seen.url = config.url
      seen.params = config.params
      return [200, { data: null }]
    })
    return seen
  }

  it('草稿自动保存走 PATCH /admin/journals/{id}/draft', async () => {
    const seen = capture()
    await window.TravelApi.admin.saveJournalDraft(12, { title: '第一天' })
    expect(seen.method).toBe('patch')
    expect(seen.url).toBe('/admin/journals/12/draft')
  })

  it('设封面走 PATCH，不是 PUT——写错动词后端会直接 405', async () => {
    const seen = capture()
    await window.TravelApi.admin.setCover(12, 88)
    expect(seen.method).toBe('patch')
    expect(seen.url).toBe('/admin/journals/12/cover/88')
  })

  it('图片排序走 PUT /admin/journals/{id}/media/reorder', async () => {
    const seen = capture()
    await window.TravelApi.admin.reorderMedia(12, [3, 1, 2])
    expect(seen.method).toBe('put')
    expect(seen.url).toBe('/admin/journals/12/media/reorder')
  })

  it('放弃空草稿走 DELETE /admin/journals/{id}/discard-empty', async () => {
    const seen = capture()
    await window.TravelApi.admin.discardEmptyJournal(12)
    expect(seen.method).toBe('delete')
    expect(seen.url).toBe('/admin/journals/12/discard-empty')
  })

  it('公开端日记详情对 slug 做转义', async () => {
    const seen = capture()
    await window.TravelApi.public.journal('京都/岚山')
    expect(seen.url).toBe('/public/journals/' + encodeURIComponent('京都/岚山'))
  })

  it('公开端资料带时间戳，避开 Service Worker 的缓存', async () => {
    const seen = capture()
    await window.TravelApi.public.profile()
    expect((seen.params as { v?: number }).v).toBeTypeOf('number')
  })

  it('分页参数按 page/pageSize/keyword/tag 传出', async () => {
    const seen = capture()
    await window.TravelApi.public.journals(2, 24, '京都', '美食')
    expect(seen.params).toEqual({ page: 2, pageSize: 24, keyword: '京都', tag: '美食' })
  })

  it('主题改为跟随季节时 themeKey 可以为空', async () => {
    const seen = capture()
    await window.TravelApi.auth.changeTheme(null, 'AUTO')
    expect(seen.method).toBe('put')
    expect(seen.url).toBe('/admin/profile/theme')
  })

  it('备份地址是同步返回的字符串，不发请求', () => {
    expect(window.TravelApi.admin.backupUrl(false)).toBe('/api/admin/backup?includePhotos=false')
    expect(window.TravelApi.admin.backupUrl()).toBe('/api/admin/backup?includePhotos=true')
  })
})
