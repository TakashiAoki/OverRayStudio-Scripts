# CSUM_GotoTime

数値と四則演算子(`+ - * /`)を使って、After Effects のタイムラインを指定した時間へ素早く移動させるスクリプトです。**アニメ撮影タイムシート(1 コマ目スタート / 24fps)** の入力スタイルに最適化されています。

![Version](https://img.shields.io/badge/version-1.7-blue) ![After Effects](https://img.shields.io/badge/After_Effects-CC%2B-9999ff) ![License](https://img.shields.io/badge/license-MIT-green)

---

## 特徴

- アニメタイムシート表記(`1+12` = 1 秒 12 コマ)で直接ジャンプできる
- 1Sheet(タイムシート 1 枚分のコマ数)を任意設定可能 — 6 秒シート(144f)、3 秒シート(72f) など
- 相対値モードで現在時間からの加減算ジャンプも可
- ウィンドウ位置・1Sheet 値を自動記憶

---

## インストール

1. `CSUM_GotoTime.jsx` を After Effects の Scripts フォルダに配置:
   - **macOS**: `/Applications/Adobe After Effects [version]/Scripts/`
   - **Windows**: `C:\Program Files\Adobe\Adobe After Effects [version]\Support Files\Scripts\`
2. After Effects を再起動
3. メニュー「ファイル」→「スクリプト」→「CSUM_GotoTime.jsx」で実行

ScriptUI Panels に置けばパネルとしても利用できますが、本スクリプトは単発実行型(ダイアログベース)です。

---

## 使い方

スクリプト実行時にダイアログが表示されます。

### Mode

| モード | 用途 |
|---|---|
| **Absolute** | アニメタイムシート表記で絶対位置にジャンプ |
| **Relative** | 数式で相対 / 絶対計算してジャンプ |

### Absolute(絶対値)モード

整数と `+` / `-` のみ使用可能。

| 入力 | 1Sheet | 移動先 | 説明 |
|---|---|---|---|
| `1+12` | (任意) | 36 コマ目 | 1 秒 12 コマ = 24+12 |
| `2-66` | 144 | 210 コマ目 | 6 秒シート 2 ページ目 66 コマ目 |
| `2-12` | 72  | 84 コマ目  | 3 秒シート 2 ページ目 12 コマ目 |

`+` 区切り → 「秒+コマ」の表記
`-` 区切り → 「シート番号-そのシート内コマ」の表記

### Relative(相対値)モード

数値(小数点可)と `+ - * /` が使えます。

| 入力 | 動作 |
|---|---|
| `+12`     | 現在時間から +12 コマ |
| `-24`     | 現在時間から -24 コマ |
| `144+`    | 現在時間 + 144 コマ |
| `2*`      | 現在時間 × 2 |
| `252+12`  | 現在時間を無視して 264 コマ目へ |
| `120-24+6`| 現在時間を無視して 102 コマ目へ |

頭または尻に演算子があれば現在時間と組み合わせ、両端が数値なら現在時間を無視して計算結果へ移動します。

---

## 仕様メモ

- **1 コマ目スタート前提**: `displayStartTime` が 0 のコンポでは「フレーム 1 = time 0」として動作します
- **マイナスフレームへは移動できません**(0 にクランプ)
- **コンポ尺を超える指定**は自動的にコンポ末尾にクランプされます
- 1Sheet 値は AE の preferences に保存され、次回起動時も保持されます

---

## 動作確認環境

- Adobe After Effects CC 以降
- macOS / Windows 両対応

---

## 更新履歴

### v1.7 (2026-05-09)
- 全体を IIFE でラップしてグローバル汚染を解消
- ダイアログを × で閉じた際の `Btnon` 未定義バグを修正
- フレーム計算の浮動小数点誤差対策(`Math.round`)
- コンポ尺を超える指定の自動クランプを追加
- 古い AE 11(CS5.5)互換コードを削除
- ヘルプテキスト・ヘッダーのバージョン整合
- 関数名に紛れ込んでいた全角スペースを除去

### v1.6 以前 (2007-2018)
内部開発版。

---

## ライセンス

[MIT License](../LICENSE)

## 作者

**青木 隆 (Takashi Aoki)** / Over Ray Studio
[@voyager_vision](https://x.com/voyager_vision) / [GitHub](https://github.com/TakashiAoki)
