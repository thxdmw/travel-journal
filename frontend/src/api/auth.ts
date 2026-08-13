import { get, post, put, upload } from './client'
import type {
  AdminInfo,
  ChangePasswordRequest,
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
}
