# AdobeApiBridge

Adobe アプリ(ExtendScript / JSX)と Claude API をつなぐ、汎用のファイル監視ブリッジです。ExtendScript からは直接 HTTPS 通信ができないため、Python がリクエストファイルを監視して API 呼び出しを代行します。

![Version](https://img.shields.io/badge/version-1.0.5-blue) ![Python](https://img.shields.io/badge/Python-3.x-3776ab) ![Platform](https://img.shields.io/badge/platform-macOS-lightgrey) ![License](https://img.shields.io/badge/license-MIT-green)

---

## 仕組み

```
JSXスクリプト                    adobe_api_bridge.py
    │ ① _aab_req.json を書く          │
    │ ② _aab_ready を作成 ──────────▶ │ ③ リクエスト検出
    │                                 │ ④ Claude API 呼び出し
    │ ⑥ _aab_resp.json を読む ◀────── │ ⑤ レスポンス書き込み
```

| ファイル(`/private/tmp/`) | 役割 |
|---|---|
| `_aab_req.json` | リクエスト: `{ "api_key": "sk-ant-...", "body": { ...API リクエスト body... } }` |
| `_aab_ready` | JSX 側が書き込み完了後に作成する空フラグ(書き込み途中の読み取りを防止) |
| `_aab_resp.json` | レスポンス: `{ "ok": true, "response": {...} }` または `{ "ok": false, "error": "..." }` |

- API キーはリクエストごとに JSX 側から渡され、ブリッジ自体は保持しません
- 529 (Overloaded) は自動リトライ(最大 3 回・待機時間漸増)

---

## 使い方

ターミナルから直接起動:

```bash
python3 adobe_api_bridge.py
```

または Automator で「アプリケーション」として包み(`AdobeApiBridge.app`)、`Contents/Resources/` に本スクリプトを同梱しておくと、ダブルクリックで常駐できます。

起動後、[UILabelGenerator](../UILabelGenerator/) などの対応 JSX スクリプトを実行すると自動的に通信します。

---

## 仕様メモ

- **macOS 専用**(`/private/tmp` パス前提)
- 標準ライブラリのみで動作(追加パッケージ不要)
- ポーリング間隔 0.5 秒

---

## ライセンス

[MIT License](../LICENSE)

## 作者

**青木 隆 (Takashi Aoki)** / Over Ray Studio
[@voyager_vision](https://x.com/voyager_vision) / [GitHub](https://github.com/TakashiAoki)
