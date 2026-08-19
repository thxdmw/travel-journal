import { describe, expect, it, vi } from 'vitest'
import { patchPreview } from '@/admin/patch-preview'

/*
 * 改配置不该把预览拆了重建。
 *
 * 配置弹窗里改的多数是版式——占用宽度、圆角、比例，图片地址一个字都不变。可 innerHTML
 * 一赋值，里面的 <img> 也跟着销毁重造，新元素在解码完成之前画出来的是个空框，于是每切
 * 一次设置预览就白一下。这里锁住的就是「同样的图片元素要活下来」。
 */

function host(html: string) {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

const FIGURE = (size: string) =>
  `<figure class="journal-figure journal-figure--${size}">`
  + '<img src="/api/media/9/display" srcset="/api/media/9/thumbnail 480w" alt="旅行照片">'
  + '<figcaption>清晨的鸭川</figcaption></figure>'

describe('预览的就地更新', () => {
  it('只改了版式时图片元素原地不动', () => {
    const el = host(FIGURE('medium'))
    const image = el.querySelector('img')

    patchPreview(el, FIGURE('large'))

    // 同一个元素对象——没被销毁重造，也就没有重新解码那一帧空白
    expect(el.querySelector('img')).toBe(image)
    expect(el.querySelector('figure')?.className).toBe('journal-figure journal-figure--large')
  })

  it('地址没变就不碰 src，免得浏览器白跑一趟取图', () => {
    const el = host(FIGURE('medium'))
    const image = el.querySelector('img')
    if (!image) throw new Error('测试用例本身有问题：没有渲染出图片')
    const setAttribute = vi.spyOn(image, 'setAttribute')

    patchPreview(el, FIGURE('large'))

    // 写回同一个字符串也会让浏览器重新走取图流程，所以值相同时一个字都不该写
    expect(setAttribute.mock.calls.map(call => call[0])).not.toContain('src')
    expect(setAttribute.mock.calls.map(call => call[0])).not.toContain('srcset')
  })

  it('文字改了就跟着改', () => {
    const el = host(FIGURE('medium'))

    patchPreview(el, FIGURE('medium').replace('清晨的鸭川', '傍晚的鸭川'))

    expect(el.querySelector('figcaption')?.textContent).toBe('傍晚的鸭川')
  })

  it('新配置去掉的属性要清干净', () => {
    const el = host('<figure class="journal-figure" data-tone="warm"></figure>')

    patchPreview(el, '<figure class="journal-figure"></figure>')

    expect(el.querySelector('figure')?.hasAttribute('data-tone')).toBe(false)
  })

  /*
   * 结构真变了就别硬凑。图片组换版式、加减图片都会改变节点数量，那种时候本来也没有可复用
   * 的东西，整棵换掉最省心——但必须是「要么全就地改、要么全换」，不能留下改了一半的 DOM。
   */
  it('图片数量变了就整棵替换', () => {
    const el = host('<figure class="journal-gallery"><img src="/a"></figure>')

    patchPreview(el, '<figure class="journal-gallery"><img src="/a"><img src="/b"></figure>')

    expect(el.querySelectorAll('img')).toHaveLength(2)
  })

  it('换成另一种区块也整棵替换', () => {
    const el = host(FIGURE('medium'))

    patchPreview(el, '<hr>')

    expect(el.innerHTML).toBe('<hr>')
  })

  it('清空', () => {
    const el = host(FIGURE('medium'))

    patchPreview(el, '')

    expect(el.innerHTML).toBe('')
  })
})
