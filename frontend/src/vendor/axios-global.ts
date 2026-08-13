import type { AxiosStatic } from 'axios'

declare global {
  interface Window {
    axios: AxiosStatic
  }
}

if (!window.axios) throw new Error('页面缺少 vendor/axios，无法初始化 API 客户端')

export default window.axios
