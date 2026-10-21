import { PDFArray, PDFDict, PDFName, PDFRef, PDFStream, type PDFDocument, type PDFObject, type PDFPage } from 'pdf-lib'

const PAGE_LINKING_KEYS = ['P', 'Parent'].map((key) => PDFName.of(key))

function destinationOf(annotation: PDFDict): PDFObject | undefined {
  const dest = annotation.get(PDFName.of('Dest'))
  if (dest) return annotation.context.lookup(dest)
  const action = annotation.lookupMaybe(PDFName.of('A'), PDFDict)
  const actionDest = action?.get(PDFName.of('D'))
  return actionDest && annotation.context.lookup(actionDest)
}

/**
 * 写したページの注釈から、ほかのページへの参照を外す。
 * 注釈の /P（置かれたページ）、フォームの欄の /Parent（同じ欄のほかのページの部品）、
 * リンクの飛び先がほかのページを指していると、写すときにそのページまで丸ごと付いてきてしまう。
 * 文書に含めないページへ飛ぶリンクは、飛び先がなくなるので注釈ごと外す
 */
export function detachFromOtherPages(pages: PDFPage[], keptPages: PDFPage[]) {
  const kept = new Set(keptPages.map((page) => page.ref.tag))
  for (const page of pages) {
    page.node.delete(PDFName.of('B'))
    const annotations = page.node.Annots()
    if (!annotations) continue
    const remaining = annotations.asArray().filter((ref) => {
      const annotation = page.doc.context.lookup(ref)
      if (!(annotation instanceof PDFDict)) return true
      for (const key of PAGE_LINKING_KEYS) annotation.delete(key)
      const dest = destinationOf(annotation)
      const target = dest instanceof PDFArray ? dest.get(0) : undefined
      return !(target instanceof PDFRef) || kept.has(target.tag)
    })
    page.node.set(PDFName.of('Annots'), page.doc.context.obj(remaining))
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
