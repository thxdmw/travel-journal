import { del, get, post, put, upload, withParams } from './client'
import type { JsonObject } from '@/types/common'
import type { MediaView } from '@/types/media'
import type { ThemeMode, ThemeView } from '@/types/theme'

/** 全站主题当前是跟随季节还是固定，以及此刻实际生效的是哪一套。 */
export interface SiteThemeState {
  mode: ThemeMode
  /** 当前季节的中文名。FIXED 时也给出来，方便预告切回自动会变成什么。 */
  season: string
  seasonThemeKey: string
  theme: ThemeView
}

export interface ThemeRequest {
  themeKey?: string
  name?: string
  description?: string
  baseThemeKey?: string
  /**
   * 用户改动。builtin 主题只写进 override_json，官方默认不会被覆盖；
   * 还原默认要清空它，不要在前端重建一份官方 JSON。
   */
  definitionJson?: JsonObject
  enabled?: boolean
}

export const themeApi = {
  list: (enabledOnly = false) => get<ThemeView[]>('/admin/themes', withParams({ enabledOnly })),

  siteState: () => get<SiteThemeState>('/admin/themes/site-state'),

  create: (body: ThemeRequest) => post<ThemeView>('/admin/themes', body),

  update: (id: number, body: ThemeRequest) => put<ThemeView>('/admin/themes/' + id, body),

  remove: (id: number) => del<void>('/admin/themes/' + id),

  duplicate: (id: number) => post<ThemeView>('/admin/themes/' + id + '/duplicate'),

  /** 还原系统主题的官方默认：清空用户覆盖，effective 回到官方 definitionJson。 */
  reset: (id: number) => post<ThemeView>('/admin/themes/' + id + '/reset'),

  /** 上传主题首页封面图。不绑定具体主题，返回的 id 由前端填进 definitionJson.hero.mediaId。 */
  uploadHero: (form: FormData) => upload<MediaView>('/admin/themes/hero', form),
}
