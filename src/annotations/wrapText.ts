/** 行の頭に来てはいけない文字（閉じ括弧・句読点など）。前の行の終わりにぶら下げる */
const NO_LINE_START = /^[、。，．,.)\]）」』】〕〉》！？!?ー〜…‥ゝゞヽヾぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ・：；:;]/

/**
 * 1つの段落を、折り返せる単位に分ける。英数字の単語は途中で切らず、それ以外（和文）は1文字ずつ切れる
 */
function tokensOf(paragraph: string): string[] {
  return paragraph.match(/[A-Za-z0-9'’.,\-_@/:]+\s*|\s+|./gu) ?? []
}

/**
 * 文字を、幅 width に収まるように行に分ける。画面の表示と保存する画像で同じ結果になるよう、
 * ブラウザの折り返しに任せず、ここで決めた行を両方で使う。
 * 1語だけで幅を超えるときは、その語を文字の途中で切る
 */
export function wrapText(text: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const token of tokensOf(paragraph)) {
      if (measure(line + token.trimEnd()) <= width || line === '') {
        if (line === '' && measure(token.trimEnd()) > width) {
          // 1語で幅を超えるので文字ごとに詰める
          for (const char of token) {
            if (line !== '' && measure(line + char) > width) {
              lines.push(line)
              line = ''
            }
            line += char
          }
          continue
        }
        line += token
        continue
      }
      // 行の頭に来てはいけない文字は、幅を少し超えても前の行に残す
      if (NO_LINE_START.test(token)) {
        line += token
        continue
      }
      lines.push(line.trimEnd())
      line = token.trimStart()
    }
    lines.push(line.trimEnd())
  }
  return lines
}
