/** 全ページに入れる文字。空文字なら入れない。{n} はページ番号、{total} は総ページ数に置き換える */
export interface PageMarks {
  watermark: string
  header: string
  footer: string
}

export const NO_PAGE_MARKS: PageMarks = { watermark: '', header: '', footer: '' }

export function expandMark(template: string, pageNumber: number, total: number): string {
  return template.replaceAll('{n}', String(pageNumber)).replaceAll('{total}', String(total))
}
