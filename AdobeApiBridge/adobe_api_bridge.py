#!/usr/bin/env python3
# adobe_api_bridge.py  Ver.1.0.1
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
#
# 使い方:
#   AdobeApiBridge.app をダブルクリック（または Dock から起動）
#   終了するには Ctrl+C またはウィンドウを閉じる

import json
import time
import os
import urllib.request
import urllib.error

REQ_PATH  = "/tmp/_aab_req.json"
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
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode("utf-8"))

def process(req_path: str, resp_path: str):
    # リネームして排他処理（競合防止）
    lock_path = req_path + ".lock"
    try:
        os.rename(req_path, lock_path)
    except OSError:
        return  # 別プロセスが先に取得した場合はスキップ
    with open(lock_path, "r", encoding="utf-8") as f:
        req = json.loads(f.read())
    os.remove(lock_path)

    api_key = req.get("api_key", "")
    body    = req.get("body",    {})

    print(f"  → API呼び出し中... (model: {body.get('model', '')})")

    try:
        resp   = call_api(api_key, body)
        result = {"ok": True, "response": resp}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"  → HTTPError {e.code}: {err_body[:200]}")
        result = {"ok": False, "error": f"HTTP {e.code}: {err_body[:300]}"}
    except Exception as e:
        print(f"  → Error: {e}")
        result = {"ok": False, "error": str(e)}

    with open(resp_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"  → 完了: {resp_path}")

def main():
    print("=" * 52)
    print("Adobe API Bridge  Ver.1.0.1  起動中")
    print(f"監視: {REQ_PATH}")
    print("終了するには Ctrl+C を押してください")
    print("=" * 52)

    try:
        while True:
            if os.path.exists(REQ_PATH):
                print(f"\n[{time.strftime('%H:%M:%S')}] リクエスト検知")
                try:
                    process(REQ_PATH, RESP_PATH)
                except Exception as e:
                    print(f"  → 処理エラー: {e}")
                    with open(RESP_PATH, "w", encoding="utf-8") as f:
                        json.dump({"ok": False, "error": str(e)}, f)
                    if os.path.exists(REQ_PATH):
                        os.remove(REQ_PATH)
            time.sleep(POLL_SEC)
    except KeyboardInterrupt:
        print("\n\nAdobe API Bridge を停止しました。")

if __name__ == "__main__":
    main()
