import { BlendMode, degrees, LineCapStyle, PDFDocument, PDFHexString, PDFName, PDFString, rgb, type PDFImage, type PDFPage } from 'pdf-lib'
import { shapePath } from '../annotations/shapePath'
import { rasterizeText } from '../annotations/textRaster'
import { safeLinkUrl } from '../annotations/linkUrl'
import { NOTE_ICON_SIZE, type LinkAnnotation, type NoteAnnotation } from '../annotations/types'
import { BLANK_PAGE_FILE, fieldKey, viewSizeOf, visibleRectOf, type EditorDocument, type FieldValue, type PageRef } from '../editor/document'
import { expandMark, type PageMarks } from '../editor/pageMarks'
import { placeCenteredInPdf, placeInPdf, viewToPdfPoint, type PageBox, type Point, type Rotation, type ViewRect } from './geometry'
import { fillForm } from './fillForm'
import { removeUnreachableObjects, severDroppedPages } from './prune'

/**
 * 1つ目のファイルのページをすべて使うときは、それを読み込んだものを土台にしてページを並べ直す。
 * 新しい PDF にページを写すと、しおりやフォームの欄など文書全体に付いた情報が失われるため。
 *
 * 1ページでも使わないページがあるときは、新しい PDF に使うページだけを写す。
 * 土台からページを外しても、そのページの中身はどこからも参照されないままファイルに残り、
 * 削除や抜き出しで取り除いたつもりの内容を読み出せてしまうため。
 */
async function arrangePages(
  files: Uint8Array[],
  pages: PageRef[],
  rasterIds: Set<string>,
  formValues: Record<string, FieldValue>,
): Promise<{ pdf: PDFDocument; output: PDFPage[] }> {
  const valuesOf = (file: number) => {
    const prefix = fieldKey(file, '')
    return Object.fromEntries(
      Object.entries(formValues)
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key.slice(prefix.length), value]),
    )
  }
  const first = await PDFDocument.load(files[0])
  // 画像に置き換えるページは、元のページを使わないページとして扱う。元のページの中身を一切持ち込まないため
  const usedRefs = pages.filter((ref) => !rasterIds.has(ref.id))
  const usesEveryPageOfFirst = first
    .getPageIndices()
    .every((index) => usedRefs.some((ref) => ref.file === 0 && ref.index === index))
  const pdf = usesEveryPageOfFirst ? first : await PDFDocument.create()
  if (usesEveryPageOfFirst) await fillForm(first, valuesOf(0), false)
  const reused = new Set<number>()
  const output: PDFPage[] = []

  // 写す元のファイルは、写す前に使わないページへの参照を断ち切っておく。土台にした文書は全ページを使うので断ち切らない
  const sources = new Map<number, PDFDocument>(usesEveryPageOfFirst ? [[0, first]] : [])
  const sourceOf = async (file: number) => {
    let source = sources.get(file)
    if (!source) {
      source = file === 0 ? first : await PDFDocument.load(files[file])
      // 写した先には文書全体のフォームが引き継がれないので、写す前に欄をページの描画に焼き込む
      await fillForm(source, valuesOf(file), true)
      severDroppedPages(source, new Set(usedRefs.filter((ref) => ref.file === file).map((ref) => ref.index)))
      sources.set(file, source)
    }
    return source
  }

  for (const ref of pages) {
    let page: PDFPage
    if (ref.file === BLANK_PAGE_FILE || rasterIds.has(ref.id)) {
      page = pdf.addPage([ref.width, ref.height])
    } else if (ref.file === 0 && usesEveryPageOfFirst && !reused.has(ref.index)) {
      page = pdf.getPage(ref.index)
      reused.add(ref.index)
    } else {
      ;[page] = await pdf.copyPages(await sourceOf(ref.file), [ref.index])
    }
    page.setRotation(degrees(ref.rotation))
    output.push(page)
  }

  for (let i = pdf.getPageCount() - 1; i >= 0; i--) pdf.removePage(i)
  for (const page of output) pdf.addPage(page)
  removeUnreachableObjects(pdf, output)
  return { pdf, output }
}

/** 墨消しのあるページを、範囲を黒く塗った画像にする。描くには pdf.js が要るので、呼び出す側が用意する */
export type RasterizePage = (page: PageRef, redactions: ViewRect[]) => Promise<{ bytes: Uint8Array; format: 'png' | 'jpeg' }>

export async function exportPdf(
  files: Uint8Array[],
  document: EditorDocument,
  rasterize?: RasterizePage,
): Promise<Uint8Array> {
  const redactionsByPage = new Map<string, ViewRect[]>()
  for (const annotation of document.annotations) {
    if (annotation.kind !== 'redaction') continue
    redactionsByPage.set(annotation.pageId, [...(redactionsByPage.get(annotation.pageId) ?? []), annotation])
  }
  if (redactionsByPage.size > 0 && !rasterize) throw new Error('墨消しのあるページを画像にする手段がありません')

  const { pdf, output } = await arrangePages(files, document.pages, new Set(redactionsByPage.keys()), document.formValues)
  const pageById = new Map(document.pages.map((ref, i) => [ref.id, { ref, page: output[i] }]))
  // 同じ画像を何か所に置いても、ファイルには1回だけ埋め込む
  const embeddedImages = new Map<Uint8Array, PDFImage>()

  for (const [pageId, redactions] of redactionsByPage) {
    const target = pageById.get(pageId)
    if (!target) continue
    const raster = await rasterize!(target.ref, redactions)
    const image = await embed(pdf, raster.bytes, raster.format)
    const crop = target.page.getCropBox()
    const box: PageBox = { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height }
    const placement = placeInPdf({ x: 0, y: 0, ...viewSizeOf(target.ref) }, box, target.ref.rotation)
    target.page.drawImage(image, { ...placement, rotate: degrees(placement.rotateDegrees) })
  }

  for (const annotation of document.annotations) {
    const target = pageById.get(annotation.pageId)
    if (!target) continue
    const crop = target.page.getCropBox()
    const box: PageBox = { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height }

    // 墨消しの範囲は、ページを画像にしたときにすでに塗ってある
    if (annotation.kind === 'redaction') continue

    if (annotation.kind === 'link') {
      const destination = 'url' in annotation.target ? undefined : pageById.get(annotation.target.pageId)?.page
      addLink(pdf, target.page, annotation, box, target.ref.rotation, destination)
      continue
    }

    if (annotation.kind === 'note') {
      if (annotation.text.trim() !== '') addNote(pdf, target.page, annotation, box, target.ref.rotation)
      continue
    }

    if (annotation.kind === 'rect') {
      const placement = placeInPdf(annotation, box, target.ref.rotation)
      target.page.drawRectangle({
        ...placement,
        rotate: degrees(placement.rotateDegrees),
        color: hexToRgb(annotation.color),
        opacity: annotation.opacity,
        blendMode: annotation.opacity < 1 ? BlendMode.Multiply : BlendMode.Normal,
      })
      continue
    }

    if (annotation.kind === 'shape') {
      // SVG のパスは原点から下向きに描かれるので、画面上の左上の角を原点にして、ページの向きと同じだけ回す
      const origin = viewToPdfPoint(annotation.x, annotation.y, box, target.ref.rotation)
      target.page.drawSvgPath(shapePath(annotation), {
        ...origin,
        rotate: degrees(target.ref.rotation),
        borderColor: hexToRgb(annotation.color),
        borderWidth: annotation.strokeWidth,
        borderLineCap: LineCapStyle.Round,
      })
      continue
    }

    let image: PDFImage
    let rect: ViewRect
    if (annotation.kind === 'image') {
      image = embeddedImages.get(annotation.bytes) ?? (await embed(pdf, annotation.bytes, annotation.format))
      embeddedImages.set(annotation.bytes, image)
      rect = annotation
    } else {
      if (annotation.text.trim() === '') continue
      const raster = await rasterizeText(annotation)
      image = await pdf.embedPng(raster.png)
      rect = { x: annotation.x, y: annotation.y, width: raster.width, height: raster.height }
    }

    const placement = placeInPdf(rect, box, target.ref.rotation)
    target.page.drawImage(image, { ...placement, rotate: degrees(placement.rotateDegrees) })
  }

  await drawPageMarks(pdf, document.pages, output, document.pageMarks)
  // 表示範囲は最後に変える。置いたものや透かしは、切り取る前のページの座標で描くため
  for (const [i, page] of output.entries()) {
    const { crop } = document.pages[i]
    if (!crop) continue
    const box = page.getCropBox()
    page.setCropBox(box.x + crop.left, box.y + crop.bottom, crop.right - crop.left, crop.top - crop.bottom)
  }
  return pdf.save()
}

/** 透かしは紙の大きさに合わせて大きく薄く、ヘッダー・フッターは上下の余白の真ん中に小さく入れる */
const MARK_MARGIN = 24

async function drawPageMarks(pdf: PDFDocument, refs: PageRef[], output: PDFPage[], marks: PageMarks) {
  const total = refs.length
  for (const [i, page] of output.entries()) {
    const ref = refs[i]
    // トリミングしたページでは、残る範囲の中央と余白に入れる
    const view = visibleRectOf(ref)
    const crop = page.getCropBox()
    const box: PageBox = { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height }
    const draw = async (template: string, center: Point, fontSize: number, color: string, tilt: number, opacity: number) => {
      const text = expandMark(template, i + 1, total)
      if (text.trim() === '') return
      const raster = await rasterizeText({ text, fontSize, color })
      const image = await pdf.embedPng(raster.png)
      const placement = placeCenteredInPdf(center, raster.width, raster.height, tilt, box, ref.rotation)
      page.drawImage(image, { ...placement, rotate: degrees(placement.rotateDegrees), opacity })
    }
    const centerX = view.x + view.width / 2
    const size = Math.min(view.width, view.height) / 8
    await draw(marks.watermark, { x: centerX, y: view.y + view.height / 2 }, size, '#808080', 45, 0.25)
    await draw(marks.header, { x: centerX, y: view.y + MARK_MARGIN }, 10, '#333333', 0, 1)
    await draw(marks.footer, { x: centerX, y: view.y + view.height - MARK_MARGIN }, 10, '#333333', 0, 1)
  }
}

/**
 * リンクは PDF の注釈（Link）として足す。URL は保存の直前にも確かめ直す。
 * 移り先のページが削除されていたら、飛び先のないリンクになるので足さない
 */
function addLink(pdf: PDFDocument, page: PDFPage, link: LinkAnnotation, box: PageBox, rotation: Rotation, destination?: PDFPage) {
  const url = 'url' in link.target ? safeLinkUrl(link.target.url) : null
  if (!url && !destination) return
  const a = viewToPdfPoint(link.x, link.y, box, rotation)
  const b = viewToPdfPoint(link.x + link.width, link.y + link.height, box, rotation)
  const action = url
    ? { S: 'URI', URI: PDFString.of(url) }
    : { S: 'GoTo', D: [destination!.ref, PDFName.of('Fit')] }
  const annotation = pdf.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)],
    Border: [0, 0, 0],
    A: action,
  })
  page.node.addAnnot(pdf.context.register(annotation))
}

/** 付箋は PDF の注釈（Text）として足す。ほかのビューアーでもコメントとして開け、印刷には出ない */
function addNote(pdf: PDFDocument, page: PDFPage, note: NoteAnnotation, box: PageBox, rotation: Rotation) {
  const a = viewToPdfPoint(note.x, note.y, box, rotation)
  const b = viewToPdfPoint(note.x + NOTE_ICON_SIZE, note.y + NOTE_ICON_SIZE, box, rotation)
  const annotation = pdf.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)],
    Contents: PDFHexString.fromText(note.text),
    Name: 'Comment',
    C: [1, 0.83, 0.23],
    M: PDFString.fromDate(new Date()),
  })
  page.node.addAnnot(pdf.context.register(annotation))
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  return rgb(((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255)
}

function embed(pdf: PDFDocument, bytes: Uint8Array, format: 'png' | 'jpeg'): Promise<PDFImage> {
  return format === 'png' ? pdf.embedPng(bytes) : pdf.embedJpg(bytes)
}
