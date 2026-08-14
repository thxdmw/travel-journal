import { get } from './client'
import type { DashboardView } from '@/types/dashboard'

export const dashboardApi = {
  /** 后台首页概览：计数由数据库聚合，最近日记只回 6 条并带上旅行标题。 */
  overview: () => get<DashboardView>('/admin/dashboard'),
}
