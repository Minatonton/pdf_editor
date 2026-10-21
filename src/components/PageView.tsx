import { AnnotationMode, type PDFPageProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { viewSizeOf, visibleRectOf, type EditorAction, type FieldValue, type PageRef } from '../editor/document'
import { expandMark, type PageMarks } from '../editor/pageMarks'
import type { Annotation } from '../annotations/types'
import { boundsOf, type Point } from '../pdf/geometry'
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
  const [textLines, setTextLines] = useState<TextRun[] | null>(null)

  useEffect(() => {
    if (!textMode || !proxy) return
    let cancelled = false
    void textLinesOf(proxy, page.rotation).then((lines) => {
      if (!cancelled) setTextLines(lines)
    })
    return () => {
      cancelled = true
    }
  }, [textMode, proxy, page.rotation])

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
            interactive={!placing}
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
            interactive={!placing}
            onSelect={onSelect}
            onEdit={onEdit}
            onEditEnd={onEditEnd}
            dispatch={dispatch}
          />
        ))}
        {selected && !placing && (
          <SelectionToolbar annotation={selected} scale={scale} pageOptions={pageOptions} onRemove={() => onRemove(selected.id)} dispatch={dispatch} />
        )}
      </div>
      <span className="page-number">
        {pageNumber}
      </span>
    </div>
  )
}
