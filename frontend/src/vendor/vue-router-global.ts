/* 页面 SFC 与 HTML 先加载的 Vue Router 全局实例共用同一个路由运行时。 */
import type { App, Component } from 'vue'

export type RouteQueryValue = string | null | (string | null)[]

export interface PublicRouteLocation {
  params: Record<string, string | string[] | undefined>
  query: Record<string, RouteQueryValue>
  fullPath: string
  meta: Record<string, unknown>
}

export interface PublicRouter {
  push(location: string | { path: string; query?: Record<string, string> }): Promise<unknown>
  replace(location: string | { path: string; query?: Record<string, string> }): Promise<unknown>
}

export interface PublicRouteRecord {
  path: string
  component: Component
  props?: Record<string, unknown>
  meta?: Record<string, unknown>
}

export interface PublicRouterInstance {
  install(app: App): void
  currentRoute: { value: { fullPath: string } }
  beforeEach(guard: (to: PublicRouteLocation) => unknown | Promise<unknown>): void
  replace(location: string): Promise<unknown>
}

declare global {
  interface Window {
    VueRouter: {
      createRouter(options: {
        history: unknown
        routes: PublicRouteRecord[]
        scrollBehavior?: () => { top: number }
      }): PublicRouterInstance
      createWebHashHistory(): unknown
      useRoute(): unknown
      useRouter(): unknown
    }
  }
}

export const { createRouter, createWebHashHistory } = window.VueRouter

export function useRoute(): PublicRouteLocation {
  return window.VueRouter.useRoute() as PublicRouteLocation
}

export function useRouter(): PublicRouter {
  return window.VueRouter.useRouter() as PublicRouter
}
