import { PDFDocument, PDFName, PDFString, type PDFDict, type PDFObject, type PDFRef } from 'pdf-lib'
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
    const saved = await exportPdf([file], { pages: [ref(0, 2), ref(0, 0, 90)], annotations: [], formValues: {} })
    expect(await pagesOf(saved)).toEqual([
      { width: 300, rotation: 0 },
      { width: 100, rotation: 90 },
    ])
  })

  it('別のファイルのページを後ろに足せる', async () => {
    const first = await pdfWithPages([100, 100])
    const second = await pdfWithPages([400, 100])
    const saved = await exportPdf([first, second], { pages: [ref(0, 0), ref(1, 0)], annotations: [], formValues: {} })
    expect((await pagesOf(saved)).map((page) => page.width)).toEqual([100, 400])
  })

  it('白紙のページを、指定した大きさと向きで差し込める', async () => {
    const file = await pdfWithPages([100, 100])
    const blank: PageRef = { id: 'blank', file: -1, index: 0, rotation: 90, width: 250, height: 100 }
    const saved = await exportPdf([file], { pages: [ref(0, 0), blank], annotations: [], formValues: {} })
    expect(await pagesOf(saved)).toEqual([
      { width: 100, rotation: 0 },
      { width: 250, rotation: 90 },
    ])
  })

  it('同じページを2回使っても、別々のページとして保存する', async () => {
    const file = await pdfWithPages([100, 100])
    const saved = await exportPdf([file], { pages: [ref(0, 0), { ...ref(0, 0), id: 'copy' }], annotations: [], formValues: {} })
    expect(await pagesOf(saved)).toHaveLength(2)
  })

  it('削除したページの中身は、保存したファイルのどこにも残らない', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([100, 100])
    pdf.addPage([100, 100]).node.set(PDFName.of('Secret'), PDFString.of('DELETED-PAGE-MARKER'))
    const saved = await exportPdf([await pdf.save()], { pages: [ref(0, 0)], annotations: [], formValues: {} })

    const objects = (await PDFDocument.load(saved)).context.enumerateIndirectObjects()
    expect(objects.some(([, object]) => object.toString().includes('DELETED-PAGE-MARKER'))).toBe(false)
  })

  it('すべてのページを使うときは、しおりなど文書全体の情報を保つ', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([100, 100])
    pdf.catalog.set(PDFName.of('Outlines'), pdf.context.obj({ Type: 'Outlines' }))
    const saved = await exportPdf([await pdf.save()], { pages: [ref(0, 0, 90)], annotations: [], formValues: {} })
    expect((await PDFDocument.load(saved)).catalog.has(PDFName.of('Outlines'))).toBe(true)
  })

  async function fileWithSecretPage(linkFromKeptPage: (pdf: PDFDocument, secret: PDFRef) => PDFObject) {
    const pdf = await PDFDocument.create()
    const kept = pdf.addPage([100, 100])
    const secret = pdf.addPage([100, 100])
    secret.node.set(PDFName.of('Secret'), PDFString.of('DELETED-PAGE-MARKER'))
    kept.node.set(PDFName.of('Annots'), pdf.context.obj([pdf.context.register(linkFromKeptPage(pdf, secret.ref) as PDFDict)]))
    return pdf.save()
  }

  async function containsMarker(saved: Uint8Array) {
    const objects = (await PDFDocument.load(saved)).context.enumerateIndirectObjects()
    return objects.some(([, object]) => object.toString().includes('DELETED-PAGE-MARKER'))
  }

  it('残したページのリンクが削除したページを指していても、その中身は残らない', async () => {
    const file = await fileWithSecretPage((pdf, secret) =>
      pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10], Dest: [secret, PDFName.of('Fit')] }),
    )
    const saved = await exportPdf([file], { pages: [ref(0, 0)], annotations: [], formValues: {} })
    expect(await containsMarker(saved)).toBe(false)
  })

  it('残したページのフォームの欄が、削除したページの部品とつながっていても、その中身は残らない', async () => {
    const file = await fileWithSecretPage((pdf, secret) => {
      const otherWidget = pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Widget', P: secret }))
      const field = pdf.context.register(pdf.context.obj({ T: PDFString.of('name'), Kids: [otherWidget] }))
      return pdf.context.obj({ Type: 'Annot', Subtype: 'Widget', Rect: [0, 0, 10, 10], Parent: field })
    })
    const saved = await exportPdf([file], { pages: [ref(0, 0)], annotations: [], formValues: {} })
    expect(await containsMarker(saved)).toBe(false)
  })

  it('削除したページのコメントへの返信を残しても、返信元のコメントの本文は残らない', async () => {
    const file = await fileWithSecretPage((pdf, secret) => {
      const original = pdf.context.register(
        pdf.context.obj({ Type: 'Annot', Subtype: 'Text', P: secret, Contents: PDFString.of('DELETED-PAGE-MARKER') }),
      )
      return pdf.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 10, 10], IRT: original })
    })
    const saved = await exportPdf([file], { pages: [ref(0, 0)], annotations: [], formValues: {} })
    expect(await containsMarker(saved)).toBe(false)
  })

  it('アクションの連鎖の先が削除したページを指していても、その中身は残らない', async () => {
    const file = await fileWithSecretPage((pdf, secret) => {
      const next = pdf.context.obj({ S: 'GoTo', D: [secret, PDFName.of('Fit')] })
      return pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10], A: { S: 'URI', URI: PDFString.of('https://example.com'), Next: next } })
    })
    const saved = await exportPdf([file], { pages: [ref(0, 0)], annotations: [], formValues: {} })
    expect(await containsMarker(saved)).toBe(false)
  })

  it('別のファイルから足したページのリンクが、足さなかったページを指していても、その中身は残らない', async () => {
    const base = await pdfWithPages([100, 100])
    const other = await fileWithSecretPage((pdf, secret) =>
      pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10], AA: { O: { S: 'GoTo', D: [secret, PDFName.of('Fit')] } } }),
    )
    const saved = await exportPdf([base, other], { pages: [ref(0, 0), ref(1, 0)], annotations: [], formValues: {} })
    expect(await containsMarker(saved)).toBe(false)
  })

  it('残したページの注釈が、削除したページの注釈や描画命令を直接指していても、その中身は残らない', async () => {
    const pdf = await PDFDocument.create()
    const kept = pdf.addPage([100, 100])
    const secret = pdf.addPage([100, 100])
    const secretContents = pdf.context.register(pdf.context.stream('% DELETED-PAGE-MARKER in contents\n'))
    secret.node.set(PDFName.of('Contents'), secretContents)
    const secretNote = pdf.context.register(
      pdf.context.obj({ Type: 'Annot', Subtype: 'Text', Contents: PDFString.of('DELETED-PAGE-MARKER in note') }),
    )
    secret.node.set(PDFName.of('Annots'), pdf.context.obj([secretNote]))
    const pointer = pdf.context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [0, 0, 10, 10], Related: secretNote, AP: { N: secretContents } })
    kept.node.set(PDFName.of('Annots'), pdf.context.obj([pdf.context.register(pointer)]))

    const saved = await exportPdf([await pdf.save({ useObjectStreams: false })], { pages: [ref(0, 0)], annotations: [], formValues: {} })
    expect(await containsMarker(saved)).toBe(false)
  })

  it('残したページの注釈が、削除したページの注釈の外観を直接指していても、その中身は残らない', async () => {
    const pdf = await PDFDocument.create()
    const kept = pdf.addPage([100, 100])
    const secret = pdf.addPage([100, 100])
    const appearance = pdf.context.register(pdf.context.stream('% DELETED-PAGE-MARKER in appearance\n'))
    const secretNote = pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [0, 0, 1, 1], AP: { N: appearance } }))
    secret.node.set(PDFName.of('Annots'), pdf.context.obj([secretNote]))
    const pointer = pdf.context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [0, 0, 10, 10], AP: { N: appearance } })
    kept.node.set(PDFName.of('Annots'), pdf.context.obj([pdf.context.register(pointer)]))

    const saved = await exportPdf([await pdf.save({ useObjectStreams: false })], { pages: [ref(0, 0)], annotations: [], formValues: {} })
    expect(await containsMarker(saved)).toBe(false)
  })

  it('親から受け継ぐ資源が削除したページの描画命令を指していても、その中身は残らない', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([100, 100])
    const secret = pdf.addPage([100, 100])
    const secretContents = pdf.context.register(pdf.context.stream('% DELETED-PAGE-MARKER in contents\n'))
    secret.node.set(PDFName.of('Contents'), secretContents)
    const tree = pdf.catalog.Pages()
    tree.set(PDFName.of('Resources'), pdf.context.obj({ XObject: { Leak: secretContents } }))
    for (const page of pdf.getPages()) page.node.delete(PDFName.of('Resources'))

    const saved = await exportPdf([await pdf.save({ useObjectStreams: false })], { pages: [ref(0, 0)], annotations: [], formValues: {} })
    expect(await containsMarker(saved)).toBe(false)
  })

  /** 資源の辞書を共有する2ページの PDF。1ページ目の本文は content で描く */
  async function pagesSharingResources(content: string, resources: (pdf: PDFDocument) => PDFDict) {
    const pdf = await PDFDocument.create()
    const shared = pdf.context.register(resources(pdf))
    const kept = pdf.addPage([100, 100])
    const dropped = pdf.addPage([100, 100])
    kept.node.set(PDFName.of('Contents'), pdf.context.register(pdf.context.stream(content)))
    for (const page of [kept, dropped]) page.node.set(PDFName.of('Resources'), shared)
    return pdf
  }

  async function objectsContaining(saved: Uint8Array, text: string) {
    const objects = (await PDFDocument.load(saved)).context.enumerateIndirectObjects()
    return objects.filter(([, object]) => object.toString().includes(text)).length
  }

  it('残したページの本文が使う資源は、削除したページと共有していても残す', async () => {
    const pdf = await pagesSharingResources('BT /F1 12 Tf ET', (doc) =>
      doc.context.obj({ Font: { F1: doc.context.register(doc.context.obj({ Type: 'Font', BaseFont: 'SHARED-FONT-MARKER' })) } }),
    )
    const saved = await exportPdf([await pdf.save({ useObjectStreams: false })], { pages: [ref(0, 0)], annotations: [], formValues: {} })
    expect(await objectsContaining(saved, 'SHARED-FONT-MARKER')).toBeGreaterThan(0)
  })

  it('共有の資源の辞書にあっても、削除したページでしか使わない画像は残らない', async () => {
    const pdf = await pagesSharingResources('BT /F1 12 Tf ET', (doc) =>
      doc.context.obj({
        Font: { F1: doc.context.register(doc.context.obj({ Type: 'Font', BaseFont: 'Helvetica' })) },
        XObject: { Secret: doc.context.register(doc.context.stream('DELETED-PAGE-MARKER image', { Type: 'XObject', Subtype: 'Image' })) },
      }),
    )
    const saved = await exportPdf([await pdf.save({ useObjectStreams: false })], { pages: [ref(0, 0)], annotations: [], formValues: {} })
    expect(await containsMarker(saved)).toBe(false)
  })

  it('本文が使う埋め込みの図形も、その中で使わない資源は持ち込まない', async () => {
    const pdf = await pagesSharingResources('/Fm1 Do', (doc) => {
      const used = doc.context.register(doc.context.stream('USED-IMAGE-MARKER', { Type: 'XObject', Subtype: 'Image' }))
      const secret = doc.context.register(doc.context.stream('DELETED-PAGE-MARKER image', { Type: 'XObject', Subtype: 'Image' }))
      const form = doc.context.register(
        doc.context.stream('/Im1 Do', { Type: 'XObject', Subtype: 'Form', Resources: { XObject: { Im1: used, Secret: secret } } }),
      )
      return doc.context.obj({ XObject: { Fm1: form } })
    })
    const saved = await exportPdf([await pdf.save({ useObjectStreams: false })], { pages: [ref(0, 0)], annotations: [], formValues: {} })
    expect(await containsMarker(saved)).toBe(false)
    expect(await objectsContaining(saved, 'USED-IMAGE-MARKER')).toBeGreaterThan(0)
  })

  it('模様（Pattern）が持つ資源も、その模様で使わないものは持ち込まない', async () => {
    const pdf = await pagesSharingResources('/P1 scn', (doc) => {
      const secret = doc.context.register(doc.context.stream('DELETED-PAGE-MARKER image', { Type: 'XObject', Subtype: 'Image' }))
      const pattern = doc.context.register(
        doc.context.stream('0 0 1 1 re f', { PatternType: 1, Resources: { XObject: { Secret: secret } } }),
      )
      return doc.context.obj({ Pattern: { P1: pattern } })
    })
    const saved = await exportPdf([await pdf.save({ useObjectStreams: false })], { pages: [ref(0, 0)], annotations: [], formValues: {} })
    expect(await containsMarker(saved)).toBe(false)
  })

  it('描画命令を読めない図形の資源は、中身が分からないので持ち込まない', async () => {
    const pdf = await pagesSharingResources('/Fm1 Do', (doc) => {
      const secret = doc.context.register(doc.context.stream('DELETED-PAGE-MARKER image', { Type: 'XObject', Subtype: 'Image' }))
      const form = doc.context.register(
        doc.context.stream('unreadable', { Subtype: 'Form', Filter: 'JBIG2Decode', Resources: { XObject: { Secret: secret } } }),
      )
      return doc.context.obj({ XObject: { Fm1: form } })
    })
    const saved = await exportPdf([await pdf.save({ useObjectStreams: false })], { pages: [ref(0, 0)], annotations: [], formValues: {} })
    expect(await containsMarker(saved)).toBe(false)
  })

  describe('墨消し', () => {
    // 1×1 の黒い PNG
    const BLACK_PIXEL = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
      (c) => c.charCodeAt(0),
    )

    async function fileWithMarkedPage() {
      const pdf = await PDFDocument.create()
      const page = pdf.addPage([100, 200])
      page.node.set(PDFName.of('Contents'), pdf.context.register(pdf.context.stream('% REDACTED-TEXT-MARKER\n')))
      return pdf.save({ useObjectStreams: false })
    }

    const page = { ...ref(0, 0), width: 100, height: 200 }
    const redaction = { id: 'r', kind: 'redaction' as const, pageId: '0-0', x: 10, y: 10, width: 50, height: 20 }

    it('墨消しのあるページは画像に置き換わり、元の中身はファイルに残らない', async () => {
      const rasterized: unknown[] = []
      const saved = await exportPdf([await fileWithMarkedPage()], { pages: [page], annotations: [redaction], formValues: {} }, async (target, rects) => {
        rasterized.push({ page: target.id, rects })
        return { bytes: BLACK_PIXEL, format: 'png' }
      })

      expect(rasterized).toEqual([{ page: '0-0', rects: [redaction] }])
      const objects = (await PDFDocument.load(saved)).context.enumerateIndirectObjects()
      expect(objects.some(([, object]) => object.toString().includes('REDACTED-TEXT-MARKER'))).toBe(false)
      expect((await pagesOf(saved))[0].width).toBe(100)
    })

    it('画像にする手段がなければ、墨消しのある文書は保存せずにエラーにする', async () => {
      await expect(exportPdf([await fileWithMarkedPage()], { pages: [page], annotations: [redaction], formValues: {} })).rejects.toThrow()
    })
  })
})
