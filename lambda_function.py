import json
import base64
import boto3
import os
from datetime import datetime, timezone
from botocore.exceptions import ClientError

s3 = boto3.client('s3')
BUCKET_NAME = "kenya-suzuki-test-bucket"

def _get_cors_headers():
    origin = "*"
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "OPTIONS,POST",
        "Access-Control-Allow-Headers": "Content-Type"
    }


def _load_existing_logs(key: str):
    try:
        obj = s3.get_object(Bucket=BUCKET_NAME, Key=key)
        data = obj["Body"].read()
        if not data:
            return []
        parsed = json.loads(data)
        if isinstance(parsed, list):
            return parsed
        return []
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') in ("NoSuchKey", "404"):
            return []
        raise


def _save_logs(key: str, logs: list):
    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=key,
        Body=json.dumps(logs, ensure_ascii=False),
        ContentType='application/json'
    )


def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 204, "headers": _get_cors_headers(), "body": ""}

    key = "logs/latest.json"

    # 複数イベントを配列で受理（Base64対応、トップレベル配列にも対応）
    try:
        raw = event.get("body") or "{}"
        # Debug: 受信メタ情報と生ボディ（長い場合は先頭だけ）
        try:
            raw_preview = raw if isinstance(raw, str) else str(raw)
            if isinstance(raw_preview, str) and len(raw_preview) > 1000:
                raw_preview = raw_preview[:1000] + "...<truncated>"
            print({
                "debug": "incoming",
                "httpMethod": event.get("httpMethod"),
                "isBase64Encoded": event.get("isBase64Encoded"),
                "raw_len": len(raw) if isinstance(raw, str) else None,
                "raw_preview": raw_preview,
            })
        except Exception as pe:
            print({"debug": "incoming_print_error", "error": str(pe)})
        if event.get("isBase64Encoded") and isinstance(raw, str):
            try:
                raw = base64.b64decode(raw).decode("utf-8")
            except Exception:
                raw = "{}"
        payload_obj = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except Exception:
        payload_obj = {}

    # { events: [...] } 形式 or 直接配列 or 単発オブジェクトを受理
    incoming_events = None
    if isinstance(payload_obj, dict) and isinstance(payload_obj.get("events"), list):
        incoming_events = payload_obj.get("events")
    elif isinstance(payload_obj, list):
        incoming_events = payload_obj
    elif isinstance(payload_obj, dict) and payload_obj:
        incoming_events = [payload_obj]
    else:
        incoming_events = []

    try:
        print({
            "debug": "parsed",
            "incoming_events_type": type(incoming_events).__name__,
            "incoming_events_len": len(incoming_events) if isinstance(incoming_events, list) else None,
        })
    except Exception as pe2:
        print({"debug": "parsed_print_error", "error": str(pe2)})

    # 各イベントにサーバ受信時刻を付与
    received_at = datetime.now(timezone.utc).isoformat()
    normalized = []
    for ev in incoming_events:
        if isinstance(ev, dict):
            ev = {**ev, "received_at": received_at}
            normalized.append(ev)

    # 既存ログを読み込み、追記し、上限でトリム
    try:
        existing = _load_existing_logs(key)
        combined = existing + normalized
        # 最大件数を制限（例: 10,000件）
        MAX_LEN = 10000
        if len(combined) > MAX_LEN:
            combined = combined[-MAX_LEN:]
        _save_logs(key, combined)
        try:
            print({
                "debug": "saved",
                "appended": len(normalized),
                "total_after": len(combined)
            })
        except Exception as pe3:
            print({"debug": "saved_print_error", "error": str(pe3)})
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": _get_cors_headers(),
            "body": json.dumps({"message": "Failed to append logs", "error": str(e)})
        }

    # 成功時はUIに何も返さない
    return {"statusCode": 204, "headers": _get_cors_headers(), "body": ""}
