import type { EditorAction } from '../editor/document'
import type { Annotation } from '../annotations/types'

const FONT_SIZES = [8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 64, 72]

export function Inspector({
  annotation,
  dispatch,
}: {
  annotation: Annotation | undefined
  dispatch: (action: EditorAction) => void
}) {
  if (!annotation) {
    return (
      <aside className="inspector">
        <h2>使い方</h2>
        <ol className="hints">
          <li>「テキスト」か「画像」を選び、ページの置きたい場所をクリックする</li>
          <li>置いたものはドラッグで動かせる。画像は右下の角で大きさを変えられる</li>
          <li>「PDF を保存」で、書き込んだ PDF をダウンロードする</li>
        </ol>
        <dl className="shortcuts">
          <dt>Delete</dt>
          <dd>選んでいるものを消す</dd>
          <dt>矢印キー</dt>
          <dd>1pt ずつ動かす（Shift で 10pt）</dd>
          <dt>⌘Z / ⌘⇧Z</dt>
          <dd>元に戻す / やり直す</dd>
          <dt>Esc</dt>
          <dd>選択や配置をやめる</dd>
        </dl>
      </aside>
    )
  }

  const remove = <button className="danger" onClick={() => dispatch({ type: 'remove', id: annotation.id })}>削除</button>

  if (annotation.kind === 'image') {
    return (
      <aside className="inspector">
        <h2>画像</h2>
        <label>
          幅（pt）
          <input
            type="number"
            min={8}
            value={Math.round(annotation.width)}
            onChange={(event) => {
              const width = Number(event.target.value)
              if (width > 0) dispatch({ type: 'resizeImage', id: annotation.id, width })
            }}
          />
        </label>
        <p className="note">縦横比は保ったまま変わる</p>
        {remove}
      </aside>
    )
  }

  return (
    <aside className="inspector">
      <h2>テキスト</h2>
      <label>
        内容
        <textarea
          // 置いた直後にそのまま打ち始められるよう、選ぶたびに入力欄へ移して全体を選んでおく
          key={annotation.id}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          rows={4}
          value={annotation.text}
          onChange={(event) => dispatch({ type: 'editText', id: annotation.id, changes: { text: event.target.value } })}
        />
      </label>
      <div className="row">
        <label>
          サイズ
          <select
            value={annotation.fontSize}
            onChange={(event) =>
              dispatch({ type: 'editText', id: annotation.id, changes: { fontSize: Number(event.target.value) } })
            }
          >
            {[...new Set([...FONT_SIZES, annotation.fontSize])]
              .sort((a, b) => a - b)
              .map((size) => (
                <option key={size} value={size}>
                  {size}pt
                </option>
              ))}
          </select>
        </label>
        <label>
          色
          <input
            type="color"
            value={annotation.color}
            onChange={(event) => dispatch({ type: 'editText', id: annotation.id, changes: { color: event.target.value } })}
          />
        </label>
      </div>
      {remove}
    </aside>
  )
}
