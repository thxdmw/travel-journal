/*
 * 就地更新预览，而不是把它拆了重建。
 *
 * 配置弹窗里改的多数是版式——占用宽度、圆角、边框、比例。这些只改外层的 class，图片地址
 * 一个字都不会变。可是 innerHTML 一赋值，整棵预览连同里面的 <img> 全被销毁重造：新元素
 * 得重走一遍加载和解码，在那之前画出来的是一个空框。于是每切一次设置，预览就白一下。
 *
 * 这里先看新旧结构是不是长得一样，一样就只把属性和文字改掉，元素本身原地不动——<img>
 * 没被碰过，也就没有重新解码这回事，一帧空白都不会有。
 *
 * 结构真变了（图片组换成轮播、图片数量变了）就整棵换掉，和以前一样。那种时候本来也没有
 * 可复用的东西。
 */

/**
 * 把 {@link html} 更新到 {@link host} 里，能复用就复用。
 *
 * <p>要么全部就地更新，要么整棵替换：先验证结构再动手，中途不会留下改了一半的 DOM。</p>
 */
export function patchPreview(host: HTMLElement, html: string): void {
  const next = host.ownerDocument.createElement('div')
  next.innerHTML = html
  if (sameShape(host, next)) applyInto(host, next)
  else host.replaceChildren(...Array.from(next.childNodes))
}

/**
 * 两棵树是不是同一个形状——同样的标签、同样的嵌套、同样的节点数。
 *
 * <p>属性和文字不算形状的一部分，它们正是待会儿要改的东西。</p>
 */
function sameShape(current: Node, next: Node): boolean {
  if (current.nodeType !== next.nodeType) return false
  // 文字节点改内容就行，长什么样无所谓
  if (current.nodeType === Node.TEXT_NODE) return true
  if (!(current instanceof Element) && !(current instanceof HTMLElement)) {
    // 注释之类的节点这里不打算处理，交给整棵替换更省心
    return current.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? shapeOfChildren(current, next) : false
  }
  if (current instanceof Element && next instanceof Element && current.tagName !== next.tagName) return false
  return shapeOfChildren(current, next)
}

function shapeOfChildren(current: Node, next: Node): boolean {
  const a = current.childNodes
  const b = next.childNodes
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (!left || !right || !sameShape(left, right)) return false
  }
  return true
}

/** 形状已经确认一致，这里只把差异写过去。 */
function applyInto(current: Node, next: Node): void {
  if (current.nodeType === Node.TEXT_NODE) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue
    return
  }
  if (current instanceof Element && next instanceof Element) {
    /*
     * 值一样就不写。
     *
     * src 和 srcset 尤其要紧：哪怕写回去的是同一个字符串，赋值本身也会让浏览器重新走一遍
     * 取图流程，前面省下的功夫全白费。
     */
    for (const attr of Array.from(next.attributes)) {
      if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value)
    }
    for (const attr of Array.from(current.attributes)) {
      if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name)
    }
  }
  const a = current.childNodes
  const b = next.childNodes
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (left && right) applyInto(left, right)
  }
}
