/**
 * 道具のアイコン。24×24 の枠に線で描き、色は文字の色を使う（選択中は青になる）。
 * 外部のアイコン集を読み込まずに済むよう、使う分だけをここに描いている
 */
const PATHS = {
  select: 'M5 3l13 7.5-5.5 1.5L10 17.5z',
  editText: 'M4 6h10M9 6v12M14 18l5-5 2 2-5 5h-2z',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  image: 'M4 5h16v14H4zM4 16l4.5-5 3.5 4 2.5-3 5.5 4M15 9.5a1.5 1.5 0 1 0 0-.01',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  note: 'M4 4h16v12h-9l-5 4v-4H4zM8 8.5h8M8 11.5h5',
  highlight: 'M4 20h16M7 16l3-9h4l3 9M8.5 12h7',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 20h14',
  strike: 'M4 12h16M16 7.5C15.4 5.5 13.8 4.5 12 4.5c-2.5 0-4 1.4-4 3.2 0 1.5 1 2.4 3 3M8 16.5c.6 2 2.2 3 4 3 2.5 0 4-1.4 4-3.2 0-.8-.3-1.5-.8-2',
  rectangle: 'M4 6h16v12H4z',
  ellipse: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z',
  line: 'M5 19L19 5',
  arrow: 'M5 19L19 5M10 5h9v9',
  pen: 'M4 20c3-1 4-4 6-6s5-2 6-4-1-4-3-2-3 6-6 8-3 4-3 4zM15 4l5 5',
  marker: 'M4 20h7M14 4l6 6-8 8H6v-6zM11 7l6 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  cross: 'M6 6l12 12M18 6L6 18',
  circle: 'M12 5a7 7 0 1 0 0 14 7 7 0 1 0 0-14z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  sign: 'M3 18c2-4 4-10 6-10s-1 9 1 9 3-6 5-6-1 5 1 5 3-2 5-2M3 21h18',
  seal: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM10 8v8M14 8v8M10 12h4',
  watermark: 'M4 4h16v16H4zM7 17L17 7M9 7h2M13 17h2',
  whiteout: 'M4 6h16v12H4zM8 10h8M8 14h5',
  redact: 'M4 7h16v4H4zM4 14h11v4H4z',
  pages: 'M7 3h10v18H7zM4 6v12M20 6v12',
  rotateLeft: 'M4 4v6h6M4.5 15a8 8 0 1 0 2-8.5L4 10',
  rotateRight: 'M20 4v6h-6M19.5 15a8 8 0 1 1-2-8.5L20 10',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
  blankPage: 'M6 3h9l4 4v14H6zM15 3v4h4M12 11v6M9 14h6',
  insertFile: 'M6 3h9l4 4v14H6zM15 3v4h4M9 14h6M13 11l3 3-3 3',
  extract: 'M6 3h9l4 4v14H6zM15 3v4h4M12 17v-6M9 14l3 3 3-3',
  crop: 'M7 3v14h14M3 7h14v14',
  uncrop: 'M4 4h16v16H4zM9 4v16M4 9h16',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  zoomIn: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13zM15.5 15.5L20 20M10.5 7.5v6M7.5 10.5h6',
  zoomOut: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13zM15.5 15.5L20 20M7.5 10.5h6',
  fitWidth: 'M3 5v14M21 5v14M7 12h10M7 12l3-3M7 12l3 3M17 12l-3-3M17 12l-3 3',
  open: 'M3 7h6l2 2h10v10H3zM3 7V5h6',
  save: 'M12 4v11M7 10l5 5 5-5M5 19h14',
  tools: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  panelRight: 'M4 4h16v16H4zM15 4v16',
  panelLeft: 'M4 4h16v16H4zM9 4v16',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon-svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
