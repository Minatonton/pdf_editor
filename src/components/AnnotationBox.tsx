import { useRef, useState, type PointerEvent } from 'react'
import type { EditorAction } from '../editor/document'
import { mimeTypeOf } from '../annotations/imageFile'
import { TEXT_FONT_FAMILY, TEXT_LINE_HEIGHT } from '../annotations/textRaster'
import { MIN_BOX_SIZE, type Annotation, type ImageAnnotation, type RectAnnotation } from '../annotations/types'

interface Drag {
  mode: 'move' | 'resize'
  startX: number
  startY: number
  /** 文字の大きさを変えるときの基準。ドラッグを始めたときの見た目の幅 */
  startWidth: number
  dx: number
  dy: number
}

/**
 * 画像の URL は解放せずに使い回す。元に戻す・やり直すで同じ画像が何度も現れるので、
 * 表示から消えたときに解放すると、戻したときに表示できなくなる
 */
const objectUrls = new WeakMap<Uint8Array, string>()

function objectUrlOf(image: ImageAnnotation): string {
  let url = objectUrls.get(image.bytes)
  if (!url) {
    url = URL.createObjectURL(new Blob([image.bytes as Uint8Array<ArrayBuffer>], { type: mimeTypeOf(image.format) }))
    objectUrls.set(image.bytes, url)
  }
  return url
}

export function AnnotationBox({
  annotation,
  scale,
  selected,
  editing,
  interactive,
  onSelect,
  onEdit,
  onEditEnd,
  dispatch,
}: {
  annotation: Annotation
  scale: number
  selected: boolean
  editing: boolean
  interactive: boolean
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onEditEnd: () => void
  dispatch: (action: EditorAction) => void
}) {
  // ドラッグ中は位置を手元だけで動かし、離したときに1回だけ履歴に積む。
  // 動かすたびに積むと、元に戻すがドラッグの途中の位置を1つずつたどることになる
  const [drag, setDrag] = useState<Drag | null>(null)
  const box = useRef<HTMLDivElement>(null)

  const begin = (mode: Drag['mode']) => (event: PointerEvent<HTMLElement>) => {
    if (!interactive || editing || event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    onSelect(annotation.id)
    event.currentTarget.setPointerCapture(event.pointerId)
    const startWidth = box.current!.offsetWidth
    setDrag({ mode, startX: event.clientX, startY: event.clientY, startWidth, dx: 0, dy: 0 })
  }

  const handleMove = (event: PointerEvent<HTMLElement>) => {
    if (!drag) return
    setDrag({ ...drag, dx: event.clientX - drag.startX, dy: event.clientY - drag.startY })
  }

  const handleEnd = () => {
    if (!drag) return
    const dx = drag.dx / scale
    const dy = drag.dy / scale
    if (drag.mode === 'move' && (dx !== 0 || dy !== 0)) dispatch({ type: 'move', id: annotation.id, dx, dy })
    if (drag.mode === 'resize' && annotation.kind !== 'text' && (dx !== 0 || dy !== 0)) {
      dispatch({ type: 'resize', id: annotation.id, ...resizedBox(annotation, dx, dy) })
    }
    if (drag.mode === 'resize' && annotation.kind === 'text' && dx !== 0) {
      dispatch({ type: 'editText', id: annotation.id, changes: { fontSize: resizedFontSize(annotation.fontSize, drag) } })
    }
    setDrag(null)
  }

  const moveX = drag?.mode === 'move' ? drag.dx / scale : 0
  const moveY = drag?.mode === 'move' ? drag.dy / scale : 0
  const style: React.CSSProperties = {
    left: (annotation.x + moveX) * scale,
    top: (annotation.y + moveY) * scale,
    pointerEvents: interactive ? 'auto' : 'none',
  }

  if (annotation.kind !== 'text') {
    const { width, height } =
      drag?.mode === 'resize' ? resizedBox(annotation, drag.dx / scale, drag.dy / scale) : annotation
    const fill: React.CSSProperties =
      // opacity を要素に付けると選択の枠やつまみまで薄くなるので、塗りの色だけを透かす
      annotation.kind === 'rect'
        ? {
            background: `color-mix(in srgb, ${annotation.color} ${annotation.opacity * 100}%, transparent)`,
            mixBlendMode: annotation.opacity < 1 ? 'multiply' : 'normal',
          }
        : {}
    return (
      <div
        ref={box}
        className={`annotation ${annotation.kind}`}
        data-selected={selected}
        style={{ ...style, ...fill, width: width * scale, height: height * scale }}
        onPointerDown={begin('move')}
        onPointerMove={handleMove}
        onPointerUp={handleEnd}
        onPointerCancel={handleEnd}
      >
        {annotation.kind === 'image' && <img src={objectUrlOf(annotation)} alt="" draggable={false} />}
        {selected && <span className="resize-handle" onPointerDown={begin('resize')} aria-label="大きさを変える" />}
      </div>
    )
  }

  const fontSize = drag?.mode === 'resize' ? resizedFontSize(annotation.fontSize, drag) : annotation.fontSize
  return (
    <div
      ref={box}
      className="annotation text"
      data-selected={selected}
      data-editing={editing}
      style={{
        ...style,
        fontFamily: TEXT_FONT_FAMILY,
        fontSize: fontSize * scale,
        lineHeight: TEXT_LINE_HEIGHT,
        color: annotation.color,
      }}
      onPointerDown={begin('move')}
      onPointerMove={handleMove}
      onPointerUp={handleEnd}
      onPointerCancel={handleEnd}
      onDoubleClick={() => onEdit(annotation.id)}
    >
      {editing ? (
        <textarea
          autoFocus
          value={annotation.text}
          placeholder="テキストを入力"
          rows={1}
          onFocus={(event) => {
            const end = event.currentTarget.value.length
            event.currentTarget.setSelectionRange(end, end)
          }}
          onChange={(event) => dispatch({ type: 'editText', id: annotation.id, changes: { text: event.target.value } })}
          onBlur={onEditEnd}
        />
      ) : (
        annotation.text || '\u00a0'
      )}
      {selected && !editing && (
        <span className="resize-handle" onPointerDown={begin('resize')} aria-label="文字の大きさを変える" />
      )}
    </div>
  )
}

function resizedBox(annotation: ImageAnnotation | RectAnnotation, dx: number, dy: number) {
  const width = Math.max(MIN_BOX_SIZE, annotation.width + dx)
  if (annotation.kind === 'image') return { width, height: (annotation.height * width) / annotation.width }
  return { width, height: Math.max(MIN_BOX_SIZE, annotation.height + dy) }
}

const MIN_FONT_SIZE = 4

/** 角を引いて広げた幅の割合だけ、文字を大きくする */
function resizedFontSize(fontSize: number, drag: Drag): number {
  const ratio = (drag.startWidth + drag.dx) / drag.startWidth
  return Math.max(MIN_FONT_SIZE, Math.round(fontSize * ratio * 2) / 2)
}
