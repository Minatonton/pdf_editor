import { degrees, PDFDocument, type PDFImage, type PDFPage } from 'pdf-lib'
import { rasterizeText } from '../annotations/textRaster'
import type { EditorDocument, PageRef } from '../editor/document'
import { placeInPdf, type PageBox, type ViewRect } from './geometry'

/**
 * 1つ目のファイルを読み込んだものを土台にして、ページを並べ直す。
 * 新しい PDF にページを写すと、しおりやフォームの欄など文書全体に付いた情報が失われるため。
 */
async function arrangePages(files: Uint8Array[], pages: PageRef[]): Promise<{ pdf: PDFDocument; output: PDFPage[] }> {
  const pdf = await PDFDocument.load(files[0])
  const sources = new Map<number, PDFDocument>([[0, pdf]])
  const reused = new Set<number>()
  const output: PDFPage[] = []

  for (const ref of pages) {
    let page: PDFPage
    if (ref.file === 0 && !reused.has(ref.index)) {
      page = pdf.getPage(ref.index)
      reused.add(ref.index)
    } else {
      let source = sources.get(ref.file)
      if (!source) {
        source = await PDFDocument.load(files[ref.file])
        sources.set(ref.file, source)
      }
      ;[page] = await pdf.copyPages(source, [ref.index])
    }
    page.setRotation(degrees(ref.rotation))
    output.push(page)
  }

  for (let i = pdf.getPageCount() - 1; i >= 0; i--) pdf.removePage(i)
  for (const page of output) pdf.addPage(page)
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

function embed(pdf: PDFDocument, bytes: Uint8Array, format: 'png' | 'jpeg'): Promise<PDFImage> {
  return format === 'png' ? pdf.embedPng(bytes) : pdf.embedJpg(bytes)
}
