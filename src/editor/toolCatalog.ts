import { RECT_PRESETS } from '../annotations/types'
import type { IconName } from '../components/Icon'
import { stampTexts, type Tool } from './tools'

/** 道具を選ぶのではなく、画面を開くもの（画像を選ぶ、署名を作る…） */
export type ToolCommand = 'chooseImage' | 'sign' | 'pageMarks' | 'organizePages'

export interface ToolEntry {
  id: string
  label: string
  icon: IconName
  title: string
  run: { tool: Tool } | { command: ToolCommand }
}

export interface ToolCategory {
  id: string
  label: string
  icon: IconName
  entries: ToolEntry[]
}

const SYMBOL_STAMPS: Record<string, string> = { '✓': 'check', '✗': 'cross', '○': 'circle' }

/**
 * 今の道具が、一覧のどの項目にあたるか。ツールパネルとクイックツールの両方で、
 * 選んでいる項目を同じ基準で目立たせるために使う
 */
export function entryIdOf(tool: Tool): string {
  switch (tool.kind) {
    case 'markText':
      return tool.mark
    case 'shape':
      return tool.variant === 'ink' ? 'pen' : tool.variant
    case 'rect':
      return tool.style.opacity < 1 ? 'marker' : 'whiteout'
    case 'stamp':
      return SYMBOL_STAMPS[tool.text] ?? 'date'
    default:
      return tool.kind
  }
}

/** 定番の書類編集アプリの「すべてのツール」の分け方にならう */
export function toolCategories(): ToolCategory[] {
  const [, , , date] = stampTexts()
  const tool = (t: Tool) => ({ tool: t })
  const command = (c: ToolCommand) => ({ command: c })
  return [
    {
      id: 'edit',
      label: 'PDF を編集',
      icon: 'editText',
      entries: [
        { id: 'editText', label: '文字を編集', icon: 'editText', title: '元の文字の行を選んで書き換える', run: tool({ kind: 'editText' }) },
        { id: 'text', label: 'テキストを追加', icon: 'text', title: '好きな場所に文字を置く', run: tool({ kind: 'text' }) },
        { id: 'image', label: '画像を追加', icon: 'image', title: '画像を選んで置く', run: command('chooseImage') },
        { id: 'link', label: 'リンク', icon: 'link', title: '範囲を描いて URL やページへのリンクにする', run: tool({ kind: 'link' }) },
        { id: 'pageMarks', label: '透かし・ページ番号', icon: 'watermark', title: '全ページに透かし・ヘッダー・フッターを入れる', run: command('pageMarks') },
      ],
    },
    {
      id: 'comment',
      label: 'コメント',
      icon: 'note',
      entries: [
        { id: 'note', label: '付箋', icon: 'note', title: '付箋を貼ってコメントを書く', run: tool({ kind: 'note' }) },
        { id: 'highlight', label: 'ハイライト', icon: 'highlight', title: '元の文字の上をドラッグしてハイライトする', run: tool({ kind: 'markText', mark: 'highlight' }) },
        { id: 'underline', label: '下線', icon: 'underline', title: '元の文字に下線を引く', run: tool({ kind: 'markText', mark: 'underline' }) },
        { id: 'strike', label: '取り消し線', icon: 'strike', title: '元の文字に取り消し線を引く', run: tool({ kind: 'markText', mark: 'strike' }) },
        { id: 'pen', label: 'ペン', icon: 'pen', title: '手書きで書き込む', run: tool({ kind: 'shape', variant: 'ink' }) },
        { id: 'marker', label: 'マーカー', icon: 'marker', title: '半透明の黄色い四角を重ねる', run: tool({ kind: 'rect', style: RECT_PRESETS[1].style }) },
        { id: 'rectangle', label: '四角', icon: 'rectangle', title: 'ドラッグして四角を描く', run: tool({ kind: 'shape', variant: 'rectangle' }) },
        { id: 'ellipse', label: '楕円', icon: 'ellipse', title: 'ドラッグして楕円を描く', run: tool({ kind: 'shape', variant: 'ellipse' }) },
        { id: 'line', label: '線', icon: 'line', title: 'ドラッグして線を引く', run: tool({ kind: 'shape', variant: 'line' }) },
        { id: 'arrow', label: '矢印', icon: 'arrow', title: 'ドラッグして矢印を引く', run: tool({ kind: 'shape', variant: 'arrow' }) },
      ],
    },
    {
      id: 'fill',
      label: '入力と署名',
      icon: 'sign',
      entries: [
        { id: 'sign', label: '署名・印鑑', icon: 'sign', title: '手書きの署名、名前の署名、印鑑を作って置く', run: command('sign') },
        { id: 'check', label: 'チェック', icon: 'check', title: '✓ を置く', run: tool({ kind: 'stamp', text: '✓' }) },
        { id: 'cross', label: 'バツ', icon: 'cross', title: '✗ を置く', run: tool({ kind: 'stamp', text: '✗' }) },
        { id: 'circle', label: 'マル', icon: 'circle', title: '○ を置く', run: tool({ kind: 'stamp', text: '○' }) },
        { id: 'date', label: '今日の日付', icon: 'calendar', title: `${date} を置く`, run: tool({ kind: 'stamp', text: date }) },
      ],
    },
    {
      id: 'organize',
      label: 'ページを整理',
      icon: 'pages',
      entries: [
        { id: 'organizePages', label: 'ページを整理', icon: 'pages', title: 'ページの回転・削除・並べ替え・追加・抜き出し・トリミング', run: command('organizePages') },
      ],
    },
    {
      id: 'protect',
      label: '隠す・墨消し',
      icon: 'redact',
      entries: [
        { id: 'redaction', label: '墨消し', icon: 'redact', title: '範囲を黒く塗り、保存するときに下の内容ごと消す', run: tool({ kind: 'redaction' }) },
        { id: 'whiteout', label: '白塗り', icon: 'whiteout', title: '白い四角で見えなくする。下の文字はファイルに残る', run: tool({ kind: 'rect', style: RECT_PRESETS[0].style }) },
      ],
    },
  ]
}
