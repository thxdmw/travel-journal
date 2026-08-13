import { createDashboardPage } from '@/admin/factories/dashboard'
import { createLoginPage } from '@/admin/factories/login'
import { createProfilePage } from '@/admin/factories/profile'
import { createTagManagerPage } from '@/admin/factories/tag-manager'
import { createTemplateManagerPage } from '@/admin/factories/template-manager'
import { createTripsPage } from '@/admin/factories/trips'

const adminRoot = document.querySelector<HTMLElement>('#admin-app')
if (!adminRoot) throw new Error('后台缺少 #admin-app 根节点')

const pagesKey = Symbol.for('travel-journal.admin-pages')
Object.defineProperty(adminRoot, pagesKey, {
  configurable: false,
  enumerable: false,
  value: Object.freeze({ createDashboardPage, createLoginPage, createProfilePage, createTagManagerPage, createTemplateManagerPage, createTripsPage }),
})
