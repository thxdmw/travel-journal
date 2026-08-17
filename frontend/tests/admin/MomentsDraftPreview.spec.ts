import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MomentsPage from '@/admin/pages/MomentsPage.vue'

/*
 * 随手记待发送照片的预览。
 *
 * 原来这里是 `computed(() => draft.files.map(f => URL.createObjectURL(f)))`：每次重算都
 * 生成一批新的 Object URL，模板又用 url 当 :key，于是 Vue 反复销毁重建 <img>，把手机那张
 * 几 MB 的原图一遍遍解码——点一次「拍照确认」页面能闪好几下，而且旧 URL 从不 revoke。
 */

const mocks = vi.hoisted(() => ({
  createLocalPreview: vi.fn(),
  releaseLocalPreview: vi.fn(),
  options: vi.fn(),
  list: vi.fn(),
  aiStatus: vi.fn(),
  pendingMoments: vi.fn(),
}))
vi.mock('@/media/local-preview', () => ({
  createLocalPreview: mocks.createLocalPreview,
  releaseLocalPreview: mocks.releaseLocalPreview,
}))
vi.mock('@/api/moment', () => ({ momentApi: { list: mocks.list, aiStatus: mocks.aiStatus, create: vi.fn() } }))
vi.mock('@/api/trip', () => ({ tripApi: { options: mocks.options } }))
vi.mock('@/draft/moments', () => ({
  pendingMoments: mocks.pendingMoments,
  queueMoment: vi.fn().mockResolvedValue(true),
  dropPendingMoment: vi.fn(),
  updatePendingMoment: vi.fn(),
}))
vi.mock('@/route/day-route', () => ({ render: vi.fn() }))
vi.mock('@/route/simple-map', () => ({ simpleMap: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const passthrough = (tag: string) => ({ template: `<${tag}><slot /></${tag}>` })
const stubs = {
  ElInput: { props: ['modelValue'], template: '<input :value="modelValue">' },
  ElButton: { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  ElSelect: passthrough('div'),
  ElOption: passthrough('div'),
  ElEmpty: passthrough('div'),
}

function mountPage() {
  return mount(MomentsPage, {
    props: {
      session: { user: {}, offline: false },
      message: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn(), fail: vi.fn(),
      confirm: vi.fn().mockResolvedValue(undefined),
      composeConfirm: vi.fn().mockResolvedValue('confirm'),
    },
    global: { stubs },
  })
}

/** 走真实的 file input change，和作者点「拍照」之后的路径一致。 */
async function pickPhotos(wrapper: ReturnType<typeof mount>, count: number) {
  const files = Array.from({ length: count }, (_, index) =>
    new File([new Uint8Array([1, 2, 3])], `shot-${index}.jpg`, { type: 'image/jpeg' }))
  const field = wrapper.findAll('input[type=file]')[0]
  Object.defineProperty(field!.element, 'files', { value: files, configurable: true })
  await field!.trigger('change')
  await flushPromises()
}

describe('随手记待发送照片预览', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    let seq = 0
    mocks.createLocalPreview.mockImplementation(() => Promise.resolve(`blob:preview-${seq++}`))
    mocks.options.mockResolvedValue([{ id: 1, title: '京都', status: 'ONGOING' }])
    mocks.list.mockResolvedValue([])
    mocks.aiStatus.mockResolvedValue({ available: false })
    mocks.pendingMoments.mockResolvedValue([])
  })

  it('每张照片只生成一次缩略预览', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await pickPhotos(wrapper, 2)

    // 关键：两张照片两次调用。以前每次重渲染都会重新 createObjectURL
    expect(mocks.createLocalPreview).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('.moment-shots img')).toHaveLength(2)
  })

  it('输入文字不会让预览重新生成', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await pickPhotos(wrapper, 1)
    const before = wrapper.get('.moment-shots img').attributes('src')

    await wrapper.get('.moment-composer input').setValue('看到一只猫')
    await flushPromises()

    expect(mocks.createLocalPreview).toHaveBeenCalledTimes(1)
    // src 稳定，<img> 就不会被销毁重建，也就不会重新解码
    expect(wrapper.get('.moment-shots img').attributes('src')).toBe(before)
  })

  it('删掉一张就释放它的预览 URL', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await pickPhotos(wrapper, 2)

    await wrapper.findAll('.moment-shots figure button')[0]?.trigger('click')
    await flushPromises()

    expect(mocks.releaseLocalPreview).toHaveBeenCalledWith('blob:preview-0')
    expect(wrapper.findAll('.moment-shots img')).toHaveLength(1)
  })

  it('卸载时释放全部预览 URL', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await pickPhotos(wrapper, 2)

    wrapper.unmount()

    expect(mocks.releaseLocalPreview).toHaveBeenCalledWith('blob:preview-0')
    expect(mocks.releaseLocalPreview).toHaveBeenCalledWith('blob:preview-1')
  })
})
