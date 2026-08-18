import { del, get, patch, post, put, upload } from './client'
import type {
  AdminInfo,
  ChangePasswordRequest,
  LoginDevice,
  LoginRequest,
  ProfileUpdate,
} from '@/types/auth'
import type { ThemeMode } from '@/types/theme'

export const authApi = {
  login: (body: LoginRequest) => post<AdminInfo>('/admin/auth/login', body),

  logout: () => post<void>('/admin/auth/logout'),

  /*
   * 路由守卫每次切页都会调它，超时压到 5 秒：网络不好时宁可当作未登录跳登录页，
   * 也不要让整个后台卡在白屏上等 30 秒。
   */
  session: () => get<AdminInfo | null>('/admin/auth/session', { timeout: 5_000 }),

  me: () => get<AdminInfo>('/admin/auth/me'),

  changePassword: (body: ChangePasswordRequest) => post<void>('/admin/auth/change-password', body),

  uploadAvatar: (form: FormData) => upload<ProfileUpdate>('/admin/profile/avatar', form),

  updateDisplayName: (body: { displayName: string }) =>
    put<ProfileUpdate>('/admin/profile/display-name', body),

  /** mode 传 AUTO 表示跟随季节，此时 themeKey 可以为空；不传就是锁定这一套。 */
  changeTheme: (themeKey: string | null, mode?: ThemeMode) =>
    put<ProfileUpdate>('/admin/profile/theme', { themeKey, mode }),

  /*
   * 已登录设备。
   *
   * 会话存在数据库里，所以这份列表就是设备清单本身——踢掉一台，它下一次请求就是未登录，
   * 不存在「记录删了但人还在线」的中间状态。
   */
  devices: () => get<LoginDevice[]>('/admin/profile/devices'),

  revokeDevice: (sessionId: string) =>
    del<void>('/admin/profile/devices/' + encodeURIComponent(sessionId)),

  revokeOtherDevices: () => del<{ removed: number }>('/admin/profile/devices'),

  /** 给设备起名字。传空串表示改回按 User-Agent 自动识别。 */
  renameDevice: (sessionId: string, displayName: string) =>
    patch<{ deviceName: string }>('/admin/profile/devices/' + encodeURIComponent(sessionId), { displayName }),
}
