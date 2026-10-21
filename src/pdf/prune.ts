import { PDFArray, PDFDict, PDFName, PDFNull, PDFRef, PDFStream, type PDFDocument, type PDFObject, type PDFPage } from 'pdf-lib'

function refsIn(object: PDFObject | undefined): PDFRef[] {
  if (object instanceof PDFRef) return [object]
  if (object instanceof PDFArray) return object.asArray().filter((value): value is PDFRef => value instanceof PDFRef)
  return []
}

/**
 * 使わないページと、そのページが持つもの（ページ本体、注釈、本文の描画命令）の参照を集める。
 * ページの資源（フォントや画像）は使うページと共有されていることが多く、使うページで見えているものなので含めない
 */
function ownedByDroppedPages(source: PDFDocument, dropped: PDFPage[]): Set<string> {
  const owned = new Set<string>()
  for (const page of dropped) {
    owned.add(page.ref.tag)
    for (const key of ['Annots', 'Contents']) {
      // 配列を直接持つことも、配列への参照を持つこともあるので、両方の中身を集める
      const value = page.node.get(PDFName.of(key))
      const resolved = value instanceof PDFRef ? source.context.lookup(value) : undefined
      for (const ref of [...refsIn(value), ...refsIn(resolved)]) owned.add(ref.tag)
    }
  }
  return owned
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
 * 参照する場所はリンクの飛び先、アクションの連鎖、注釈の外観など数が多く、
 * 場所を1つずつ挙げて外すと必ず漏れが出るので、使うページからたどれる参照をすべて調べる
 */
export function severDroppedPages(source: PDFDocument, usedIndices: Set<number>) {
  const pages = source.getPages()
  const used = pages.filter((_, i) => usedIndices.has(i))
  const owned = ownedByDroppedPages(
    source,
    pages.filter((_, i) => !usedIndices.has(i)),
  )
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
        else visit(value)
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
    // ページの木（/Parent）をたどると、使わないページも含むすべてのページに行き着くのでたどらない
    for (const [key, value] of page.node.entries()) {
      if (key !== PDFName.of('Parent')) visit(value)
    }
  }
}

/** 文書の入り口（trailer）からたどれないオブジェクトを消す。保存するとそのまま書き出され、中身を読み出せてしまうため */
export function removeUnreachableObjects(pdf: PDFDocument) {
  const { context } = pdf
  const reachable = new Set<string>()
  const visit = (object: PDFObject | undefined) => {
    if (object instanceof PDFRef) {
      if (reachable.has(object.tag)) return
      reachable.add(object.tag)
      visit(context.lookup(object))
    } else if (object instanceof PDFDict) {
      for (const [, value] of object.entries()) visit(value)
    } else if (object instanceof PDFArray) {
      for (const value of object.asArray()) visit(value)
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
