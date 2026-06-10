# UILabelGenerator

Illustrator で選択したボタンパスに、Claude API で生成した UI ラベルテキストを自動配置するスクリプトです。SF 作品のモニターグラフィックス(FUI)制作における、大量のボタン・表示要素へのラベル入れを効率化します。

![Version](https://img.shields.io/badge/version-1.2.12-blue) ![Illustrator](https://img.shields.io/badge/Illustrator-CC%2B-ff9a00) ![Platform](https://img.shields.io/badge/platform-macOS-lightgrey) ![License](https://img.shields.io/badge/license-MIT-green)

---

## 特徴

- 選択したパスオブジェクト群の位置・サイズを解析し、文脈に合った英語 UI ラベルを AI が一括生成
- 作品・画面の世界観をプリセット(`presets.json`)とキーワードで指定可能
- 用語集 CSV による語彙コントロールに対応(カテゴリ絞り込み付き)
- フォント・サイズ・整列・アンカー位置を指定して即テキスト配置
- 前回設定を `config.json` に自動記憶

---

## 必要なもの

| ファイル | 役割 |
|---|---|
| `UILabelGenerator.jsx` | 本体(Illustrator 用) |
| `config.json` | API キーと前回設定(`config.json.example` をコピーして作成) |
| `presets.json` | 作品・画面プリセット定義 |
| [AdobeApiBridge](../AdobeApiBridge/) | Claude API との通信ブリッジ(別途起動が必要) |
| 用語集 CSV(任意) | `MG_Glossary_*.csv` をスクリプトと同じフォルダに置くと語彙参照に使用 |

Anthropic の API キー([console.anthropic.com](https://console.anthropic.com/) で取得)が必要です。

---

## インストール

1. このフォルダ一式を任意の場所に配置
2. `config.json.example` を `config.json` にコピーし、`anthropic_api_key` に API キーを記入
3. [AdobeApiBridge](../AdobeApiBridge/) をセットアップして起動
4. Illustrator でボタンパスを選択 → 「ファイル」→「スクリプト」→「その他のスクリプト」から `UILabelGenerator.jsx` を実行

---

## 使い方

1. ラベルを入れたいパスオブジェクトを 1 つ以上選択してスクリプトを実行
2. ダイアログでプリセット・キーワード・スタイル・フォント等を設定
3. OK でボタン情報が API に送信され、生成されたラベルが各パス上に配置されます

---

## 仕様メモ

- **macOS 専用**(AdobeApiBridge が `/private/tmp` 経由のファイル監視で動作するため)
- ブリッジ未起動時はエラーメッセージで起動方法を案内します
- API キーは `config.json` にのみ保存され、リポジトリには含まれません(`.gitignore` 済み)

---

## ライセンス

[MIT License](../LICENSE)

## 作者

**青木 隆 (Takashi Aoki)** / Over Ray Studio
[@voyager_vision](https://x.com/voyager_vision) / [GitHub](https://github.com/TakashiAoki)
