import type { PDFPageProxy } from 'pdfjs-dist'
import type { PageRef } from '../editor/document'
import type { RasterizePage } from './exportPdf'

/** 墨消ししたページを画像にするときの解像度。小さな文字が読める程度で、ファイルが大きくなりすぎないところ */
const REDACTION_DPI = 200

export function rasterizerFor(proxyOf: (page: PageRef) => PDFPageProxy | undefined): RasterizePage {
  return async (page, redactions) => {
    const scale = REDACTION_DPI / 72
    const proxy = proxyOf(page)
    const turned = page.rotation === 90 || page.rotation === 270
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil((turned ? page.height : page.width) * scale)
    canvas.height = Math.ceil((turned ? page.width : page.height) * scale)
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    if (proxy) await proxy.render({ canvas, viewport: proxy.getViewport({ scale, rotation: page.rotation }) }).promise
    context.fillStyle = '#000000'
    for (const rect of redactions) context.fillRect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale)

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('墨消ししたページを画像にできませんでした'))), 'image/jpeg', 0.92),
    )
    return { bytes: new Uint8Array(await blob.arrayBuffer()), format: 'jpeg' }
  }
}
