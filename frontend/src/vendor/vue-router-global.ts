/* 页面 SFC 与旧公开端共用 HTML 先加载的 Vue Router 全局实例。 */
export type RouteQueryValue = string | null | (string | null)[]

export interface PublicRouteLocation {
  query: Record<string, RouteQueryValue>
}

export interface PublicRouter {
  push(location: { path: string; query?: Record<string, string> }): Promise<unknown>
}

declare global {
  interface Window {
    VueRouter: {
      useRoute(): unknown
      useRouter(): unknown
    }
  }
}

export function useRoute(): PublicRouteLocation {
  return window.VueRouter.useRoute() as PublicRouteLocation
}

export function useRouter(): PublicRouter {
  return window.VueRouter.useRouter() as PublicRouter
}
