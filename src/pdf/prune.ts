import { PDFArray, PDFDict, PDFName, PDFNull, PDFRef, PDFStream, type PDFDocument, type PDFObject, type PDFPage } from 'pdf-lib'

/**
 * 写したページの注釈から、ほかの注釈とのつながりを外す。
 * 返信元（/IRT）、ほかのページのポップアップ（/Popup）、置かれたページ（/P）、
 * ほかのページにまたがるフォームの欄（/Parent）は、ページそのものではなく、
 * 削除したページに書かれたコメントの本文などを指していることがある。
 * ページへの参照を断ち切るだけ（removeUnreachableObjects）では、それらの本文が残ってしまう
 */
export function detachFromOtherPages(pages: PDFPage[]) {
  for (const page of pages) {
    page.node.delete(PDFName.of('B'))
    const annotations = page.node.Annots()
    if (!annotations) continue
    const onThisPage = new Set(annotations.asArray().map((ref) => (ref instanceof PDFRef ? ref.tag : '')))
    for (const ref of annotations.asArray()) {
      const annotation = page.doc.context.lookup(ref)
      if (!(annotation instanceof PDFDict)) continue
      for (const key of ['IRT', 'P', 'Parent']) annotation.delete(PDFName.of(key))
      const popup = annotation.get(PDFName.of('Popup'))
      if (popup instanceof PDFRef && !onThisPage.has(popup.tag)) annotation.delete(PDFName.of('Popup'))
    }
  }
}

function isPageNode(object: PDFObject | undefined): boolean {
  return object instanceof PDFDict && object.get(PDFName.of('Type')) === PDFName.of('Page')
}

/**
 * 文書の入り口（trailer）からたどれないオブジェクトを消す。保存するとそのまま書き出され、中身を読み出せてしまうため。
 *
 * たどる途中で、文書に含めないページを指す参照は、どこにあっても null に置き換えて断ち切る。
 * リンクの飛び先、アクションの連鎖（/Next）、追加アクション（/AA）など、ページを指す場所は数が多く、
 * 場所を1つずつ挙げて外していくと必ず漏れが出るため
 */
export function removeUnreachableObjects(pdf: PDFDocument, keptPages: PDFPage[]) {
  const { context } = pdf
  const kept = new Set(keptPages.map((page) => page.ref.tag))
  const isDroppedPage = (ref: PDFRef) => !kept.has(ref.tag) && isPageNode(context.lookup(ref))
  const reachable = new Set<string>()

  const visit = (object: PDFObject | undefined) => {
    if (object instanceof PDFRef) {
      if (reachable.has(object.tag)) return
      reachable.add(object.tag)
      visit(context.lookup(object))
    } else if (object instanceof PDFDict) {
      for (const [key, value] of object.entries()) {
        if (value instanceof PDFRef && isDroppedPage(value)) object.set(key, PDFNull)
        else visit(value)
      }
    } else if (object instanceof PDFArray) {
      object.asArray().forEach((value, i) => {
        if (value instanceof PDFRef && isDroppedPage(value)) object.set(i, PDFNull)
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
