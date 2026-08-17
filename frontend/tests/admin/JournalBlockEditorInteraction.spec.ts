import { mount } from '@vue/test-utils'
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
  ElDialog: { template: '<div><slot /></div>' },
  ElInput: { props: ['modelValue'], template: '<input :value="modelValue">' },
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

function mountEditor(document: JournalDocument) {
  return mount(JournalBlockEditor, {
    props: { modelValue: document, media: [], uploads: [], notify: vi.fn() },
    global: { stubs },
  })
}

/** 模拟触摸设备/鼠标设备。组件在 setup 时读一次，所以要在挂载之前设好。 */
function setPointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: coarse && query.includes('coarse'),
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
