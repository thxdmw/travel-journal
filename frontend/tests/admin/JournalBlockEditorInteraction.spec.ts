import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import JournalBlockEditor from '@/admin/JournalBlockEditor.vue'
import { createBlock, emptyDocument } from '@/journal/document'
import type { JournalDocument } from '@/types/journal-block'

/*
 * 「点开写日记就能直接打字」是这个编辑器的前提。
 *
 * 那个「今天发生了什么」的输入框以前只在文档完全为空时才渲染，于是先传一张照片再想
 * 写字的人会发现输入框没了，必须先去点「＋正文」。判断依据应该是「有没有能直接落笔的
 * 组件」，而不是「文档是不是空的」。
 */

const stubs = {
  /*
   * 透传 attrs：弹窗是不是全屏那一版，靠的就是绑上去的 class。
   * footer 插槽也要渲染——确认/取消在并排布局之外正是放在那儿的。
   */
  ElDialog: { inheritAttrs: false, template: '<div v-bind="$attrs"><slot /><slot name="footer" /></div>' },
  // 双向绑定要真的通：改标题是最省事的「动一下设置」路径
  ElInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
  },
  ElButton: { template: '<button><slot /></button>' },
  ElSelect: { template: '<div><slot /></div>' },
  ElOption: { template: '<div />' },
  ElCheckbox: { template: '<div />' },
  ElCheckboxGroup: { template: '<div><slot /></div>' },
  ElRadioGroup: { template: '<div><slot /></div>' },
  ElRadioButton: { template: '<div><slot /></div>' },
  ElTabs: { template: '<div><slot /></div>' },
  ElTabPane: { template: '<div><slot /></div>' },
  ElEmpty: { template: '<div />' },
  ElImage: { template: '<div />' },
}

function mountEditor(document: JournalDocument, extra: Record<string, unknown> = {}) {
  return mount(JournalBlockEditor, {
    props: { modelValue: document, media: [], uploads: [], notify: vi.fn() },
    global: { stubs },
    ...extra,
  })
}

/** 模拟触摸设备/鼠标设备。组件在 setup 时读一次，所以要在挂载之前设好。 */
function setPointer(coarse: boolean) {
  setEnvironment({ coarse })
}

/**
 * 一次把指针类型和屏幕宽度都交代清楚。
 *
 * 组件在 setup 时各读一次：`(pointer: coarse)` 决定单击还是双击开配置，`(max-width:780px)`
 * 决定预览是并排的纸还是一个开整篇预览的按钮。
 */
function setEnvironment({ coarse = false, narrow = false }: { coarse?: boolean, narrow?: boolean } = {}) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('coarse') ? coarse : (query.includes('max-width') ? narrow : false),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia
}

/** 「直接开始写」的那个输入框。 */
const ghost = '.block-inline--ghost textarea'

function documentWith(...types: string[]): JournalDocument {
  const doc = emptyDocument()
  types.forEach(type => doc.blocks.push(createBlock(type)))
  return doc
}

describe('JournalBlockEditor 向上提交', () => {
  it('内容没变时不往上报，避免被当成一次编辑', async () => {
    /*
     * commit 每次都产出一个全新的文档对象，而父组件那边 form 是被深度监听的——
     * 「长得一样但引用不同」照样算一次编辑。编辑器卸载时又会无条件 flush 一次（为的是
     * 收住最后那几个还没提交的击键），于是「点开写日记，一个字没写就离开」会在库里留下
     * 一篇空草稿。这条断言把这条路堵死。
     */
    const wrapper = mountEditor(emptyDocument())
    const editor = wrapper.vm as unknown as { flushInline(): void }

    editor.flushInline()
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('内容真的变了还是要报上去', async () => {
    const wrapper = mountEditor(emptyDocument())
    const editor = wrapper.vm as unknown as { insertQuick(type: string): void, flushInline(): void }

    editor.insertQuick('paragraph')
    editor.flushInline()
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
  })
})

describe('JournalBlockEditor 起笔输入框', () => {
  it('空文档时可以直接打字', () => {
    expect(mountEditor(emptyDocument()).find(ghost).exists()).toBe(true)
  })

  it('只传了图片时仍然留着输入框，不用先去点「＋正文」', () => {
    const wrapper = mountEditor(documentWith('image'))

    expect(wrapper.find(ghost).exists()).toBe(true)
  })

  it('已经有正文组件时不再多给一个空框', () => {
    expect(mountEditor(documentWith('paragraph')).find(ghost).exists()).toBe(false)
    // 小标题、引用、提示卡同样是能直接落笔的组件
    expect(mountEditor(documentWith('image', 'quote')).find(ghost).exists()).toBe(false)
  })
})

/*
 * 手机上单击就打开配置。
 *
 * 双击在移动端不只是「点两次」：浏览器要先判断这是不是 double-tap-to-zoom，期间还可能
 * 真的动一下视口缩放，那一下就是作者看到的闪烁。配合 CSS 的 touch-action:manipulation，
 * 双击手势从根上不再参与。
 */
describe('图片区块的打开方式', () => {
  it('手机上单击区块就打开配置', async () => {
    setPointer(true)
    const wrapper = mountEditor(documentWith('image'))

    await wrapper.get('.block-editor-card').trigger('click')

    expect(wrapper.find('.block-config-dialog, .block-config-layout').exists()).toBe(true)
  })

  it('桌面上单击不打开，双击才打开', async () => {
    setPointer(false)
    const wrapper = mountEditor(documentWith('image'))

    await wrapper.get('.block-editor-card').trigger('click')
    expect(wrapper.find('.block-config-layout').exists()).toBe(false)

    await wrapper.get('.block-editor-card').trigger('dblclick')
    expect(wrapper.find('.block-config-layout').exists()).toBe(true)
  })

  it('点区块里的按钮不会顺带打开配置', async () => {
    setPointer(true)
    const wrapper = mountEditor(documentWith('image', 'divider'))

    // 上移/下移/删除这些按钮在卡片内部，点它们不该弹出配置
    await wrapper.get('.block-editor-card header button').trigger('click')

    expect(wrapper.find('.block-config-layout').exists()).toBe(false)
  })
})

/*
 * 手机上的图片预览。
 *
 * 并排的那块预览纸在窄屏只剩 32vh，内容还是假文字线模拟的正文栏——图片放进文章里前后
 * 长什么样，它其实答不上来。窄屏改成一个按钮，点开就是整篇的真实渲染，和读者看到的
 * 是同一套。宽屏不动，那里并排预览是够用的。
 */
describe('窄屏的图片预览', () => {
  /** attach：组件真的挂进文档。`ensureVisible` 只对 isConnected 的元素动手，不挂就测不到。 */
  async function openConfig(narrow: boolean, attach = false) {
    setEnvironment({ coarse: true, narrow })
    const wrapper = mountEditor(documentWith('image'), attach ? { attachTo: document.body } : {})
    await wrapper.get('.block-editor-card').trigger('click')
    return wrapper
  }

  it('窄屏不并排放预览纸，给一个开整篇预览的按钮', async () => {
    const wrapper = await openConfig(true)

    expect(wrapper.find('.block-effect-entry').exists()).toBe(true)
    /*
     * 预览纸必须是「不渲染」而不是「看不见」：留在 DOM 里只是 display:none 的话，
     * keepFitted 仍会在一个高度为 0 的容器上量来量去。
     */
    expect(wrapper.find('.block-live-preview').exists()).toBe(false)
  })

  it('宽屏仍然是并排的预览区，没有那个按钮', async () => {
    const wrapper = await openConfig(false)

    expect(wrapper.find('.block-live-preview').exists()).toBe(true)
    expect(wrapper.find('.block-effect-entry').exists()).toBe(false)
  })

  /*
   * 确认/取消两端都得有。
   *
   * 全屏那一版把弹窗自带的 footer 藏了，按钮改由设置栏底部那一条承担；而那一条只在并排
   * 布局里渲染。要是全屏的类跟着「是不是图片块」走，手机上就会两头落空——footer 被藏，
   * 侧边按钮又没渲染，一个都不剩。
   */
  it('窄屏的确认和取消按钮不会消失', async () => {
    const wrapper = await openConfig(true)

    expect(wrapper.find('.block-config-dialog--full').exists()).toBe(false)
    expect(wrapper.find('.block-dialog-actions').text()).toContain('确认')
    expect(wrapper.find('.block-dialog-actions').text()).toContain('取消')
  })

  it('宽屏的按钮在设置栏底部，且不在滚动区里', async () => {
    const wrapper = await openConfig(false)

    const actions = wrapper.get('.block-config-actions')
    expect(actions.text()).toContain('确认')
    // 在表单外面：搁在里面的话，内容短的 Tab 滚不起来，按钮会跟着内容飘
    expect(wrapper.find('.block-config-form .block-config-actions').exists()).toBe(false)
  })

  it('图片配置在宽屏铺满整屏', async () => {
    /*
     * 它要同时装下真实正文宽度的预览和设置面板。以前是居中弹窗，里层写死的高度比弹窗
     * 扣掉页眉页脚之后还高，多出来的一截被裁掉——右边设置面板底部那几项既看不见也滚不到。
     */
    const wrapper = await openConfig(false)

    expect(wrapper.find('.block-config-dialog--full').exists()).toBe(true)
  })

  /*
   * 改一个设置，就把正在编辑的那一块带回视野中间。
   *
   * 改设置的人正盯着这一块看它变成什么样，可改完之后它未必还在原处——换个宽度、换个比例，
   * 上下的高度全变了。哪怕刚刚手动滚开过，也该带回来。
   */
  it('每改一个设置都重新定位到正在编辑的那一块', async () => {
    const scrollIntoView = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      const wrapper = await openConfig(false)
      await nextTick()
      await nextTick()
      scrollIntoView.mockClear()

      // 动一下设置（区块标题是最短的那条路径，一样会让预览重算）
      await wrapper.get('.block-config-form input').setValue('鸭川的清晨')
      await nextTick()
      await nextTick()

      expect(scrollIntoView).toHaveBeenCalled()
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('宽屏并排的是整篇真实文章，不是模拟纸', async () => {
    const wrapper = await openConfig(false)
    await nextTick()
    await nextTick()

    const preview = wrapper.get('.block-live-preview .article-preview-body')
    // 以前这里是假文字线加孤零零一块，看不出前后文
    expect(wrapper.find('.preview-text-line').exists()).toBe(false)
    expect(preview.findAll('[data-block-id]').length).toBeGreaterThan(0)
    expect(preview.find('.is-editing').exists()).toBe(true)
  })

  /*
   * 配置面板里点一下选项不该把页面滚走。
   *
   * 表单上的 focusin 以前对任何拿到焦点的元素都做一次 scrollIntoView({block:'center'})，
   * 本意是「输入框被软键盘盖住时滚进来」。可按钮、单选、Tab 同样会拿到焦点，于是点一下
   * 版式里的选项，页面就居中跳一下，作者刚看的位置没了。
   */
  it('点配置项不会把页面滚走，点输入框才会', async () => {
    vi.useFakeTimers()
    const scrollIntoView = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    let wrapper: ReturnType<typeof mountEditor> | null = null
    try {
      wrapper = await openConfig(true, true)

      // focusin 会冒泡，在目标元素上触发就等于真实的「点一下它」
      await wrapper.get('.block-config-form button').trigger('focusin')
      vi.advanceTimersByTime(300)
      expect(scrollIntoView).not.toHaveBeenCalled()

      // 文本输入会唤起键盘，它仍旧要滚进可视区
      await wrapper.get('.block-config-form input').trigger('focusin')
      vi.advanceTimersByTime(300)
      expect(scrollIntoView).toHaveBeenCalled()
    } finally {
      wrapper?.unmount()
      Element.prototype.scrollIntoView = original
      vi.useRealTimers()
    }
  })

  it('点开之后渲染的是整篇，正在编辑的那一块带着标记', async () => {
    const wrapper = await openConfig(true)

    await wrapper.get('.block-effect-entry').trigger('click')
    await nextTick()
    await nextTick()

    const preview = wrapper.get('.article-preview-body')
    // 整篇都在，不是只有当前这一块
    expect(preview.findAll('[data-block-id]').length).toBe(1)
    expect(preview.find('.is-editing').exists()).toBe(true)
  })
})
