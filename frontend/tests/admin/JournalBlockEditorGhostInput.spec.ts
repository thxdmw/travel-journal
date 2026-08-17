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
