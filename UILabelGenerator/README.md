# UILabelGenerator

Illustrator で選択したボタンパスに、AI が生成した UI ラベルテキストを自動配置するスクリプトです。SF 作品のモニターグラフィックス(FUI)制作における、大量のボタン・表示要素へのラベル入れを効率化します。

![Version](https://img.shields.io/badge/version-2.0.0-blue) ![Illustrator](https://img.shields.io/badge/Illustrator-CC%2B-ff9a00) ![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey) ![License](https://img.shields.io/badge/license-MIT-green)

---

## v2 アーキテクチャ(エージェント駆動)

v2 では制御を反転し、AI エージェント(Claude Code 等)が Illustrator を外部から駆動します。
スクリプト側から API を呼ぶ仕組み(常駐ブリッジ + ファイル監視 + ポーリング)を丸ごと廃止したため、
**API キー・常駐アプリ・待機フリーズが不要**になりました。

```
v1: Illustrator(jsx) → tmpファイル → 常駐Python → Claude API → ポーリング待機(最大90秒)
v2: AIエージェント → COM(Win) / osascript(Mac) → collect.jsx で形状回収
    → エージェント自身がラベル生成 → place.jsx で配置
```

| ファイル | 役割 |
|---|---|
| `UILG_collect.jsx` | 選択シェイプの寸法・グリッド構造・塗色を解析し JSON で返す |
| `UILG_place.jsx` | テンポラリの入力 JSON(ラベル配列+フォント設定)を読み、`UI_Labels` レイヤーに配置 |

- 実行エージェント側の呼び出し例(Windows / PowerShell + COM):
  `(New-Object -ComObject Illustrator.Application).DoJavaScript($jsxCode)`
- macOS は `osascript -l JavaScript` の `doJavascript` で同じ jsx を実行可能
- 既存の `UI_Label` テキストは配置前に自動クリア(会話しながら何度でも再生成できる)
- 配置先は専用レイヤー `UI_Labels`(非表示・ロック中レイヤーには触れない)
- グリッド検出は v1 を継承: 行列構造 + 縦長キー(ENTER 等) + 横長キー(0 等)を認識

v1(ダイアログ UI 版・下記)も引き続き利用できます。連番・テンキー・電話キーの
固定割り当てはオフラインで動作するため、AI を介さない単独実行に向いています。

---

## v1(スタンドアロン版)

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
