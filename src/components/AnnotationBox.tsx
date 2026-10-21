import { useRef, useState, type PointerEvent } from 'react'
import type { EditorAction } from '../editor/document'
import { mimeTypeOf } from '../annotations/imageFile'
import { baselineOffset, TEXT_FONT_FAMILY, TEXT_LINE_HEIGHT } from '../annotations/textRaster'
import type { ViewRect } from '../pdf/geometry'
import { resizeBox } from '../annotations/boxSize'
import { shapePath } from '../annotations/shapePath'
import { NOTE_ICON_SIZE, type Annotation, type BoxAnnotation, type ImageAnnotation } from '../annotations/types'

interface Drag {
  mode: 'move' | 'resize'
  startX: number
  startY: number
  /** 文字の大きさを変えるときの基準。ドラッグを始めたときの見た目の幅 */
  startWidth: number
  startHeight: number
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
  groupOffset,
  onGroupDrag,
  onMoved,
  onSnap,
  onSnapEnd,
  dispatch,
}: {
  annotation: Annotation
  scale: number
  selected: boolean
  editing: boolean
  interactive: boolean
  onSelect: (id: string, additive?: boolean) => void
  onEdit: (id: string) => void
  onEditEnd: () => void
  /** ほかの選んだものがつかまれて動いている途中のずれ（画面の画素）。自分がつかまれているときは使わない */
  groupOffset: { dx: number; dy: number } | null
  /** 複数選んでいるとき、動かしている途中のずれをほかの選んだものに伝える */
  onGroupDrag?: (offset: { dx: number; dy: number } | null) => void
  onMoved: (id: string, dx: number, dy: number) => void
  /** 動かした先の箱（と文字の基準線）を渡すと、吸い寄せるためにずらす量を返す。free のときは吸い寄せない */
  onSnap: (id: string, box: ViewRect, baseline: number | undefined, free: boolean) => { dx: number; dy: number }
  onSnapEnd: () => void
  dispatch: (action: EditorAction) => void
}) {
  // ドラッグ中は位置を手元だけで動かし、離したときに1回だけ履歴に積む。
  // 動かすたびに積むと、元に戻すがドラッグの途中の位置を1つずつたどることになる
  const [drag, setDrag] = useState<Drag | null>(null)
  const box = useRef<HTMLDivElement>(null)

  /** whileEditing はつまみから始めたとき。入力中でも、つまみをつかめば入力を終えずに動かせる */
  const begin = (mode: Drag['mode'], whileEditing = false) => (event: PointerEvent<HTMLElement>) => {
    if (!interactive || (editing && !whileEditing) || event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    if (event.shiftKey && mode === 'move') {
      // Shift を押しながら押したときは、選ぶものを足し引きするだけで動かさない
      onSelect(annotation.id, true)
      return
    }
    onSelect(annotation.id)
    event.currentTarget.setPointerCapture(event.pointerId)
    const { offsetWidth: startWidth, offsetHeight: startHeight } = box.current!
    setDrag({ mode, startX: event.clientX, startY: event.clientY, startWidth, startHeight, dx: 0, dy: 0 })
  }

  /** 押した位置からのずれ（画面の画素）。動かすときは吸い寄せた分も足す */
  const deltaOf = (current: Drag, event: PointerEvent<HTMLElement>) => {
    let dx = event.clientX - current.startX
    let dy = event.clientY - current.startY
    if (current.mode === 'move') {
      const moved = {
        x: annotation.x + dx / scale,
        y: annotation.y + dy / scale,
        width: current.startWidth / scale,
        height: current.startHeight / scale,
      }
      const baseline = annotation.kind === 'text' ? moved.y + baselineOffset(annotation.fontSize) : undefined
      const snapped = onSnap(annotation.id, moved, baseline, event.altKey)
      dx += snapped.dx * scale
      dy += snapped.dy * scale
    }
    return { dx, dy }
  }

  const handleMove = (event: PointerEvent<HTMLElement>) => {
    if (!drag) return
    const delta = deltaOf(drag, event)
    if (drag.mode === 'move') onGroupDrag?.(delta)
    setDrag({ ...drag, ...delta })
  }

  // 離した位置は、最後の描画を待たずにこのイベントから取る。素早く動かすと描画が追いつかず、ずれて置かれるため
  const handleEnd = (event: PointerEvent<HTMLElement>) => {
    if (!drag) return
    const final = { ...drag, ...deltaOf(drag, event) }
    onSnapEnd()
    const dx = final.dx / scale
    const dy = final.dy / scale
    if (drag.mode === 'move') {
      if (dx !== 0 || dy !== 0) onMoved(annotation.id, dx, dy)
      else onGroupDrag?.(null)
    }
    if (drag.mode === 'resize' && annotation.kind !== 'text' && annotation.kind !== 'note' && (dx !== 0 || dy !== 0)) {
      dispatch({ type: 'resize', id: annotation.id, ...resizedBox(annotation, dx, dy) })
    }
    if (drag.mode === 'resize' && annotation.kind === 'text' && dx !== 0) {
      dispatch({ type: 'editText', id: annotation.id, changes: { fontSize: resizedFontSize(annotation.fontSize, final) } })
    }
    setDrag(null)
  }

  const offset = drag?.mode === 'move' ? drag : drag ? null : groupOffset
  const moveX = offset ? offset.dx / scale : 0
  const moveY = offset ? offset.dy / scale : 0
  const style: React.CSSProperties = {
    left: (annotation.x + moveX) * scale,
    top: (annotation.y + moveY) * scale,
    pointerEvents: interactive ? 'auto' : 'none',
  }

  if (annotation.kind === 'note') {
    return (
      <div
        ref={box}
        className="annotation note"
        data-id={annotation.id}
        data-selected={selected}
        title={annotation.text || '付箋'}
        style={{ ...style, width: NOTE_ICON_SIZE * scale, height: NOTE_ICON_SIZE * scale }}
        onPointerDown={begin('move')}
        onPointerMove={handleMove}
        onPointerUp={handleEnd}
        onPointerCancel={handleEnd}
      >
        <svg viewBox="0 0 20 20" width="100%" height="100%" aria-hidden>
          <path d="M2 2h16v12h-8l-4 4v-4H2z" fill="#ffd43b" stroke="#a37c00" strokeWidth="1" strokeLinejoin="round" />
          <path d="M5 6h10M5 9h7" stroke="#a37c00" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    )
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
        data-id={annotation.id}
        data-selected={selected}
        style={{ ...style, ...fill, width: width * scale, height: height * scale }}
        onPointerDown={begin('move')}
        onPointerMove={handleMove}
        onPointerUp={handleEnd}
        onPointerCancel={handleEnd}
      >
        {annotation.kind === 'image' && <img src={objectUrlOf(annotation)} alt="" draggable={false} />}
        {annotation.kind === 'shape' && (
          // viewBox で拡大させず、画面の画素で描く。水平や垂直の線は箱の幅か高さが 0 になり、viewBox では描けないため。
          // 線の太さぶん箱の外にはみ出すので、外も見えるようにしておく
          <svg width={Math.max(width * scale, 1)} height={Math.max(height * scale, 1)} overflow="visible">
            <path
              d={shapePath({
                ...annotation,
                width: width * scale,
                height: height * scale,
                strokeWidth: annotation.strokeWidth * scale,
              })}
              fill="none"
              stroke={annotation.color}
              strokeWidth={annotation.strokeWidth * scale}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {selected && <span className="resize-handle" onPointerDown={begin('resize')} aria-label="大きさを変える" />}
      </div>
    )
  }

  const fontSize = drag?.mode === 'resize' ? resizedFontSize(annotation.fontSize, drag) : annotation.fontSize
  return (
    <div
      ref={box}
      className="annotation text"
      data-id={annotation.id}
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
      {selected && (
        // 入力中は文字の上を押すとカーソルの移動になるので、動かすためのつまみを枠の外に出す
        <span className="move-grip" onPointerDown={begin('move', true)} title="ドラッグして動かす" aria-label="動かす">
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
            {[3, 9].flatMap((x) => [3, 6, 9].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" fill="currentColor" />))}
          </svg>
        </span>
      )}
      {selected && !editing && (
        <span className="resize-handle" onPointerDown={begin('resize')} aria-label="文字の大きさを変える" />
      )}
    </div>
  )
}

function resizedBox(annotation: BoxAnnotation, dx: number, dy: number) {
  return resizeBox(annotation, annotation.width + dx, annotation.height + dy)
}

const MIN_FONT_SIZE = 4

/** 角を引いて広げた幅の割合だけ、文字を大きくする */
function resizedFontSize(fontSize: number, drag: Drag): number {
  const ratio = (drag.startWidth + drag.dx) / drag.startWidth
  return Math.max(MIN_FONT_SIZE, Math.round(fontSize * ratio * 2) / 2)
}
