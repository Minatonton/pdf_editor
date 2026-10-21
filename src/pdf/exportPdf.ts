import { degrees, PDFDocument, type PDFImage } from 'pdf-lib'
import { rasterizeText } from '../annotations/textRaster'
import type { Annotation } from '../annotations/types'
import { normalizeRotation, placeInPdf, type PageBox, type ViewRect } from './geometry'

export async function exportPdf(original: Uint8Array, annotations: Annotation[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original)
  const pages = pdf.getPages()
  // 同じ画像を何か所に置いても、ファイルには1回だけ埋め込む
  const embeddedImages = new Map<Uint8Array, PDFImage>()

  for (const annotation of annotations) {
    const page = pages[annotation.pageIndex]
    const crop = page.getCropBox()
    const box: PageBox = { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height }
    const rotation = normalizeRotation(page.getRotation().angle)

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

    const placement = placeInPdf(rect, box, rotation)
    page.drawImage(image, { ...placement, rotate: degrees(placement.rotateDegrees) })
  }

  return pdf.save()
}

function embed(pdf: PDFDocument, bytes: Uint8Array, format: 'png' | 'jpeg'): Promise<PDFImage> {
  return format === 'png' ? pdf.embedPng(bytes) : pdf.embedJpg(bytes)
}
