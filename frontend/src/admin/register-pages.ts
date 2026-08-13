import { createDashboardPage } from '@/admin/factories/dashboard'
import { createLoginPage } from '@/admin/factories/login'

const adminRoot = document.querySelector<HTMLElement>('#admin-app')
if (!adminRoot) throw new Error('后台缺少 #admin-app 根节点')

const pagesKey = Symbol.for('travel-journal.admin-pages')
Object.defineProperty(adminRoot, pagesKey, {
  configurable: false,
  enumerable: false,
  value: Object.freeze({ createDashboardPage, createLoginPage }),
})
