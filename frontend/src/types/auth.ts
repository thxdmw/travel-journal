import type { IsoDateTimeString } from './common'
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

/** 一台已登录的设备，对应 `LoginDeviceService.LoginDevice`。 */
export interface LoginDevice {
  /** 会话标识，用来远程登出这一台。 */
  sessionId: string
  /** 设备标识，比会话活得久；自定义名字挂在它上面。 */
  deviceId: string | null
  deviceName: string
  /** 名字是作者自己起的（true）还是按 User-Agent 认出来的（false）。 */
  named: boolean
  ip: string | null
  loggedInAt: IsoDateTimeString
  lastActiveAt: IsoDateTimeString
  /** 是不是当前正在用的这一台。 */
  current: boolean
}
