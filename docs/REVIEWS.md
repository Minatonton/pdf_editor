# ネットのレビューから取り入れたこと

PDF 編集アプリのレビューや掲示板を読み、このアプリの改善に使ったことを出どころ付きで残す。
取り入れなかったことも、理由と一緒に残しておく。あとで同じ議論に戻らないようにするため。

## 取り入れたこと

| 不満・称賛 | 出どころ | このアプリでの対応 |
|---|---|---|
| テキストボックスを置いても、フォントやサイズの設定が別の場所に隠れていて見つからない。置いた文字が欄に対して大きすぎる | Mac のプレビューへの不満（[Ask Dave Taylor](https://www.askdavetaylor.com/change-size-added-text-preview-pdf/)、[Apple Community](https://discussions.apple.com/thread/255075403)） | ページの上でそのまま入力・編集できるようにし、サイズは文字の横に出るツールバーと角のドラッグで変える |
| 白塗りで不要な文字や画像を消せるのが重宝する | Foxit PDF Editor のレビュー（[ITreview](https://www.itreview.jp/products/foxit-editor/reviews/155429)） | 白塗り（塗りつぶしの四角）を置けるようにする |
| 「済」のような丸い印を作りたいが丸の図形がない。印鑑のように手軽に作れるとよい | 同上 | ✓・✗・○・日付のスタンプと、名前から作る印鑑を用意する |
| フォームになっていない PDF に、文字・チェック・署名を置きたい | 記入ツールの紹介（[Adobe](https://www.adobe.com/acrobat/online/pdf-filler.html)、[Fill](https://www.fillhq.com/fill-and-sign-pdf)、[WPS](https://www.wps.com/feature/pdf-filler/)） | チェックのスタンプと、手書きの署名を描いて置ける機能 |
| 印鑑の画像を透過させる機能が見当たらない | 署名・印鑑アプリの調査（[App Store の各アプリ](https://apps.apple.com/jp/app/pdf-%E7%B7%A8%E9%9B%86-pdf%E3%82%92%E4%BD%9C%E6%88%90-%E7%B7%A8%E9%9B%86-%E7%BD%B2%E5%90%8D/id1591585643)） | 紙をスキャンした画像の白い背景を、その場で透明にできるようにする |
| ページの入れ替え・削除・回転・結合が簡単なのでほかのアプリが要らなくなった。一方で、離れた複数ページをまとめて削除できず手間 | 簡単PDF編集のレビュー（[App Store](https://apps.apple.com/jp/app/%E7%B0%A1%E5%8D%98pdf%E7%B7%A8%E9%9B%86/id1560227399)） | ページの一覧を出し、複数選んで削除・回転、ドラッグで並べ替え、別の PDF の追加ができるようにする |
| 無料だと思ったら保存に課金が必要で中途半端 | 同上 | 保存に制限を設けない（もともと無料・ローカル） |
| 機密の書類をクラウドに上げたくない | 記入ツールのまとめ（[Wild & Free Tools](https://wildandfreetools.com/blog/fill-pdf-reddit-best-free-2026/)） | 送信しないことを画面に明示し続ける |

## 方針を変えたこと

最初は「元の PDF の文字を直接書き換えたい」という要望を取り入れないことにしていた。
埋め込みフォントの一部しか入っていない PDF では、商用ソフトでも文字化けやフォントの置き換えが起きているため
（[Adobe Community](https://community.adobe.com/t5/type-typography-discussions/editing-text-in-a-pdf-and-all-of-a-sudden-the-font-changes/td-p/10332042)、[PDF Studio](https://kbpdfstudio.qoppa.com/warning-message-when-editing-text-content/)）。

Acrobat と同じ編集ができることを目標にしたので、元の文字を書き換える代わりに
「その行を白塗りで隠し、同じ位置・大きさで打ち直す」形で取り入れる。フォントは元と同じにはならない。
Acrobat の機能との対応は [ACROBAT_PARITY.md](ACROBAT_PARITY.md) にまとめている。

## 取り入れなかったこと

| 要望 | 出どころ | 取り入れない理由 |
|---|---|---|
| Office 形式への変換、OCR、パスワード保護 | Foxit のレビュー | 「上に置いて保存する」という目的から外れ、画面が複雑になる |
