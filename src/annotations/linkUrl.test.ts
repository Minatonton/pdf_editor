import { describe, expect, it } from 'vitest'
import { safeLinkUrl } from './linkUrl'

describe('safeLinkUrl', () => {
  it('http(s)・mailto・tel の URL はそのまま使う', () => {
    expect(safeLinkUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(safeLinkUrl('mailto:info@example.com')).toBe('mailto:info@example.com')
    expect(safeLinkUrl('tel:0312345678')).toBe('tel:0312345678')
  })

  it('方式を省いたものは https として扱う', () => {
    expect(safeLinkUrl('example.com')).toBe('https://example.com/')
  })

  it.each(['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'file:///etc/passwd', 'data:text/html,hi'])(
    '%s のように、開いた人の環境で何かを実行させうる方式は受け付けない',
    (input) => {
      expect(safeLinkUrl(input)).toBeNull()
    },
  )

  it('空やドメインになっていないものは受け付けない', () => {
    expect(safeLinkUrl('  ')).toBeNull()
    expect(safeLinkUrl('hello')).toBeNull()
  })
})
