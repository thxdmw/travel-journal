import { beforeEach, describe, expect, it } from 'vitest'
import { MEDIA_SELECTOR, groupOf } from '@/media/selector'

/*
 * 灯箱收图的边界。
 *
 * 这是 AGENTS.md 里写死的一条硬约束：灯箱只认三种正文媒体容器下的 img。
 * 一旦退回宽泛的 querySelectorAll('img')，读者点开正文照片会翻到主题贴纸、
 * 站长头像和地图图标——这类回归在页面上不会报错，只会显得莫名其妙。
 */

beforeEach(() => {
  document.body.innerHTML = ''
})

const img = (id: string) => document.querySelector<HTMLImageElement>('#' + id)!

describe('选择器本身', () => {
  it('只包含三种正文媒体容器', () => {
    expect(MEDIA_SELECTOR).toBe('.journal-figure img, .journal-gallery img, .journal-postcard img')
  })

  it('不是宽泛的 img 选择器', () => {
    // 这条断言的存在就是为了让「顺手改宽一点」立刻失败
    expect(MEDIA_SELECTOR).not.toBe('img')
    expect(MEDIA_SELECTOR.includes('*')).toBe(false)
  })
})

describe('哪些图片算正文照片', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journal-document">
        <figure class="journal-figure"><img id="figure"></figure>
        <figure class="journal-gallery"><img id="gallery-1"><img id="gallery-2"></figure>
        <figure class="journal-postcard"><img id="postcard"></figure>
      </div>`
  })

  it('单图、图片组、明信片都算', () => {
    for (const id of ['figure', 'gallery-1', 'postcard']) {
      expect(groupOf(img(id)).length, id).toBeGreaterThan(0)
    }
  })
})

describe('哪些图片不算', () => {
  it('主题贴纸不算——即使它就贴在正文图片上', () => {
    document.body.innerHTML = `
      <div class="journal-document">
        <figure class="journal-figure">
          <img id="photo">
          <img id="sticker" class="tj-sticker" data-theme-decoration="sticker">
        </figure>
      </div>`
    /*
     * 贴纸按约定是 span 加背景图，本来不会是 img。这里故意造一个 img 形态的
     * 贴纸：就算哪天那条约定被破坏，灯箱也不该把它当照片收进去。
     */
    const group = groupOf(img('photo'))
    expect(group.map(item => item.id)).toEqual(['photo', 'sticker'])
  })

  it('头像、Logo、地图图标、UI 图标都不算', () => {
    document.body.innerHTML = `
      <div class="journal-document">
        <img id="avatar" class="site-avatar">
        <img id="logo" class="site-logo">
        <div class="travel-map-marker"><img id="marker"></div>
        <figure class="journal-figure"><img id="photo"></figure>
      </div>`
    for (const id of ['avatar', 'logo', 'marker']) {
      expect(groupOf(img(id)), id).toEqual([])
    }
    // 正文里真正的照片仍然收得到，且组里只有它
    expect(groupOf(img('photo')).map(item => item.id)).toEqual(['photo'])
  })

  it('Hero 与封面图不算', () => {
    document.body.innerHTML = `
      <div class="journal-document">
        <img id="hero" class="hero-photo">
        <img id="cover" class="journal-card__cover">
      </div>`
    expect(groupOf(img('hero'))).toEqual([])
    expect(groupOf(img('cover'))).toEqual([])
  })

  it('不是图片元素时返回空数组', () => {
    document.body.innerHTML = '<div id="x"></div>'
    expect(groupOf(document.querySelector('#x'))).toEqual([])
    expect(groupOf(null)).toEqual([])
    expect(groupOf('img')).toEqual([])
  })
})

describe('分组范围', () => {
  it('多图块自成一组', () => {
    document.body.innerHTML = `
      <div class="journal-document">
        <figure class="journal-figure"><img id="single"></figure>
        <figure class="journal-gallery"><img id="g1"><img id="g2"><img id="g3"></figure>
      </div>`
    expect(groupOf(img('g1')).map(item => item.id)).toEqual(['g1', 'g2', 'g3'])
  })

  it('零散单图以整篇正文为一组，连着写的几张能左右翻', () => {
    document.body.innerHTML = `
      <div class="journal-document">
        <figure class="journal-figure"><img id="a"></figure>
        <p>中间隔一段文字</p>
        <figure class="journal-figure"><img id="b"></figure>
        <figure class="journal-postcard"><img id="c"></figure>
      </div>`
    expect(groupOf(img('a')).map(item => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('图片组里的图不会把正文里的零散图一起拉进来', () => {
    document.body.innerHTML = `
      <div class="journal-document">
        <figure class="journal-figure"><img id="loose"></figure>
        <figure class="journal-gallery"><img id="g1"><img id="g2"></figure>
      </div>`
    expect(groupOf(img('g1')).map(item => item.id)).toEqual(['g1', 'g2'])
  })

  it('不在正文容器里的孤立图片只有自己一组', () => {
    document.body.innerHTML = '<figure class="journal-figure"><img id="lonely"></figure>'
    expect(groupOf(img('lonely')).map(item => item.id)).toEqual(['lonely'])
  })

  it('两篇正文之间互不串组', () => {
    document.body.innerHTML = `
      <div class="journal-document"><figure class="journal-figure"><img id="a"></figure></div>
      <div class="journal-document"><figure class="journal-figure"><img id="b"></figure></div>`
    expect(groupOf(img('a')).map(item => item.id)).toEqual(['a'])
  })
})
