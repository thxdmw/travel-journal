import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JournalEditorPage from '@/admin/pages/JournalEditorPage.vue'
import * as localDraft from '@/draft/drafts'
import { pendingPhotos } from '@/draft/photos'
import { POINTER_KEY } from '@/draft/schema'

/*
 * 「点一次写日记就多一条空草稿」的回归测试。
 *
 * 草稿仓库用的是真实 fake-indexeddb，因为本用例真正要证明的是离线那份快照能不能
 * 原样搬到服务端草稿的 id 下——换成替身就只测到了自己写的假实现。
 */

const mocks = vi.hoisted(() => ({
  createDraft: vi.fn(),
  saveDraft: vi.fn(),
  getJournal: vi.fn(),
  mediaList: vi.fn(),
  mediaUpload: vi.fn(),
  tripOptions: vi.fn(),
  tripGet: vi.fn(),
  templateList: vi.fn(),
  themeList: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  route: null as unknown as { params: Record<string, string>, query: Record<string, string> },
}))

vi.mock('@/api/journal', () => ({
  journalApi: {
    createDraft: mocks.createDraft,
    saveDraft: mocks.saveDraft,
    get: mocks.getJournal,
    publish: vi.fn(),
    unpublish: vi.fn(),
    update: vi.fn(),
    createPreviewLink: vi.fn(),
  },
}))
vi.mock('@/api/media', () => ({ mediaApi: { list: mocks.mediaList, upload: mocks.mediaUpload, reorder: vi.fn(), setCover: vi.fn(), updateCaption: vi.fn(), remove: vi.fn(() => Promise.resolve({ revision: 0 })), sortByCaptureTime: vi.fn() } }))
vi.mock('@/api/trip', () => ({
  tripApi: { options: mocks.tripOptions, get: mocks.tripGet, stops: vi.fn().mockResolvedValue([]) },
}))
vi.mock('@/api/template', () => ({ templateApi: { list: mocks.templateList, generate: vi.fn() } }))
vi.mock('@/api/theme', () => ({ themeApi: { list: mocks.themeList } }))
vi.mock('@/api/budget', () => ({ budgetApi: { expenses: vi.fn().mockResolvedValue([]), summary: vi.fn().mockResolvedValue(null) } }))
vi.mock('@/api/itinerary', () => ({ itineraryApi: { list: vi.fn().mockResolvedValue([]) } }))
// route 必须是响应式的：组件靠 watch 路由参数来识别「从已有日记切到新建页」。
vi.mock('vue-router', async () => {
  const { reactive } = await vi.importActual<typeof import('vue')>('vue')
  mocks.route = reactive({ params: { id: 'new' } as Record<string, string>, query: {} as Record<string, string> })
  return { useRoute: () => mocks.route, useRouter: () => ({ replace: mocks.replace, push: mocks.push }) }
})

const ElInput = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
}
const passthrough = (tag: string) => ({ template: `<${tag}><slot /></${tag}>` })
const stubs = {
  ElInput,
  ElForm: passthrough('form'),
  ElFormItem: passthrough('div'),
  ElButton: { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  ElSelect: passthrough('div'),
  ElOption: passthrough('div'),
  ElDatePicker: passthrough('div'),
  ElTag: passthrough('span'),
  ElCheckbox: passthrough('div'),
  ElImage: passthrough('div'),
  ElEmpty: passthrough('div'),
  ElDialog: passthrough('div'),
  JournalBlockEditor: {
    template: '<div class="block-editor-stub" />',
    methods: {
      flushInline() { /* 替身不攒击键 */ },
      insertPending() { /* 占位块由真实编辑器负责渲染 */ },
      resolvePending() { /* 同上 */ },
      insertMedia() { /* 同上 */ },
      openCatalog() { /* 同上 */ },
      insertQuick() { /* 同上 */ },
    },
  },
  TemplateFieldInput: passthrough('div'),
}

function draftEntry(id: number) {
  return {
    id, createdAt: '2026-08-14T00:00:00Z', updatedAt: '2026-08-14T00:00:00Z', tripId: null, tripStopId: null,
    title: '', slug: `journal-${id}`, excerpt: null, contentJson: { schemaVersion: 1, blocks: [] }, status: 'DRAFT',
    occurredOn: '2026-08-14', coverMediaId: null, publishedAt: null, themeKey: null, templateId: null,
    templateVersion: null, tags: [],
  }
}

const deps = () => ({ message: vi.fn(), info: vi.fn(), warning: vi.fn(), fail: vi.fn(), confirm: vi.fn().mockRejectedValue('cancel') })

function mountEditor(props = deps()) {
  return { props, wrapper: mount(JournalEditorPage, { props, global: { stubs } }) }
}

/** 标题输入框是「日记信息」里的第一个 input。 */
async function typeTitle(wrapper: ReturnType<typeof mount>, text: string) {
  await wrapper.get('.editor-meta input').setValue(text)
  await flushPromises()
}

/** 走图片管理里那个真实的 file input，和作者选照片的路径一致。 */
async function pickPhoto(wrapper: ReturnType<typeof mount>, name = 'a.jpg') {
  const file = new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' })
  const field = wrapper.get('.upload-box input[type=file]')
  Object.defineProperty(field.element, 'files', { value: [file], configurable: true })
  await field.trigger('change')
  await flushPromises()
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

// 编辑器挂着 600ms 本机快照和 45s 兜底保存两个定时器；不逐个卸载，上一个用例的
// 组件会在下一个用例跑到一半时把自己的草稿指针写进 localStorage。
enableAutoUnmount(afterEach)

describe('JournalEditorPage 草稿延迟创建', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setOnline(true)
    mocks.route.params = { id: 'new' }
    mocks.route.query = {}
    mocks.createDraft.mockResolvedValue(draftEntry(77))
    mocks.saveDraft.mockResolvedValue(draftEntry(77))
    mocks.getJournal.mockResolvedValue(draftEntry(77))
    mocks.mediaList.mockResolvedValue([])
    mocks.mediaUpload.mockResolvedValue({ id: 5, relationId: 9, caption: null, thumbnailUrl: '/t.jpg', displayUrl: '/d.jpg' })
    mocks.tripOptions.mockResolvedValue([])
    mocks.tripGet.mockResolvedValue({ id: 12, title: '京都四日', status: 'ONGOING' })
    mocks.templateList.mockResolvedValue([])
    mocks.themeList.mockResolvedValue([])
    window.URL.createObjectURL = vi.fn(() => 'blob:preview')
    window.URL.revokeObjectURL = vi.fn()
  })
  // 卸载时的「最后一次本机快照」是异步的，不等它落完就清 localStorage，
  // 上一个用例的草稿指针会漏进下一个用例。
  afterEach(async () => {
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 0))
    await flushPromises()
    setOnline(true)
  })

  it('打开新建页面不创建草稿', async () => {
    mountEditor()
    await flushPromises()
    expect(mocks.createDraft).not.toHaveBeenCalled()
  })

  it('未编辑就离开不留下任何草稿', async () => {
    const { wrapper } = mountEditor()
    await flushPromises()
    wrapper.unmount()
    await flushPromises()
    expect(mocks.createDraft).not.toHaveBeenCalled()
    expect(mocks.saveDraft).not.toHaveBeenCalled()
    expect(await localDraft.get(-1)).toBeNull()
    expect(localStorage.getItem(POINTER_KEY)).toBeNull()
  })

  it('首次有效编辑只创建一篇草稿', async () => {
    const { wrapper } = mountEditor()
    await flushPromises()
    await typeTitle(wrapper, '京')
    await typeTitle(wrapper, '京都')
    await typeTitle(wrapper, '京都的雨')
    expect(mocks.createDraft).toHaveBeenCalledTimes(1)
    // 转正要先把本机快照搬过去，IndexedDB 事务不在 microtask 队列里
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith({ path: '/journals/77', query: {} }))
  })

  it('输入与上传同时触发时仍然只创建一篇', async () => {
    let resolveCreate: (value: unknown) => void = () => undefined
    mocks.createDraft.mockReturnValue(new Promise(resolve => { resolveCreate = resolve }))
    const { wrapper } = mountEditor()
    await flushPromises()
    void typeTitle(wrapper, '京都')
    // 上传与输入在同一帧到达：文件选择走的是隐藏 input 的 change 事件
    const file = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' })
    const input = wrapper.get('.upload-box input[type=file]').element as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await wrapper.get('.upload-box input[type=file]').trigger('change')
    resolveCreate(draftEntry(77))
    await flushPromises()
    expect(mocks.createDraft).toHaveBeenCalledTimes(1)
  })

  it('创建草稿的空白响应不会覆盖已经写好的标题', async () => {
    const { wrapper } = mountEditor()
    await flushPromises()
    await typeTitle(wrapper, '京都的雨')
    await flushPromises()
    expect((wrapper.get('.editor-meta input').element as HTMLInputElement).value).toBe('京都的雨')
  })

  it('从旅行工作台进入时，首次编辑创建的草稿带上 tripId', async () => {
    mocks.route.query = { tripId: '12', from: 'journals' }
    const { wrapper } = mountEditor()
    await flushPromises()
    await typeTitle(wrapper, '奈良的鹿')
    expect(mocks.createDraft).toHaveBeenCalledWith(expect.objectContaining({ tripId: 12 }))
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith({ path: '/journals/77', query: { from: 'journals' } }))
  })

  it('从已有日记切到写日记时清空上一篇，并且不创建草稿', async () => {
    mocks.route.params = { id: '5' }
    mocks.getJournal.mockResolvedValue({ ...draftEntry(5), title: '上一篇' })
    const { wrapper } = mountEditor()
    await flushPromises()
    expect((wrapper.get('.editor-meta input').element as HTMLInputElement).value).toBe('上一篇')

    mocks.route.params = { id: 'new' }
    await flushPromises()
    await flushPromises()
    expect((wrapper.get('.editor-meta input').element as HTMLInputElement).value).toBe('')
    expect(mocks.createDraft).not.toHaveBeenCalled()
  })

  it('保存带上手里那份的版本号', async () => {
    mocks.route.params = { id: '5' }
    mocks.getJournal.mockResolvedValue({ ...draftEntry(5), revision: 7 })
    const { wrapper } = mountEditor()
    await flushPromises()
    await typeTitle(wrapper, '改一个字')
    const page = wrapper.vm as unknown as { save(silent?: boolean): Promise<boolean> }
    await page.save(true)
    expect(mocks.saveDraft).toHaveBeenCalledWith(5, expect.objectContaining({ expectedRevision: 7 }))
  })

  it('版本冲突时保留本机内容，不被服务器版本覆盖', async () => {
    // 用一篇独立的日记：上一个用例对 5 的本机快照清理是异步的，会跨用例把这里的快照删掉
    mocks.route.params = { id: '6' }
    mocks.getJournal.mockResolvedValue({ ...draftEntry(6), title: '服务器上的旧标题', revision: 7 })
    const conflict = Object.assign(new Error('这篇日记在别处已经有更新的版本'), { status: 409 })
    mocks.saveDraft.mockRejectedValue(conflict)
    // confirm 默认 reject，等于作者选了「保留本机内容」
    const { props, wrapper } = mountEditor()
    await flushPromises()
    await typeTitle(wrapper, '本机刚写的')

    const page = wrapper.vm as unknown as { save(silent?: boolean): Promise<boolean> }
    await page.save(true)
    await flushPromises()

    // 作者被明确告知服务器上有更新的版本，而不是内容被悄悄换掉
    expect(props.confirm).toHaveBeenCalledWith(expect.stringContaining('已经被改过'))
    // 本机那一份原样还在，没有被服务器版本盖掉
    expect((wrapper.get('.editor-meta input').element as HTMLInputElement).value).toBe('本机刚写的')
    // 并且已经把这一篇记成了「本机有未同步内容」
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem(POINTER_KEY) ?? '{}').journalId).toBe(6))
  })

  it('离线首次编辑只写本机，联网后转正一次并把正文和待传照片迁到真实 id', async () => {
    setOnline(false)
    const { wrapper } = mountEditor()
    await flushPromises()
    await typeTitle(wrapper, '地铁里写的')
    await pickPhoto(wrapper)

    await vi.waitFor(() => expect(localStorage.getItem(POINTER_KEY)).toBeTruthy())
    const localId = Number(JSON.parse(localStorage.getItem(POINTER_KEY) ?? '{}').journalId)
    expect(localId).toBeLessThan(0)
    expect(mocks.createDraft).not.toHaveBeenCalled()
    expect(mocks.mediaUpload).not.toHaveBeenCalled()
    // 断网时照片挂在本机临时 id 下，正文快照也已经落盘
    await vi.waitFor(async () => expect(await pendingPhotos(localId)).toHaveLength(1))
    await vi.waitFor(async () => expect(await localDraft.get(localId)).toBeTruthy())

    setOnline(true)
    window.dispatchEvent(new Event('online'))
    await flushPromises()

    expect(mocks.createDraft).toHaveBeenCalledTimes(1)
    // 照片改挂到真实日记后只上传一次，本机临时 id 下不再残留任何东西
    await vi.waitFor(() => expect(mocks.mediaUpload).toHaveBeenCalledTimes(1))
    expect(mocks.mediaUpload.mock.calls[0]?.[0]).toBe(77)
    await vi.waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledWith(77, expect.objectContaining({ title: '地铁里写的' })))
    await vi.waitFor(async () => expect(await localDraft.get(localId)).toBeNull())
    expect(await pendingPhotos(localId)).toEqual([])
  })
})
