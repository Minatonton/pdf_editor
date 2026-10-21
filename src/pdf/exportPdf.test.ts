import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import type { PageRef } from '../editor/document'
import { exportPdf } from './exportPdf'

async function pdfWithPages(...sizes: [number, number][]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  for (const size of sizes) pdf.addPage(size)
  return pdf.save()
}

function ref(file: number, index: number, rotation: PageRef['rotation'] = 0): PageRef {
  return { id: `${file}-${index}`, file, index, rotation, width: 0, height: 0 }
}

async function pagesOf(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes)
  return pdf.getPages().map((page) => ({ width: page.getWidth(), rotation: page.getRotation().angle }))
}

describe('exportPdf', () => {
  it('並べ替えた順番と、変えた向きで保存する', async () => {
    const file = await pdfWithPages([100, 100], [200, 100], [300, 100])
    const saved = await exportPdf([file], { pages: [ref(0, 2), ref(0, 0, 90)], annotations: [] })
    expect(await pagesOf(saved)).toEqual([
      { width: 300, rotation: 0 },
      { width: 100, rotation: 90 },
    ])
  })

  it('別のファイルのページを後ろに足せる', async () => {
    const first = await pdfWithPages([100, 100])
    const second = await pdfWithPages([400, 100])
    const saved = await exportPdf([first, second], { pages: [ref(0, 0), ref(1, 0)], annotations: [] })
    expect((await pagesOf(saved)).map((page) => page.width)).toEqual([100, 400])
  })

  it('白紙のページを、指定した大きさと向きで差し込める', async () => {
    const file = await pdfWithPages([100, 100])
    const blank: PageRef = { id: 'blank', file: -1, index: 0, rotation: 90, width: 250, height: 100 }
    const saved = await exportPdf([file], { pages: [ref(0, 0), blank], annotations: [] })
    expect(await pagesOf(saved)).toEqual([
      { width: 100, rotation: 0 },
      { width: 250, rotation: 90 },
    ])
  })

  it('同じページを2回使っても、別々のページとして保存する', async () => {
    const file = await pdfWithPages([100, 100])
    const saved = await exportPdf([file], { pages: [ref(0, 0), { ...ref(0, 0), id: 'copy' }], annotations: [] })
    expect(await pagesOf(saved)).toHaveLength(2)
  })
})
