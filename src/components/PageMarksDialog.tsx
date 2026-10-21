import type { EditorAction } from '../editor/document'
import type { PageMarks } from '../editor/pageMarks'

const WATERMARK_PRESETS = ['社外秘', '複製禁止', '下書き', 'CONFIDENTIAL', 'DRAFT']
const NUMBER_PRESETS = ['{n} / {total}', '- {n} -', '{n}']

/** 入れた内容はページにそのまま映るので、確かめながら決められるよう、閉じるまで値を即座に反映する */
export function PageMarksDialog({
  marks,
  dispatch,
  onClose,
}: {
  marks: PageMarks
  dispatch: (action: EditorAction) => void
  onClose: () => void
}) {
  const set = (mark: keyof PageMarks, value: string) => dispatch({ type: 'setPageMark', mark, value })

  return (
    <div className="dialog-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="透かし・ヘッダー・フッター">
        <h2>透かし・ヘッダー・フッター</h2>
        <label className="field">
          透かし（全ページの中央に斜めに薄く入れる）
          <input value={marks.watermark} placeholder="例：社外秘" onChange={(event) => set('watermark', event.target.value)} />
        </label>
        <div className="row">
          {WATERMARK_PRESETS.map((preset) => (
            <button key={preset} aria-pressed={marks.watermark === preset} onClick={() => set('watermark', preset)}>
              {preset}
            </button>
          ))}
        </div>
        <label className="field">
          ヘッダー（上の余白の中央）
          <input value={marks.header} placeholder="例：2026年度 事業計画" onChange={(event) => set('header', event.target.value)} />
        </label>
        <label className="field">
          フッター（下の余白の中央）
          <input value={marks.footer} placeholder="例：{n} / {total}" onChange={(event) => set('footer', event.target.value)} />
        </label>
        <div className="row">
          <span className="note">ページ番号：</span>
          {NUMBER_PRESETS.map((preset) => (
            <button key={preset} aria-pressed={marks.footer === preset} onClick={() => set('footer', preset)}>
              {preset.replace('{n}', '1').replace('{total}', '10')}
            </button>
          ))}
        </div>
        <p className="note">{'{n}'} はページ番号、{'{total}'} は総ページ数に置き換わる。空にすると入れない</p>
        <div className="dialog-actions">
          <button className="primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
