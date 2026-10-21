import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { LoadedImage } from '../annotations/imageFile'
import { Dialog } from './Dialog'
import { sealImage, trimmedImage, typedSignature } from '../annotations/signature'

type Mode = 'draw' | 'type' | 'seal'

export type SignatureKind = 'signature' | 'seal'

const INK_COLORS = ['#111111', '#1d3f8f']
const TYPE_FONTS = [
  { label: '明朝', value: "'Hiragino Mincho ProN', 'Yu Mincho', serif" },
  { label: 'ゴシック', value: "'Noto Sans JP', sans-serif" },
  { label: '筆記体', value: "'Snell Roundhand', 'Segoe Script', cursive" },
]

const PAD_WIDTH = 480
const PAD_HEIGHT = 180

function DrawPad({ color, padRef }: { color: string; padRef: React.RefObject<HTMLCanvasElement | null> }) {
  const last = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = padRef.current!
    const ratio = window.devicePixelRatio || 1
    canvas.width = PAD_WIDTH * ratio
    canvas.height = PAD_HEIGHT * ratio
    canvas.getContext('2d')!.scale(ratio, ratio)
  }, [padRef])

  const pointOf = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }

  return (
    <canvas
      ref={padRef}
      className="sign-pad"
      style={{ width: PAD_WIDTH, height: PAD_HEIGHT }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        last.current = pointOf(event)
      }}
      onPointerMove={(event) => {
        if (!last.current) return
        const point = pointOf(event)
        const context = event.currentTarget.getContext('2d')!
        context.strokeStyle = color
        context.lineWidth = 3
        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.beginPath()
        context.moveTo(last.current.x, last.current.y)
        context.lineTo(point.x, point.y)
        context.stroke()
        last.current = point
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
    />
  )
}

export function SignatureDialog({
  onCreate,
  onClose,
}: {
  onCreate: (image: LoadedImage, kind: SignatureKind) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<Mode>('draw')
  const [color, setColor] = useState(INK_COLORS[0])
  const [name, setName] = useState('')
  const [font, setFont] = useState(TYPE_FONTS[0].value)
  const [sealPreview, setSealPreview] = useState<string | null>(null)
  const pad = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (mode !== 'seal') return
    let cancelled = false
    let url: string | null = null
    void sealImage(name || '印').then((image) => {
      if (cancelled || !image) return
      url = URL.createObjectURL(new Blob([image.bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
      setSealPreview(url)
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [mode, name])

  const create = async () => {
    const image =
      mode === 'draw'
        ? await trimmedImage(pad.current!)
        : mode === 'type'
          ? await typedSignature(name, font, color)
          : await sealImage(name)
    if (image) onCreate(image, mode === 'seal' ? 'seal' : 'signature')
  }

  const ready = mode === 'draw' || name.trim() !== ''

  return (
    <Dialog title="署名・印鑑を作る" onClose={onClose}>
        <div className="tabs" role="tablist">
          {(
            [
              ['draw', '手書き'],
              ['type', '名前を入力'],
              ['seal', '印鑑'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} role="tab" aria-selected={mode === value} onClick={() => setMode(value)}>
              {label}
            </button>
          ))}
        </div>

        {mode === 'draw' && (
          <>
            <DrawPad color={color} padRef={pad} />
            <div className="row">
              {INK_COLORS.map((ink) => (
                <button key={ink} className="swatch" aria-pressed={color === ink} style={{ background: ink }} onClick={() => setColor(ink)} />
              ))}
              <button
                onClick={() => {
                  const canvas = pad.current!
                  canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
                }}
              >
                消す
              </button>
            </div>
          </>
        )}

        {mode === 'type' && (
          <>
            <input autoFocus placeholder="氏名" value={name} onChange={(event) => setName(event.target.value)} />
            <div className="type-preview" style={{ fontFamily: font, color }}>
              {name || '氏名'}
            </div>
            <div className="row">
              {TYPE_FONTS.map((option) => (
                <button key={option.label} aria-pressed={font === option.value} onClick={() => setFont(option.value)}>
                  {option.label}
                </button>
              ))}
              {INK_COLORS.map((ink) => (
                <button key={ink} className="swatch" aria-pressed={color === ink} style={{ background: ink }} onClick={() => setColor(ink)} />
              ))}
            </div>
          </>
        )}

        {mode === 'seal' && (
          <>
            <input autoFocus placeholder="姓（4文字まで）" maxLength={4} value={name} onChange={(event) => setName(event.target.value)} />
            <div className="seal-preview">{sealPreview && <img src={sealPreview} alt="印鑑の見本" />}</div>
          </>
        )}

        <p className="note">作った署名や印鑑はこの画面を閉じると消え、どこにも保存・送信されない</p>
        <div className="dialog-actions">
          <button onClick={onClose}>やめる</button>
          <button className="primary" disabled={!ready} onClick={() => void create()}>
            置く場所を選ぶ
          </button>
        </div>
    </Dialog>
  )
}
