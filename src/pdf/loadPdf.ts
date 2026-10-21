import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export interface OpenedPdf {
  name: string
  /** 書き出しのときに pdf-lib で読み直す元データ */
  bytes: Uint8Array
  document: PDFDocumentProxy
  pages: PDFPageProxy[]
}

export async function openPdf(file: File): Promise<OpenedPdf> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  // pdf.js は受け取ったバッファを worker に移して使えなくするので、書き出し用の元データとは別にコピーを渡す
  const document = await getDocument({ data: bytes.slice() }).promise
  const pages = await Promise.all(Array.from({ length: document.numPages }, (_, i) => document.getPage(i + 1)))
  return { name: file.name, bytes, document, pages }
}
