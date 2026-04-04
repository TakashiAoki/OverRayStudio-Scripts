#!/usr/bin/env python3
# adobe_api_bridge.py  Ver.1.0.5
# Copyright (c) 2026 Over Ray Studio / Takashi Aoki
# LastUpdate: 2026/04/04
#
# AdobeアプリとClaude APIをつなぐ汎用ファイル監視ブリッジ。
# Automatorアプリ（AdobeApiBridge.app）の Resources/ に同梱して使用。
#
# リクエスト形式: /private/tmp/_aab_req.json
#   { "api_key": "sk-ant-...", "body": { ...Anthropic APIリクエストbody... } }
# レスポンス形式: /private/tmp/_aab_resp.json
#   { "ok": true,  "response": { ...Anthropic APIレスポンス... } }
#   { "ok": false, "error": "エラーメッセージ" }
# 完了フラグ: /private/tmp/_aab_ready
#   JSX側がreq.jsonを書き終えた後に作成する空ファイル。
#   Pythonはこのファイルを監視することで書き込み中の競合を回避する。

import json
import time
import os
import urllib.request
import urllib.error

REQ_PATH   = "/private/tmp/_aab_req.json"
LOCK_PATH  = "/private/tmp/_aab_req.json.lock"
RESP_PATH  = "/private/tmp/_aab_resp.json"
READY_PATH = "/private/tmp/_aab_ready"   # JSX側が書き込み完了後に作成するフラグ
POLL_SEC   = 0.5

def call_api(api_key: str, body: dict) -> dict:
    data = json.dumps(body).encode("utf-8")
    req  = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data    = data,
        headers = {
            "Content-Type":      "application/json",
            "x-api-key":         api_key,
            "anthropic-version": "2023-06-01",
        },
        method = "POST",
    )
    max_retries = 3
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 529 and attempt < max_retries - 1:
                wait = (attempt + 1) * 10  # 10秒、20秒と増やす
                print(f"  → 529 Overloaded. {wait}秒後にリトライ ({attempt + 1}/{max_retries - 1})...")
                time.sleep(wait)
                continue
            raise

def process():
    # リネームして排他処理。readyフラグ削除後もreq.jsonの書き込みが
    # 僅かに遅延する場合に備え、最大3回・100msインターバルでリトライ
    for attempt in range(3):
        try:
            os.rename(REQ_PATH, LOCK_PATH)
            break
        except OSError:
            if attempt < 2:
                time.sleep(0.1)
                continue
            print("  → req.json が見つかりませんでした（スキップ）")
            return

    result = None
    try:
        with open(LOCK_PATH, "r", encoding="utf-8") as f:
            raw = f.read()

        # 空ファイル・不正JSONの検出（JSX書き込み失敗の場合）
        if not raw.strip():
            raise ValueError("req.json が空です。JSX側の書き込みに失敗した可能性があります。")

        req = json.loads(raw)

        api_key = req.get("api_key", "")
        caller  = req.get("caller",  "unknown")
        body    = req.get("body",    {})
        print(f"  → 呼び出し元: {caller}")
        print(f"  → API呼び出し中... (model: {body.get('model', '')})")

        resp   = call_api(api_key, body)
        result = {"ok": True, "response": resp}
        print(f"  → API完了")

    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"  → HTTPError {e.code}: {err_body[:200]}")
        result = {"ok": False, "error": f"HTTP {e.code}: {err_body[:300]}"}

    except (ValueError, json.JSONDecodeError) as e:
        print(f"  → req.jsonパースエラー: {e}")
        result = {"ok": False, "error": f"req.jsonの読み込みに失敗しました: {e}"}

    except Exception as e:
        print(f"  → Error: {e}")
        result = {"ok": False, "error": str(e)}

    finally:
        # lockファイルは必ず削除
        if os.path.exists(LOCK_PATH):
            os.remove(LOCK_PATH)

    # レスポンスを書き出す
    if result is not None:
        with open(RESP_PATH, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"  → 完了: {RESP_PATH}")

def main():
    print("=" * 52)
    print("Adobe API Bridge  Ver.1.0.5  起動中")
    print(f"監視: {READY_PATH}")
    print("終了するには Ctrl+C を押してください")
    print("=" * 52)

    try:
        while True:
            if os.path.exists(READY_PATH):
                print(f"\n[{time.strftime('%H:%M:%S')}] リクエスト検知")
                # フラグを先に削除（二重処理防止）
                try:
                    os.remove(READY_PATH)
                except OSError:
                    pass
                process()
            time.sleep(POLL_SEC)
    except KeyboardInterrupt:
        print("\n\nAdobe API Bridge を停止しました。")

if __name__ == "__main__":
    main()
