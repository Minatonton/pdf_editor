/**
 * リンクに入れてよい URL にそろえる。http(s)・mailto・tel 以外は受け付けない。
 * javascript: や file: のリンクを PDF に埋め込むと、開いた人のビューアーで意図しない動作をさせられるため。
 * 「example.com」のように方式を省いたものは https として扱う
 */
export function safeLinkUrl(input: string): string | null {
  const text = input.trim()
  if (text === '') return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return null
  if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.hostname.includes('.')) return null
  // 丸括弧と逆スラッシュは PDF の文字列の区切りと逃がし文字なので、URL の書き方のまま残さず % で書き換える
  return url.href.replace(/[()\\]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}
