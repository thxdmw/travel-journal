import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import type { ApiError } from '@/types/common'

/**
 * 全站唯一的 HTTP 客户端。
 *
 * 这一层只管请求和协议：解 `ApiResponse` 外壳、把失败统一成带 status/network 的
 * Error、认证失效时把后台踢回登录页。它不弹提示、不碰 UI——`ElMessage` 之类
 * 一律属于页面层，放进这里就没法在测试和非后台场景里复用了。
 */
export const http: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  timeout: 30_000,
})

/** 请求失败时 Spring 返回的 `ApiResponse`，只有 message 对前端有用。 */
interface ErrorPayload {
  message?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 剥掉 `ApiResponse` 外壳。
 *
 * 判定用 `hasOwnProperty('data')` 而不是 `payload.data != null`：接口成功但
 * data 为 null 是合法的（比如 logout），用真值判断会把整个 ApiResponse 原样漏给调用方。
 */
function unwrap(response: AxiosResponse<unknown>): unknown {
  const payload = response.data
  if (isRecord(payload) && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload.data
  }
  return payload
}

function toApiError(error: unknown): ApiError {
  const response = axios.isAxiosError(error) ? error.response : undefined
  const payload = response?.data as ErrorPayload | undefined
  const wrapped = new Error(payload?.message || '网络请求失败') as ApiError
  wrapped.status = response?.status ?? 0
  // 没有 response 说明请求根本没走通（断网、超时、被拦截），和「服务端拒绝」要分开处理
  wrapped.network = !response
  return wrapped
}

/** 401 时把后台踢回登录页。公开端不受影响，登录页本身也不重复跳。 */
function redirectToLoginIfNeeded(status: number): void {
  if (status !== 401) return
  if (!location.pathname.startsWith('/admin')) return
  if (location.hash.includes('/login')) return
  location.hash = '#/login'
}

http.interceptors.response.use(
  /*
   * axios 的类型要求 fulfilled handler 返回 AxiosResponse，运行时却允许返回任意值——
   * 「拦截器剥掉外壳」这个模式本身就建立在后者上。断言只出现在这一处，调用方经由
   * 下面的 get/post 薄封装拿到的仍然是各自的精确类型。
   */
  response => unwrap(response) as AxiosResponse,
  (error: unknown) => {
    const wrapped = toApiError(error)
    redirectToLoginIfNeeded(wrapped.status)
    return Promise.reject(wrapped)
  },
)

/*
 * 下面这组薄封装的唯一目的，是把「拦截器已经把响应换成了业务数据」这件事
 * 表达进类型里。axios 的类型仍然认为 get<T> 返回 AxiosResponse<T>，直接用会让
 * 每个调用点都写一次 `.data`，而运行时根本没有那层。
 */

type Params = Record<string, unknown>

export function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return http.get(url, config) as unknown as Promise<T>
}

export function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return http.post(url, body, config) as unknown as Promise<T>
}

export function put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return http.put(url, body, config) as unknown as Promise<T>
}

export function patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return http.patch(url, body, config) as unknown as Promise<T>
}

export function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return http.delete(url, config) as unknown as Promise<T>
}

export function withParams(params: Params): AxiosRequestConfig {
  return { params }
}

/** multipart 上传。表单和进度回调之外的配置由调用方补。 */
export function upload<T>(
  url: string,
  form: FormData,
  config?: AxiosRequestConfig,
): Promise<T> {
  return post<T>(url, form, {
    ...config,
    headers: { 'Content-Type': 'multipart/form-data', ...config?.headers },
  })
}

/** 拿一次 CSRF token 并写进 cookie。写操作之前调，其余请求由 axios 自动带上。 */
export function ensureCsrf(): Promise<Record<string, string>> {
  return get<Record<string, string>>('/public/csrf')
}

/** URL 片段里的用户输入必须转义，slug 和标签名都可能含 `/` 或中文。 */
export const seg = encodeURIComponent
