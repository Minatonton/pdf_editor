import { BlendMode, degrees, LineCapStyle, PDFDocument, rgb, type PDFImage, type PDFPage } from 'pdf-lib'
import { shapePath } from '../annotations/shapePath'
import { rasterizeText } from '../annotations/textRaster'
import { BLANK_PAGE_FILE, type EditorDocument, type PageRef } from '../editor/document'
import { placeInPdf, viewToPdfPoint, type PageBox, type ViewRect } from './geometry'
import { removeUnreachableObjects, severDroppedPages } from './prune'

/**
 * 1つ目のファイルのページをすべて使うときは、それを読み込んだものを土台にしてページを並べ直す。
 * 新しい PDF にページを写すと、しおりやフォームの欄など文書全体に付いた情報が失われるため。
 *
 * 1ページでも使わないページがあるときは、新しい PDF に使うページだけを写す。
 * 土台からページを外しても、そのページの中身はどこからも参照されないままファイルに残り、
 * 削除や抜き出しで取り除いたつもりの内容を読み出せてしまうため。
 */
async function arrangePages(files: Uint8Array[], pages: PageRef[]): Promise<{ pdf: PDFDocument; output: PDFPage[] }> {
  const first = await PDFDocument.load(files[0])
  const usesEveryPageOfFirst = first
    .getPageIndices()
    .every((index) => pages.some((ref) => ref.file === 0 && ref.index === index))
  const pdf = usesEveryPageOfFirst ? first : await PDFDocument.create()
  const reused = new Set<number>()
  const output: PDFPage[] = []

  // 写す元のファイルは、写す前に使わないページへの参照を断ち切っておく。土台にした文書は全ページを使うので断ち切らない
  const sources = new Map<number, PDFDocument>(usesEveryPageOfFirst ? [[0, first]] : [])
  const sourceOf = async (file: number) => {
    let source = sources.get(file)
    if (!source) {
      source = file === 0 ? first : await PDFDocument.load(files[file])
      severDroppedPages(source, new Set(pages.filter((ref) => ref.file === file).map((ref) => ref.index)))
      sources.set(file, source)
    }
    return source
  }

  for (const ref of pages) {
    let page: PDFPage
    if (ref.file === BLANK_PAGE_FILE) {
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
  removeUnreachableObjects(pdf)
  return { pdf, output }
}

export async function exportPdf(files: Uint8Array[], document: EditorDocument): Promise<Uint8Array> {
  const { pdf, output } = await arrangePages(files, document.pages)
  const pageById = new Map(document.pages.map((ref, i) => [ref.id, { ref, page: output[i] }]))
  // 同じ画像を何か所に置いても、ファイルには1回だけ埋め込む
  const embeddedImages = new Map<Uint8Array, PDFImage>()

  for (const annotation of document.annotations) {
    const target = pageById.get(annotation.pageId)
    if (!target) continue
    const crop = target.page.getCropBox()
    const box: PageBox = { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height }

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

  return pdf.save()
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  return rgb(((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255)
}

function embed(pdf: PDFDocument, bytes: Uint8Array, format: 'png' | 'jpeg'): Promise<PDFImage> {
  return format === 'png' ? pdf.embedPng(bytes) : pdf.embedJpg(bytes)
}
