import { BlendMode, degrees, LineCapStyle, PDFDocument, rgb, type PDFImage, type PDFPage } from 'pdf-lib'
import { shapePath } from '../annotations/shapePath'
import { rasterizeText } from '../annotations/textRaster'
import { BLANK_PAGE_FILE, fieldKey, viewSizeOf, type EditorDocument, type FieldValue, type PageRef } from '../editor/document'
import { expandMark, type PageMarks } from '../editor/pageMarks'
import { placeCenteredInPdf, placeInPdf, viewToPdfPoint, type PageBox, type Point, type ViewRect } from './geometry'
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
  return pdf.save()
}

/** 透かしは紙の大きさに合わせて大きく薄く、ヘッダー・フッターは上下の余白の真ん中に小さく入れる */
const MARK_MARGIN = 24

async function drawPageMarks(pdf: PDFDocument, refs: PageRef[], output: PDFPage[], marks: PageMarks) {
  const total = refs.length
  for (const [i, page] of output.entries()) {
    const ref = refs[i]
    const view = viewSizeOf(ref)
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
    await draw(marks.watermark, { x: view.width / 2, y: view.height / 2 }, Math.min(view.width, view.height) / 8, '#808080', 45, 0.25)
    await draw(marks.header, { x: view.width / 2, y: MARK_MARGIN }, 10, '#333333', 0, 1)
    await draw(marks.footer, { x: view.width / 2, y: view.height - MARK_MARGIN }, 10, '#333333', 0, 1)
  }
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  return rgb(((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255)
}

function embed(pdf: PDFDocument, bytes: Uint8Array, format: 'png' | 'jpeg'): Promise<PDFImage> {
  return format === 'png' ? pdf.embedPng(bytes) : pdf.embedJpg(bytes)
}
