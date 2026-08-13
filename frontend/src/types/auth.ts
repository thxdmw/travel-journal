import type { ThemeMode, ThemeView } from './theme'

/** 登录态里的管理员信息，对应后端 `AuthController.AdminInfo`。 */
export interface AdminInfo {
  id: number
  username: string
  displayName: string
  avatarUrl: string | null
  themeKey: string | null
}

/** 改头像、显示名或主题后回传的最新资料，对应 `AdminProfileController.ProfileUpdate`。 */
export interface ProfileUpdate {
  displayName: string
  avatarUrl: string | null
  themeKey: string | null
  themeMode: ThemeMode
}

export interface LoginRequest {
  username: string
  password: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

/** 公开端的站长资料，对应 `PublicProfileController.PublicProfile`。 */
export interface PublicProfile {
  displayName: string
  avatarUrl: string | null
  themeKey: string | null
  theme: ThemeView | null
}
