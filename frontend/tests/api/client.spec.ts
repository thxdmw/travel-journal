import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http, get, post, ensureCsrf, seg } from '@/api/client'
import type { ApiError } from '@/types/common'

let mock: MockAdapter

beforeEach(() => {
  mock = new MockAdapter(http)
})

afterEach(() => {
  mock.restore()
})

describe('响应拦截器', () => {
  it('剥掉 ApiResponse 外壳，只把 data 交给调用方', async () => {
    mock.onGet('/public/home').reply(200, {
      code: 'OK',
      message: 'success',
      data: { tripCount: 3 },
      requestId: 'r-1',
    })

    await expect(get('/public/home')).resolves.toEqual({ tripCount: 3 })
  })

  it('data 为 null 时给出 null，而不是把整个外壳漏出去', async () => {
    // logout 这类接口返回 ApiResponse.ok()，data 就是 null。用真值判断会漏壳。
    mock.onPost('/admin/auth/logout').reply(200, {
      code: 'OK',
      message: 'success',
      data: null,
      requestId: 'r-2',
    })

    await expect(post('/admin/auth/logout')).resolves.toBeNull()
  })

  it('响应体没有 data 字段时原样返回', async () => {
    mock.onGet('/raw').reply(200, { plain: true })

    await expect(get('/raw')).resolves.toEqual({ plain: true })
  })
})

describe('错误包装', () => {
  it('优先用服务端给的 message', async () => {
    mock.onGet('/admin/journals/9').reply(404, { code: 'NOT_FOUND', message: '日记不存在' })

    const error = (await get('/admin/journals/9').catch(e => e)) as ApiError
    expect(error.message).toBe('日记不存在')
    expect(error.status).toBe(404)
    expect(error.network).toBe(false)
  })

  it('服务端没给 message 时用兜底文案', async () => {
    mock.onGet('/boom').reply(500, {})

    const error = (await get('/boom').catch(e => e)) as ApiError
    expect(error.message).toBe('网络请求失败')
    expect(error.status).toBe(500)
  })

  it('压根没连上时标记 network，status 为 0', async () => {
    mock.onGet('/offline').networkError()

    const error = (await get('/offline').catch(e => e)) as ApiError
    expect(error.network).toBe(true)
    expect(error.status).toBe(0)
  })
})

describe('401 处理', () => {
  const setLocation = (pathname: string, hash: string) => {
    // jsdom 的 location 不能直接赋值 pathname，整体换掉即可
    window.history.replaceState({}, '', pathname + hash)
  }

  it('后台页面收到 401 时跳登录页', async () => {
    setLocation('/admin/index.html', '#/journals/1')
    mock.onGet('/admin/journals/1').reply(401, {})

    await get('/admin/journals/1').catch(() => undefined)
    expect(location.hash).toBe('#/login')
  })

  it('已经在登录页时不重复跳，避免把用户正在输的表单刷掉', async () => {
    setLocation('/admin/index.html', '#/login?from=x')
    mock.onPost('/admin/auth/login').reply(401, {})

    await post('/admin/auth/login').catch(() => undefined)
    expect(location.hash).toBe('#/login?from=x')
  })

  it('公开端收到 401 不跳转', async () => {
    setLocation('/journals/kyoto', '')
    mock.onGet('/public/journals/kyoto').reply(401, {})

    await get('/public/journals/kyoto').catch(() => undefined)
    expect(location.hash).toBe('')
  })
})

describe('请求配置', () => {
  it('baseURL、CSRF 与凭据设置与后端 Spring Security 约定一致', () => {
    expect(http.defaults.baseURL).toBe('/api')
    expect(http.defaults.withCredentials).toBe(true)
    expect(http.defaults.xsrfCookieName).toBe('XSRF-TOKEN')
    expect(http.defaults.xsrfHeaderName).toBe('X-XSRF-TOKEN')
  })

  it('ensureCsrf 打到 /public/csrf', async () => {
    const handler = vi.fn().mockReturnValue([200, { data: { token: 'abc' } }])
    mock.onGet('/public/csrf').reply(handler)

    await expect(ensureCsrf()).resolves.toEqual({ token: 'abc' })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('路径片段里的 slug 被转义，斜杠和中文不会破坏 URL', () => {
    expect(seg('a/b')).toBe('a%2Fb')
    expect(seg('京都')).toBe('%E4%BA%AC%E9%83%BD')
  })
})
