import type { PDFPageProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import type { Rotation } from './geometry'
import { groupIntoLines, runFromItem, type Matrix, type TextRun } from './textRuns'

export async function textLinesOf(proxy: PDFPageProxy, rotation: Rotation): Promise<TextRun[]> {
  const viewport = proxy.getViewport({ scale: 1, rotation })
  const content = await proxy.getTextContent()
  const runs = content.items
    .filter((item): item is TextItem => 'str' in item)
    .map((item) => runFromItem(item, viewport.transform as Matrix))
    .filter((run): run is TextRun => run !== null)
  return groupIntoLines(runs)
}
