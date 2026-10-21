import type { ReactNode } from 'react'
import { RECT_PRESETS, type ShapeVariant } from '../annotations/types'
import { stampTexts, type TextMark, type Tool } from '../editor/tools'

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tool-group" role="group" aria-label={label}>
      <span className="tool-group-label">{label}</span>
      <div className="tool-group-items">{children}</div>
    </div>
  )
}

/**
 * Acrobat の「PDF を編集」「コメント」「入力と署名」の分け方にならって道具を並べる。
 * 道具を一列に並べると、どれが書類に残る編集で、どれが目印なのかが見分けにくいため
 */
export function ToolBar({
  tool,
  onToolChange,
  onChooseImage,
  onSign,
  onEditPageMarks,
}: {
  tool: Tool
  onToolChange: (tool: Tool) => void
  onChooseImage: () => void
  onSign: () => void
  onEditPageMarks: () => void
}) {
  const toggle = (next: Tool) => onToolChange(tool.kind === next.kind ? { kind: 'select' } : next)
  const isShape = tool.kind === 'shape' && tool.variant !== 'ink'
  const isPen = tool.kind === 'shape' && tool.variant === 'ink'

  return (
    <div className="tool-bar">
      <Group label="編集">
        <button
          aria-pressed={tool.kind === 'editText'}
          onClick={() => toggle({ kind: 'editText' })}
          title="元の PDF の文字の行を選んで書き換える。元の行は白塗りで隠し、同じ位置に打ち直す"
        >
          文字を編集
        </button>
        <button aria-pressed={tool.kind === 'text'} onClick={() => toggle({ kind: 'text' })} title="好きな場所に文字を置く">
          テキスト
        </button>
        <button aria-pressed={tool.kind === 'image'} onClick={onChooseImage} title="画像を選んで置く">
          画像
        </button>
      </Group>

      <Group label="コメント">
        <select
          value={tool.kind === 'markText' ? tool.mark : ''}
          onChange={(event) =>
            onToolChange(event.target.value ? { kind: 'markText', mark: event.target.value as TextMark } : { kind: 'select' })
          }
          aria-label="文字に印を付ける"
          data-active={tool.kind === 'markText'}
        >
          <option value="">文字に印…</option>
          <option value="highlight">ハイライト</option>
          <option value="underline">下線</option>
          <option value="strike">取り消し線</option>
        </select>
        <select
          value={isShape && tool.kind === 'shape' ? tool.variant : ''}
          onChange={(event) =>
            onToolChange(event.target.value ? { kind: 'shape', variant: event.target.value as ShapeVariant } : { kind: 'select' })
          }
          aria-label="図形"
          data-active={isShape}
        >
          <option value="">図形…</option>
          <option value="rectangle">□ 四角</option>
          <option value="ellipse">○ 楕円</option>
          <option value="line">― 線</option>
          <option value="arrow">→ 矢印</option>
        </select>
        <button
          aria-pressed={isPen}
          onClick={() => onToolChange(isPen ? { kind: 'select' } : { kind: 'shape', variant: 'ink' })}
          title="手書きで書き込む（Esc でやめる）"
        >
          ペン
        </button>
        <button
          aria-pressed={tool.kind === 'rect' && tool.style.opacity < 1}
          onClick={() =>
            onToolChange(tool.kind === 'rect' && tool.style.opacity < 1 ? { kind: 'select' } : { kind: 'rect', style: RECT_PRESETS[1].style })
          }
          title="半透明の黄色い四角を重ねて目立たせる"
        >
          マーカー
        </button>
      </Group>

      <Group label="入力と署名">
        <select
          value={tool.kind === 'stamp' ? tool.text : ''}
          onChange={(event) => onToolChange(event.target.value ? { kind: 'stamp', text: event.target.value } : { kind: 'select' })}
          aria-label="スタンプ"
          data-active={tool.kind === 'stamp'}
        >
          <option value="">✓ ✗ ○ 日付…</option>
          {stampTexts().map((text) => (
            <option key={text} value={text}>
              {text}
            </option>
          ))}
        </select>
        <button onClick={onSign} title="手書きの署名、名前の署名、印鑑を作って置く">
          署名・印鑑
        </button>
      </Group>

      <Group label="全ページ">
        <button onClick={onEditPageMarks} title="透かし、ヘッダー、フッター（ページ番号）を全ページに入れる">
          透かし・ページ番号
        </button>
      </Group>

      <Group label="隠す・消す">
        <button
          aria-pressed={tool.kind === 'rect' && tool.style.opacity === 1}
          onClick={() =>
            onToolChange(tool.kind === 'rect' && tool.style.opacity === 1 ? { kind: 'select' } : { kind: 'rect', style: RECT_PRESETS[0].style })
          }
          title="白い四角を重ねて見えなくする。下の文字はファイルに残り、コピーや検索で読める"
        >
          白塗り
        </button>
        <button
          aria-pressed={tool.kind === 'redaction'}
          onClick={() => toggle({ kind: 'redaction' })}
          title="範囲を黒く塗り、保存するときに下の文字や画像をファイルから消す"
        >
          墨消し
        </button>
      </Group>
    </div>
  )
}
