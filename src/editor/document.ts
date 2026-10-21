import { resizeBox } from '../annotations/boxSize'
import type { Annotation, RectStyle, ShapeStyle, TextAnnotation } from '../annotations/types'
import { NO_PAGE_MARKS, type PageMarks } from './pageMarks'
import { normalizeRotation, pdfToViewPoint, viewToPdfPoint, type PageBox, type Rotation } from '../pdf/geometry'

/** 保存する PDF の1ページ。どのファイルの何ページ目を、どの向きで使うか */
export interface PageRef {
  id: string
  file: number
  index: number
  /** 元の PDF の /Rotate を含めた、表示と保存に使う最終的な向き */
  rotation: Rotation
  /** 回転させる前（/Rotate が 0 のとき）の幅と高さ */
  width: number
  height: number
}

/** 白紙のページは元になるファイルを持たないので、ファイル番号の代わりにこれを入れる */
export const BLANK_PAGE_FILE = -1

/** PDF のフォームの欄に入れた値。チェックボックスは on/off、ラジオボタンと選択肢は選んだ値の名前 */
export type FieldValue = string | boolean

export interface EditorDocument {
  pages: PageRef[]
  annotations: Annotation[]
  /** 欄の名前は同じ文書の中でしか一意でないので、ファイル番号と組にした fieldKey で引く */
  formValues: Record<string, FieldValue>
  /** 透かし・ヘッダー・フッター。保存するときに全ページへ入れる */
  pageMarks: PageMarks
}

export function fieldKey(file: number, name: string): string {
  return `${file}:${name}`
}

export interface History {
  past: EditorDocument[]
  present: EditorDocument
  future: EditorDocument[]
  /** 直前の操作が文字や欄への入力だったときの対象。続けて同じものに入力したら1回の操作にまとめる */
  typingTarget?: string
}

export type EditorAction =
  | { type: 'open'; pages: PageRef[] }
  | { type: 'add'; annotation: Annotation }
  /** 1回の操作として元に戻せるよう、まとめて置く（元の文字の編集では白塗りと打ち直した文字を同時に置く） */
  | { type: 'addMany'; annotations: Annotation[] }
  | { type: 'move'; id: string; dx: number; dy: number }
  | { type: 'resize'; id: string; width: number; height: number }
  | { type: 'editRect'; id: string; changes: Partial<RectStyle> }
  | { type: 'editShape'; id: string; changes: Partial<ShapeStyle> }
  | { type: 'editText'; id: string; changes: Partial<Pick<TextAnnotation, 'text' | 'fontSize' | 'color'>> }
  | { type: 'remove'; id: string }
  | { type: 'editNote'; id: string; text: string }
  | { type: 'replaceImage'; id: string; bytes: Uint8Array; format: 'png' | 'jpeg' }
  | { type: 'setField'; key: string; value: FieldValue }
  | { type: 'setPageMark'; mark: keyof PageMarks; value: string }
  | { type: 'rotatePages'; ids: string[]; degrees: 90 | -90 }
  | { type: 'removePages'; ids: string[] }
  /** ids のページを、残りのページの並びで index の位置に移す（ids の順番は今の並び順を保つ） */
  | { type: 'movePages'; ids: string[]; index: number }
  | { type: 'insertPages'; pages: PageRef[]; index: number }
  | { type: 'undo' }
  | { type: 'redo' }

export const EMPTY_HISTORY: History = { past: [], present: { pages: [], annotations: [], formValues: {}, pageMarks: NO_PAGE_MARKS }, future: [] }

export function viewSizeOf(page: PageRef): { width: number; height: number } {
  const turned = page.rotation === 90 || page.rotation === 270
  return turned ? { width: page.height, height: page.width } : { width: page.width, height: page.height }
}

export function rotateBy(rotation: Rotation, degrees: number): Rotation {
  return normalizeRotation(rotation + degrees)
}

/**
 * ページを回しても、置いたものは紙の同じ場所に留め、向きは画面に対して正立させたままにする。
 * 置いたものごと回すと、テキストが横倒しになって読めなくなるため。
 * テキストは大きさが分からないので左上を、四角や画像は中心を、紙の同じ場所に合わせる
 */
function rotateAnnotation(annotation: Annotation, page: PageRef, rotation: Rotation): Annotation {
  const box: PageBox = { left: 0, bottom: 0, right: page.width, top: page.height }
  const keepPoint = (x: number, y: number) => {
    const onPaper = viewToPdfPoint(x, y, box, page.rotation)
    return pdfToViewPoint(onPaper.x, onPaper.y, box, rotation)
  }
  if (annotation.kind === 'text' || annotation.kind === 'note') return { ...annotation, ...keepPoint(annotation.x, annotation.y) }
  const center = keepPoint(annotation.x + annotation.width / 2, annotation.y + annotation.height / 2)
  return { ...annotation, x: center.x - annotation.width / 2, y: center.y - annotation.height / 2 }
}

/** 1文字ずつの入力を、同じ対象に続けて打つあいだは1回の操作にまとめる */
function typed(history: History, target: string, present: EditorDocument): History {
  if (history.typingTarget === target) return { ...history, present }
  return { ...commit(history, present), typingTarget: target }
}

function commit(history: History, present: EditorDocument): History {
  return { past: [...history.past, history.present], present, future: [] }
}

function updateAnnotation(history: History, id: string, change: (annotation: Annotation) => Annotation): History {
  const { present } = history
  return commit(history, {
    ...present,
    annotations: present.annotations.map((annotation) => (annotation.id === id ? change(annotation) : annotation)),
  })
}

export function editorReducer(history: History, action: EditorAction): History {
  const { present } = history
  switch (action.type) {
    case 'open':
      return { past: [], present: { pages: action.pages, annotations: [], formValues: {}, pageMarks: NO_PAGE_MARKS }, future: [] }
    case 'add':
      return commit(history, { ...present, annotations: [...present.annotations, action.annotation] })
    case 'addMany':
      return commit(history, { ...present, annotations: [...present.annotations, ...action.annotations] })
    case 'move':
      return updateAnnotation(history, action.id, (a) => ({ ...a, x: a.x + action.dx, y: a.y + action.dy }))
    case 'resize':
      return updateAnnotation(history, action.id, (a) =>
        a.kind === 'text' || a.kind === 'note' ? a : { ...a, ...resizeBox(a, action.width, action.height) },
      )
    case 'editRect':
      return updateAnnotation(history, action.id, (a) => (a.kind === 'rect' ? { ...a, ...action.changes } : a))
    case 'editShape':
      return updateAnnotation(history, action.id, (a) => (a.kind === 'shape' ? { ...a, ...action.changes } : a))
    case 'editText': {
      const edit = (a: Annotation) => (a.id === action.id && a.kind === 'text' ? { ...a, ...action.changes } : a)
      const edited = { ...present, annotations: present.annotations.map(edit) }
      return typed(history, action.id, edited)
    }
    case 'replaceImage':
      return updateAnnotation(history, action.id, (a) =>
        a.kind === 'image' ? { ...a, bytes: action.bytes, format: action.format } : a,
      )
    case 'editNote':
      return typed(history, action.id, {
        ...present,
        annotations: present.annotations.map((a) => (a.id === action.id && a.kind === 'note' ? { ...a, text: action.text } : a)),
      })
    case 'setPageMark':
      return typed(history, `mark:${action.mark}`, { ...present, pageMarks: { ...present.pageMarks, [action.mark]: action.value } })
    case 'setField':
      return typed(history, `field:${action.key}`, {
        ...present,
        formValues: { ...present.formValues, [action.key]: action.value },
      })
    case 'remove':
      return commit(history, { ...present, annotations: present.annotations.filter((a) => a.id !== action.id) })
    case 'rotatePages': {
      const ids = new Set(action.ids)
      const rotated = new Map(
        present.pages.filter((page) => ids.has(page.id)).map((page) => [page.id, rotateBy(page.rotation, action.degrees)]),
      )
      const pageById = new Map(present.pages.map((page) => [page.id, page]))
      return commit(history, {
        ...present,
        pages: present.pages.map((page) => (rotated.has(page.id) ? { ...page, rotation: rotated.get(page.id)! } : page)),
        annotations: present.annotations.map((annotation) =>
          rotated.has(annotation.pageId)
            ? rotateAnnotation(annotation, pageById.get(annotation.pageId)!, rotated.get(annotation.pageId)!)
            : annotation,
        ),
      })
    }
    case 'removePages': {
      const ids = new Set(action.ids)
      if (present.pages.every((page) => ids.has(page.id))) return history
      return commit(history, {
        ...present,
        pages: present.pages.filter((page) => !ids.has(page.id)),
        annotations: present.annotations.filter((annotation) => !ids.has(annotation.pageId)),
      })
    }
    case 'movePages': {
      const ids = new Set(action.ids)
      const moving = present.pages.filter((page) => ids.has(page.id))
      const rest = present.pages.filter((page) => !ids.has(page.id))
      const pages = [...rest.slice(0, action.index), ...moving, ...rest.slice(action.index)]
      if (pages.every((page, i) => page === present.pages[i])) return history
      return commit(history, { ...present, pages })
    }
    case 'insertPages':
      return commit(history, {
        ...present,
        pages: [...present.pages.slice(0, action.index), ...action.pages, ...present.pages.slice(action.index)],
      })
    case 'undo': {
      const previous = history.past.at(-1)
      if (!previous) return history
      return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] }
    }
    case 'redo': {
      const [next, ...rest] = history.future
      if (!next) return history
      return { past: [...history.past, history.present], present: next, future: rest }
    }
  }
}
