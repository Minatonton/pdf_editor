import { AnnotationMode, type PDFPageProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { viewSizeOf, visibleRectOf, type EditorAction, type FieldValue, type PageRef } from '../editor/document'
import { expandMark, type PageMarks } from '../editor/pageMarks'
import type { Annotation } from '../annotations/types'
import { baselineOffset } from '../annotations/textRaster'
import { linesOfBox, snap, type Guide, type SnapLines } from '../editor/snap'
import { boundsOf, type Point, type ViewRect } from '../pdf/geometry'
import { textLinesOf } from '../pdf/pageText'
import { linesInRect, type TextRun } from '../pdf/textRuns'

import { AnnotationBox } from './AnnotationBox'
import { FormLayer } from './FormLayer'
import { SelectionToolbar } from './SelectionToolbar'

export function PageView({
  page,
  proxy,
  pageNumber,
  pageCount,
  pageOptions,
  pageMarks,
  showFullPage,
  scale,
  annotations,
  selectedId,
  editingId,
  placing,
  drawMode,
  onPlace,
  onDraw,
  textMode,
  onPickText,
  onMarkText,
  fieldValueOf,
  onFieldChange,
  onSelect,
  onEdit,
  onEditEnd,
  onRemove,
  dispatch,
}: {
  page: PageRef
  /** 白紙のページには元になる PDF のページがない */
  proxy: PDFPageProxy | undefined
  pageNumber: number
  pageCount: number
  /** リンクの移り先に選べるページ */
  pageOptions: { id: string; label: string }[]
  pageMarks: PageMarks
  /** トリミングの範囲を描き直すときは、切り取る前のページ全体を見せる */
  showFullPage: boolean
  scale: number
  annotations: Annotation[]
  selectedId: string | null
  editingId: string | null
  placing: boolean
  /** クリックではなく、ドラッグで描いて置く。box は始点と終点だけ、ink はなぞった点をすべて渡す */
  drawMode: 'box' | 'ink' | null
  onPlace: (pageId: string, x: number, y: number) => void
  onDraw: (pageId: string, points: Point[]) => void
  /** 元の PDF の文字の行を示す。pick はクリックで1行選び、mark はドラッグした範囲の行に印を付ける */
  textMode: 'pick' | 'mark' | null
  onPickText: (pageId: string, line: TextRun) => void
  onMarkText: (pageId: string, lines: TextRun[]) => void
  fieldValueOf: (name: string) => FieldValue | undefined
  onFieldChange: (name: string, value: FieldValue) => void
  onSelect: (id: string | null) => void
  onEdit: (id: string) => void
  onEditEnd: () => void
  onRemove: (id: string) => void
  dispatch: (action: EditorAction) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = viewSizeOf(page)
  const visible = showFullPage ? { x: 0, y: 0, ...size } : visibleRectOf(page)
  const selected = annotations.find((annotation) => annotation.id === selectedId)
  const [drawing, setDrawing] = useState<Point[] | null>(null)
  // 描き終えた直後に続けて届く click を、何もない所のクリック（選択の解除）として扱わないための印
  const justDrew = useRef(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [guides, setGuides] = useState<Guide[]>([])

  const snapTargets = (movingId: string): SnapLines => {
    const overlay = overlayRef.current!
    const origin = overlay.getBoundingClientRect()
    const targets: SnapLines = { xs: [], ys: [] }
    const add = (lines: SnapLines) => {
      targets.xs.push(...lines.xs)
      targets.ys.push(...lines.ys)
    }
    for (const element of overlay.querySelectorAll<HTMLElement>('.annotation[data-id]')) {
      if (element.dataset.id === movingId) continue
      const r = element.getBoundingClientRect()
      const box = { x: (r.left - origin.left) / scale, y: (r.top - origin.top) / scale, width: r.width / scale, height: r.height / scale }
      const other = annotations.find((annotation) => annotation.id === element.dataset.id)
      add(linesOfBox(box, other?.kind === 'text' ? box.y + baselineOffset(other.fontSize) : undefined))
    }
    for (const line of textLines ?? []) add({ xs: [{ at: line.x, kind: 'edge' }], ys: [{ at: line.baseline, kind: 'baseline' }] })
    add({ xs: [{ at: visible.x + visible.width / 2, kind: 'center' }], ys: [{ at: visible.y + visible.height / 2, kind: 'center' }] })
    return targets
  }

  const handleSnap = (id: string, box: ViewRect, baseline: number | undefined, free: boolean) => {
    if (free) {
      setGuides([])
      return { dx: 0, dy: 0 }
    }
    // 画面の上で 6px 以内に近づいたら吸い寄せる。拡大していても縮小していても同じ手応えにするため
    const snapped = snap(linesOfBox(box, baseline), snapTargets(id), 6 / scale)
    setGuides(snapped.guides)
    return snapped
  }
  const [textLines, setTextLines] = useState<TextRun[] | null>(null)

  useEffect(() => {
    // 元の文字の行は、印を付ける・書き換えるときだけでなく、置いたものを行に吸い寄せるときにも使う
    if (!proxy) return
    let cancelled = false
    void textLinesOf(proxy, page.rotation).then((lines) => {
      if (!cancelled) setTextLines(lines)
    })
    return () => {
      cancelled = true
    }
  }, [proxy, page.rotation])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!proxy || !canvas) return
    const viewport = proxy.getViewport({ scale, rotation: page.rotation })
    // 高解像度の画面でぼやけないよう、表示する大きさより画素数を多くして描く
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * ratio)
    canvas.height = Math.floor(viewport.height * ratio)
    const task = proxy.render({
      canvas,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      // フォームの欄は上に入力欄を重ねるので、元の値の見た目は描かない。描くと入れ直した値と二重に見える
      annotationMode: AnnotationMode.ENABLE_FORMS,
    })
    task.promise.catch((error: unknown) => {
      if ((error as Error).name !== 'RenderingCancelledException') console.error(error)
    })
    return () => task.cancel()
  }, [proxy, page.rotation, scale])

  // pointerdown で置くと、その後の mousedown がフォーカスを奪い、置いた直後のテキストの入力欄から外れてしまう
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (justDrew.current) {
      justDrew.current = false
      return
    }
    if (event.target !== event.currentTarget || event.button !== 0 || drawMode || textMode) return
    if (!placing) {
      onSelect(null)
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    onPlace(page.id, (event.clientX - bounds.left) / scale, (event.clientY - bounds.top) / scale)
  }

  const pointInPage = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) / scale, y: (event.clientY - bounds.top) / scale }
  }

  const drawnRect = drawing && boundsOf(drawing)

  const drawHandlers = drawMode
    ? {
        onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          setDrawing([pointInPage(event)])
        },
        onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
          const point = pointInPage(event)
          setDrawing((current) => current && (drawMode === 'ink' ? [...current, point] : [current[0], point]))
        },
        // 指を離した位置は、最後の描画を待たずにこのイベントから取る。素早く引くと描画が追いつかないため
        onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
          if (!drawing) return
          const last = pointInPage(event)
          const points = drawMode === 'ink' ? [...drawing, last] : [drawing[0], last]
          if (textMode === 'mark') onMarkText(page.id, linesInRect(textLines ?? [], boundsOf(points)))
          else onDraw(page.id, points)
          justDrew.current = true
          setDrawing(null)
        },
      }
    : {}

  return (
    <div className="page" id={`page-${page.id}`} style={{ width: visible.width * scale, height: visible.height * scale }}>
      <div className="page-clip">
        {proxy && (
          <canvas
            ref={canvasRef}
            style={{ left: -visible.x * scale, top: -visible.y * scale, width: size.width * scale, height: size.height * scale }}
          />
        )}
      </div>
      {/* 置いたものは切り取る前のページの座標で持つので、重ねる層もページ全体の大きさにしてずらす */}
      <div
        ref={overlayRef}
        className="page-overlay"
        data-placing={placing}
        style={{ left: -visible.x * scale, top: -visible.y * scale, width: size.width * scale, height: size.height * scale }}
        onClick={handleClick}
        {...drawHandlers}
      >
        {drawing && drawMode === 'ink' && (
          <svg className="drawing-ink" width="100%" height="100%">
            <polyline
              points={drawing.map((p) => `${p.x * scale},${p.y * scale}`).join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {drawnRect && drawMode === 'box' && (
          <div
            className="drawing-rect"
            style={{
              left: drawnRect.x * scale,
              top: drawnRect.y * scale,
              width: drawnRect.width * scale,
              height: drawnRect.height * scale,
            }}
          />
        )}
        <div
          className="page-marks"
          aria-hidden
          style={{
            left: visible.x * scale,
            top: visible.y * scale,
            width: visible.width * scale,
            height: visible.height * scale,
            fontSize: 10 * scale,
          }}
        >
          {pageMarks.header && <div className="page-mark header">{expandMark(pageMarks.header, pageNumber, pageCount)}</div>}
          {pageMarks.watermark && (
            <div className="page-mark watermark" style={{ fontSize: (Math.min(visible.width, visible.height) / 8) * scale }}>
              {expandMark(pageMarks.watermark, pageNumber, pageCount)}
            </div>
          )}
          {pageMarks.footer && <div className="page-mark footer">{expandMark(pageMarks.footer, pageNumber, pageCount)}</div>}
        </div>
        {proxy && (
          <FormLayer
            proxy={proxy}
            rotation={page.rotation}
            scale={scale}
            valueOf={fieldValueOf}
            onChange={onFieldChange}
            interactive={!drawMode}
          />
        )}
        {textMode &&
          textLines?.map((line, i) => (
            <button
              key={i}
              className="text-line"
              data-mode={textMode}
              title={line.text}
              style={{ left: line.x * scale, top: line.y * scale, width: line.width * scale, height: line.height * scale }}
              onClick={(event) => {
                event.stopPropagation()
                onPickText(page.id, line)
              }}
            />
          ))}
        {annotations.map((annotation) => (
          <AnnotationBox
            key={annotation.id}
            annotation={annotation}
            scale={scale}
            selected={annotation.id === selectedId}
            editing={annotation.id === editingId}
            // クリックで置く道具を持っていても、置いたものはつかめるようにする。道具を持ち替えないと動かせないと、
            // どのモードなら動かせるのか迷わせてしまう。範囲を描く道具のときだけは、描き始めとつかむ操作がぶつかるのでつかめない
            interactive={!drawMode}
            onSelect={onSelect}
            onEdit={onEdit}
            onEditEnd={onEditEnd}
            onSnap={handleSnap}
            onSnapEnd={() => setGuides([])}
            dispatch={dispatch}
          />
        ))}
        {guides.map((guide, i) => (
          <div
            key={i}
            className={`snap-guide ${guide.axis}`}
            style={guide.axis === 'x' ? { left: guide.at * scale } : { top: guide.at * scale }}
          />
        ))}
        {selected && !drawMode && (
          <SelectionToolbar annotation={selected} scale={scale} pageOptions={pageOptions} onRemove={() => onRemove(selected.id)} dispatch={dispatch} />
        )}
      </div>
      <span className="page-number">
        {pageNumber}
      </span>
    </div>
  )
}
