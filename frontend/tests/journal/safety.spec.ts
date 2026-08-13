import { describe, expect, it } from 'vitest'
import { esc, lines, safeLink } from '@/journal/escape'
import { render, renderBlock } from '@/journal/render'
import { createBlock } from '@/journal/document'
import type { JournalBlock } from '@/types/journal-block'

/*
 * 渲染层的安全边界。
 *
 * 对拍用例保证「和旧实现输出一致」，这一组保证「一致地安全」——万一以后有人
 * 顺手把某个字段的 esc() 去掉，对拍不一定抓得住（如果同时改了夹具），这里会。
 */

const PAYLOAD = '<img src=x onerror=alert(1)>'

function block(type: string, data: Record<string, unknown>, settings: Record<string, unknown> = {}): JournalBlock {
  return { id: 'b1', type, version: 1, title: '', data, settings }
}

describe('esc', () => {
  it('转义五个 HTML 敏感字符', () => {
    expect(esc(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })

  it('先转义 & 再转义其余，不会二次转义', () => {
    expect(esc('&lt;')).toBe('&amp;lt;')
  })

  it('null 与 undefined 当空串，不输出字面的 null', () => {
    expect(esc(null)).toBe('')
    expect(esc(undefined)).toBe('')
  })
})

describe('lines', () => {
  it('换行变 <br>，其余照常转义', () => {
    expect(lines('a\n<b>')).toBe('a<br>&lt;b&gt;')
  })

  it('注入的 <br> 本身仍被转义', () => {
    expect(lines('<br>')).toBe('&lt;br&gt;')
  })
})

describe('safeLink', () => {
  it('放行 http 与 https', () => {
    expect(safeLink('https://a.test/x?y=1')).toBe('https://a.test/x?y=1')
    expect(safeLink('HTTP://a.test')).toBe('HTTP://a.test')
  })

  it('其余协议一律退成 #', () => {
    const blocked = [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '//evil.test',
      '',
      null,
    ]
    for (const url of blocked) expect(safeLink(url), String(url)).toBe('#')
  })
})

describe('注入负载在每个文本字段都被转义', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['heading', { text: PAYLOAD }],
    ['paragraph', { text: PAYLOAD }],
    ['quote', { text: PAYLOAD, source: PAYLOAD }],
    ['callout', { tone: PAYLOAD, icon: PAYLOAD, text: PAYLOAD }],
    ['facts', { items: [{ label: PAYLOAD, value: PAYLOAD }] }],
    ['pros-cons', { pros: [PAYLOAD], cons: [PAYLOAD] }],
    ['table', { headers: [PAYLOAD], rows: [[PAYLOAD]] }],
    ['link-card', { url: PAYLOAD, title: PAYLOAD, description: PAYLOAD }],
    ['rating', { score: 1, max: 5, comment: PAYLOAD }],
    ['checklist', { items: [{ text: PAYLOAD, checked: true }] }],
    ['stats', { items: [{ value: PAYLOAD, label: PAYLOAD }] }],
    ['companions', { items: [{ name: PAYLOAD, role: PAYLOAD, note: PAYLOAD }] }],
    ['trip-info', { city: PAYLOAD, weather: PAYLOAD }],
    ['route', { items: [PAYLOAD] }],
    ['itinerary', { items: [{ time: PAYLOAD, title: PAYLOAD, address: PAYLOAD }] }],
    ['timeline', { items: [{ time: PAYLOAD, title: PAYLOAD, description: PAYLOAD }] }],
    ['expense-summary', { currency: PAYLOAD, total: PAYLOAD, categories: [{ name: PAYLOAD, amount: PAYLOAD }] }],
    ['location-card', { name: PAYLOAD, address: PAYLOAD, hours: PAYLOAD, cost: PAYLOAD, impression: PAYLOAD }],
    ['food', { dish: PAYLOAD, restaurant: PAYLOAD, price: PAYLOAD, note: PAYLOAD }],
    ['stay', { name: PAYLOAD, room: PAYLOAD, nights: PAYLOAD, note: PAYLOAD }],
    ['transport', { mode: PAYLOAD, from: PAYLOAD, to: PAYLOAD, number: PAYLOAD, duration: PAYLOAD, note: PAYLOAD }],
    ['weather', { condition: PAYLOAD, temperature: PAYLOAD, feelsLike: PAYLOAD, wind: PAYLOAD, note: PAYLOAD }],
    ['day-opener', { city: PAYLOAD, dayLabel: PAYLOAD, weather: PAYLOAD, route: [PAYLOAD], metrics: [{ value: PAYLOAD, label: PAYLOAD }] }],
    ['chapter', { time: PAYLOAD, title: PAYLOAD, note: PAYLOAD }],
    ['day-summary', { items: [{ icon: PAYLOAD, label: PAYLOAD, value: PAYLOAD }] }],
    ['postcard', { location: PAYLOAD, date: PAYLOAD, message: PAYLOAD, signature: PAYLOAD }],
  ]

  /*
   * 断言必须解析成 DOM 之后再做。转义后的负载作为纯文本仍然含有 "onerror=" 这
   * 几个字符——字符串比对会一直通过，什么也证明不了。真正要证明的是：浏览器
   * 解析这段 HTML 时没有多出任何元素或事件属性。
   */
  function parse(html: string): HTMLDivElement {
    const container = document.createElement('div')
    container.innerHTML = html
    return container
  }

  for (const [type, data] of cases) {
    it(type, () => {
      const container = parse(renderBlock(block(type, data), []))
      expect(container.querySelector('img[onerror]')).toBeNull()
      expect(container.querySelector('script')).toBeNull()
      // 负载应当原样以文本出现，说明它被当成内容而不是标记
      expect(container.textContent).toContain(PAYLOAD)
    })
  }

  it('block 标题', () => {
    const withTitle = { ...block('paragraph', { text: '' }), title: PAYLOAD }
    const container = parse(renderBlock(withTitle, []))
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain(PAYLOAD)
  })

  it('block id 出现在属性位置也要转义，不能挣脱引号', () => {
    const evil = { ...block('paragraph', { text: '' }), id: '" onmouseover="alert(1)' }
    const section = parse(renderBlock(evil, [])).querySelector('section')
    expect(section?.hasAttribute('onmouseover')).toBe(false)
    // 整个负载仍然完整地留在那个属性里
    expect(section?.getAttribute('data-block-id')).toBe('" onmouseover="alert(1)')
  })

  it('图片设置里的类名不能带出事件属性', () => {
    const html = renderBlock(block('image', { mediaId: 1 }, { size: '" onload="alert(1)' }), [])
    const figure = parse(html).querySelector('figure')
    expect(figure?.hasAttribute('onload')).toBe(false)
  })
})

describe('link-card 的链接落在 href 上时已被白名单挡住', () => {
  it('javascript: 变成 #，但原文仍显示在文本里', () => {
    const html = renderBlock(block('link-card', { url: 'javascript:alert(1)', title: '点我' }), [])
    expect(html).toContain('href="#"')
    // 地址本身作为可见文本保留，方便作者发现自己填错了
    expect(html).toContain('javascript:alert(1)')
    expect(html).not.toContain('href="javascript:')
  })
})

describe('渲染的健壮性', () => {
  it('列表里混进 null 不会让整篇日记渲染失败', () => {
    /*
     * 与迁移前的差异，有意为之：旧实现直接读 item.label，遇到 null 会抛
     * TypeError，整篇日记打不开。content_json 被手工改坏过一次就永远打不开，
     * 渲染层健壮一点值得。正常数据的输出完全不变，由对拍用例保证。
     */
    expect(() => renderBlock(block('facts', { items: [null, { label: 'a', value: 'b' }] }), [])).not.toThrow()
    expect(() => renderBlock(block('checklist', { items: [undefined] }), [])).not.toThrow()
    expect(() => renderBlock(block('itinerary', { items: [42] }), [])).not.toThrow()
  })

  it('该是数组的字段给了别的类型时按空处理', () => {
    expect(renderBlock(block('route', { items: 'x' }), [])).toContain('<ol class="journal-route"></ol>')
  })

  it('整篇渲染遇到坏块不中断其余块', () => {
    const document = {
      schemaVersion: 1,
      blocks: [block('facts', { items: [null] }), block('paragraph', { text: '还在' })],
    }
    expect(render(document, [])).toContain('还在')
  })
})

describe('createBlock 的默认值不共享', () => {
  it('两个同类型 Block 改各自的数组互不影响', () => {
    const first = createBlock('checklist')
    const second = createBlock('checklist')
    ;(first.data.items as unknown[]).push({ text: 'x' })
    expect((second.data.items as unknown[]).length).toBe(1)
  })

  it('initial 里的 data 会盖在默认值之上，未提供的字段保留默认', () => {
    const created = createBlock('stay', { data: { name: '民宿' } })
    expect(created.data.name).toBe('民宿')
    expect(created.data.nights).toBe(1)
  })

  it('没给 data 时整个 initial 当作 data', () => {
    const created = createBlock('paragraph', { text: '直接给' })
    expect(created.data.text).toBe('直接给')
  })
})
