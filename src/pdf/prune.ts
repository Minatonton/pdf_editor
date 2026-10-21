import { PDFArray, PDFDict, PDFName, PDFNull, PDFRef, PDFStream, type PDFDocument, type PDFObject, type PDFPage } from 'pdf-lib'

const PARENT = PDFName.of('Parent')
/** 親のページの木から受け継ぐ属性。ページそのものに書かれていなくても、そのページの表示に使われる */
const INHERITABLE = ['Resources', 'MediaBox', 'CropBox', 'Rotate'].map((key) => PDFName.of(key))
/** ページを表示するのに使うもの。注釈は含めない */
const RENDERING = ['Contents', 'Resources'].map((key) => PDFName.of(key))

function refsIn(object: PDFObject | undefined): PDFRef[] {
  if (object instanceof PDFRef) return [object]
  if (object instanceof PDFArray) return object.asArray().filter((value): value is PDFRef => value instanceof PDFRef)
  return []
}

function isPageTreeNode(object: PDFObject | undefined): boolean {
  if (!(object instanceof PDFDict)) return false
  const type = object.get(PDFName.of('Type'))
  return type === PDFName.of('Page') || type === PDFName.of('Pages')
}

/** ページの親をたどり、受け継ぐ属性の値を集める。兄弟のページ（/Kids）はたどらない */
function inheritedValues(page: PDFPage): PDFObject[] {
  const values: PDFObject[] = []
  let parent = page.node.lookupMaybe(PARENT, PDFDict)
  while (parent) {
    for (const key of INHERITABLE) {
      const value = parent.get(key)
      if (value) values.push(value)
    }
    parent = parent.lookupMaybe(PARENT, PDFDict)
  }
  return values
}

/**
 * starts からたどれるオブジェクトの参照を集める。ページやページの木の節には入らない。
 * 入ると、そこから文書のすべてのページに行き着いてしまうため
 */
function reachableFrom(source: PDFDocument, starts: PDFObject[]): Set<string> {
  const reached = new Set<string>()
  const visit = (object: PDFObject | undefined) => {
    if (object instanceof PDFRef) {
      if (reached.has(object.tag)) return
      const target = source.context.lookup(object)
      if (isPageTreeNode(target)) return
      reached.add(object.tag)
      visit(target)
    } else if (object instanceof PDFDict) {
      for (const [, value] of object.entries()) visit(value)
    } else if (object instanceof PDFArray) {
      for (const value of object.asArray()) visit(value)
    } else if (object instanceof PDFStream) {
      visit(object.dict)
    }
  }
  for (const start of starts) visit(start)
  return reached
}

function ownEntries(page: PDFPage, keys?: PDFName[]): PDFObject[] {
  return page.node
    .entries()
    .filter(([key]) => key !== PARENT && (!keys || keys.includes(key)))
    .map(([, value]) => value)
}

/**
 * 使うページの注釈から、ほかの注釈とのつながりを外し、ほかのページに属する注釈は取り除く。
 * 返信元（/IRT）、ほかのページのポップアップ（/Popup）、置かれたページ（/P）、
 * ほかのページにまたがるフォームの欄（/Parent）は、使わないページのコメント本文などを指していることがある
 */
function detachAnnotations(source: PDFDocument, used: PDFPage[]) {
  for (const page of used) {
    page.node.delete(PDFName.of('B'))
    const annotations = page.node.Annots()
    if (!annotations) continue
    const onThisPage = new Set(annotations.asArray().map((ref) => (ref instanceof PDFRef ? ref.tag : '')))
    const remaining = annotations.asArray().filter((ref) => {
      const annotation = source.context.lookup(ref)
      if (!(annotation instanceof PDFDict)) return false
      const owner = annotation.get(PDFName.of('P'))
      if (owner instanceof PDFRef && owner.tag !== page.ref.tag) return false
      for (const key of ['IRT', 'P', 'Parent']) annotation.delete(PDFName.of(key))
      const popup = annotation.get(PDFName.of('Popup'))
      if (popup instanceof PDFRef && !onThisPage.has(popup.tag)) annotation.delete(PDFName.of('Popup'))
      return true
    })
    page.node.set(PDFName.of('Annots'), source.context.obj(remaining))
  }
}

/**
 * ページを写す前に、元のファイルの中で、使うページから使わないページの中身への参照を断ち切る。
 *
 * pdf-lib はページを写すとき、そのページからたどれるものを丸ごと新しい番号で写すので、
 * 写したあとでは、どれが使わないページのものだったか見分けられない。そのため写す前に断ち切る。
 *
 * 断ち切る対象は「使わないページからたどれるもののうち、使うページの表示（本文と資源）に要らないもの」。
 * 使わないページのどこにどんな中身があるか（注釈、その外観、ポップアップ…）を1つずつ挙げると必ず漏れが出るので、
 * 逆に、使うページの表示に要るもの以外はすべて対象にする
 */
export function severDroppedPages(source: PDFDocument, usedIndices: Set<number>) {
  const pages = source.getPages()
  const used = pages.filter((_, i) => usedIndices.has(i))
  const dropped = pages.filter((_, i) => !usedIndices.has(i))
  if (dropped.length === 0) return

  const neededForUsed = reachableFrom(
    source,
    used.flatMap((page) => [...ownEntries(page, RENDERING), ...inheritedValues(page)]),
  )
  const owned = reachableFrom(
    source,
    dropped.flatMap((page) => ownEntries(page)),
  )
  for (const tag of neededForUsed) owned.delete(tag)
  // 使わないページの本文と注釈そのものは、使うページの資源から指されていても対象にする。
  // ページの本文が別のページの資源として使われることは本来なく、そう見えるのは中身を持ち出す経路だけなので
  for (const page of dropped) {
    owned.add(page.ref.tag)
    for (const key of ['Contents', 'Annots']) {
      // 配列を直接持つことも、配列への参照を持つこともあるので、両方の中身を集める
      const value = page.node.get(PDFName.of(key))
      const resolved = value instanceof PDFRef ? source.context.lookup(value) : undefined
      for (const ref of [...refsIn(value), ...refsIn(resolved)]) owned.add(ref.tag)
    }
  }

  detachAnnotations(source, used)

  const visited = new Set<string>()
  const visit = (object: PDFObject | undefined) => {
    if (object instanceof PDFRef) {
      if (visited.has(object.tag)) return
      visited.add(object.tag)
      visit(source.context.lookup(object))
    } else if (object instanceof PDFDict) {
      for (const [key, value] of object.entries()) {
        if (value instanceof PDFRef && owned.has(value.tag)) object.set(key, PDFNull)
        else if (!(key === PARENT && isPageTreeNode(object))) visit(value)
      }
    } else if (object instanceof PDFArray) {
      object.asArray().forEach((value, i) => {
        if (value instanceof PDFRef && owned.has(value.tag)) object.set(i, PDFNull)
        else visit(value)
      })
    } else if (object instanceof PDFStream) {
      visit(object.dict)
    }
  }
  for (const page of used) {
    visited.add(page.ref.tag)
    for (const value of [...ownEntries(page), ...inheritedValues(page)]) visit(value)
  }
}

/**
 * 文書の入り口（trailer）からたどれないオブジェクトを消す。保存するとそのまま書き出され、中身を読み出せてしまうため。
 * 念のため、文書に含めるページ以外のページを指す参照は、ここでも断ち切っておく
 */
export function removeUnreachableObjects(pdf: PDFDocument, keptPages: PDFPage[]) {
  const { context } = pdf
  const kept = new Set(keptPages.map((page) => page.ref.tag))
  const isOtherPage = (ref: PDFRef) => {
    const target = context.lookup(ref)
    return !kept.has(ref.tag) && target instanceof PDFDict && target.get(PDFName.of('Type')) === PDFName.of('Page')
  }
  const reachable = new Set<string>()
  const visit = (object: PDFObject | undefined) => {
    if (object instanceof PDFRef) {
      if (reachable.has(object.tag)) return
      reachable.add(object.tag)
      visit(context.lookup(object))
    } else if (object instanceof PDFDict) {
      for (const [key, value] of object.entries()) {
        if (value instanceof PDFRef && isOtherPage(value)) object.set(key, PDFNull)
        else visit(value)
      }
    } else if (object instanceof PDFArray) {
      object.asArray().forEach((value, i) => {
        if (value instanceof PDFRef && isOtherPage(value)) object.set(i, PDFNull)
        else visit(value)
      })
    } else if (object instanceof PDFStream) {
      visit(object.dict)
    }
  }
  const { Root, Info, Encrypt } = context.trailerInfo
  for (const entry of [Root, Info, Encrypt]) visit(entry)

  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!reachable.has(ref.tag)) context.delete(ref)
  }
}
