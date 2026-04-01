#!/usr/bin/env python3
# adobe_api_bridge.py  Ver.1.0.3
# Copyright (c) 2026 Over Ray Studio / Takashi Aoki
# LastUpdate: 2026/03/27
#
# AdobeアプリとClaude APIをつなぐ汎用ファイル監視ブリッジ。
# Automatorアプリ（AdobeApiBridge.app）の Resources/ に同梱して使用。
#
# リクエスト形式: /tmp/_aab_req.json
#   { "api_key": "sk-ant-...", "body": { ...Anthropic APIリクエストbody... } }
# レスポンス形式: /tmp/_aab_resp.json
#   { "ok": true,  "response": { ...Anthropic APIレスポンス... } }
#   { "ok": false, "error": "エラーメッセージ" }

import json
import time
import os
import urllib.request
import urllib.error

REQ_PATH  = "/tmp/_aab_req.json"
LOCK_PATH = "/tmp/_aab_req.json.lock"
RESP_PATH = "/tmp/_aab_resp.json"
POLL_SEC  = 0.5

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
    # リネームして排他処理（競合防止）
    # リネームが失敗した場合は別プロセスが処理中なのでスキップ
    try:
        os.rename(REQ_PATH, LOCK_PATH)
    except OSError:
        return

    result = None
    try:
        with open(LOCK_PATH, "r", encoding="utf-8") as f:
            req = json.loads(f.read())

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
    print("Adobe API Bridge  Ver.1.0.3  起動中")
    print(f"監視: {REQ_PATH}")
    print("終了するには Ctrl+C を押してください")
    print("=" * 52)

    try:
        while True:
            if os.path.exists(REQ_PATH):
                print(f"\n[{time.strftime('%H:%M:%S')}] リクエスト検知")
                process()
            time.sleep(POLL_SEC)
    except KeyboardInterrupt:
        print("\n\nAdobe API Bridge を停止しました。")

if __name__ == "__main__":
    main()
