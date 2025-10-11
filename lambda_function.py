import json
import base64
import boto3
import os
from datetime import datetime, timezone
from botocore.exceptions import ClientError

s3 = boto3.client('s3')
BUCKET_NAME = "kenya-suzuki-test-bucket"

def _get_cors_headers():
    """CORSヘッダーを返す"""
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST",
        "Access-Control-Allow-Headers": "Content-Type"
    }

def _load_existing_logs(key: str):
    """S3から既存のログを読み込む。ファイルが存在しない場合は空の配列を返す"""
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
            # ファイルが存在しない場合は空の配列を返す（自動作成の準備）
            return []
        raise

def _save_logs(key: str, logs: list):
    """S3にログを保存する。ファイルが存在しない場合は自動作成される"""
    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=key,
        Body=json.dumps(logs, ensure_ascii=False),
        ContentType='application/json'
    )

def lambda_handler(event, context):
    """
    AWS Lambda関数: フロントエンドからの操作ログを受信し、S3に保存する
    
    Args:
        event: API Gateway v1/v2 のイベント
        context: Lambda実行コンテキスト
    
    Returns:
        dict: HTTPレスポンス
    """
    
    # CORSプリフライトリクエスト（OPTIONS）の処理
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 204, "headers": _get_cors_headers(), "body": ""}
    
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {"statusCode": 204, "headers": _get_cors_headers(), "body": ""}

    # ログファイルのキー
    key = "logs/latest.json"

    # リクエストボディの取得
    raw = None
    
    # API Gateway v1 (REST API) の場合
    if "body" in event:
        raw = event["body"]
    # API Gateway v2 (HTTP API) の場合
    elif "requestContext" in event and "http" in event.get("requestContext", {}):
        if "body" in event:
            raw = event["body"]
        else:
            # プリフライトリクエストやGETリクエストの場合
            return {"statusCode": 204, "headers": _get_cors_headers(), "body": ""}
    elif "Records" in event:  # S3イベントなど
        return {"statusCode": 200, "headers": _get_cors_headers(), "body": "Not a web request"}
    else:
        # 直接呼び出しの場合
        raw = json.dumps(event) if event else "{}"
    
    # リクエストボディの解析
    try:
        if raw is None:
            raw = "{}"
        
        # Base64デコード（API Gateway v2の場合）
        if event.get("isBase64Encoded") and isinstance(raw, str):
            try:
                raw = base64.b64decode(raw).decode("utf-8")
            except Exception:
                raw = "{}"
        
        # JSONパース
        payload_obj = json.loads(raw) if isinstance(raw, str) else (raw or {})
        
    except Exception:
        payload_obj = {}

    # イベント配列の抽出
    incoming_events = []
    if isinstance(payload_obj, dict) and isinstance(payload_obj.get("events"), list):
        incoming_events = payload_obj.get("events")
    elif isinstance(payload_obj, list):
        incoming_events = payload_obj
    elif isinstance(payload_obj, dict) and payload_obj:
        incoming_events = [payload_obj]

    # 各イベントにサーバ受信時刻を付与
    received_at = datetime.now(timezone.utc).isoformat()
    normalized_events = []
    for ev in incoming_events:
        if isinstance(ev, dict):
            ev = {**ev, "received_at": received_at}
            normalized_events.append(ev)

    # 既存ログを読み込み、追記し、上限でトリム
    # ファイルが存在しない場合は空の配列から開始（自動作成）
    try:
        existing_logs = _load_existing_logs(key)
        combined_logs = existing_logs + normalized_events
        
        # 最大件数を制限（10,000件）
        MAX_LEN = 10000
        if len(combined_logs) > MAX_LEN:
            combined_logs = combined_logs[-MAX_LEN:]
        
        _save_logs(key, combined_logs)
        
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": _get_cors_headers(),
            "body": json.dumps({"message": "Failed to append logs", "error": str(e)})
        }

    # 成功時は204 No Contentを返す（サーバ負荷軽減）
    return {"statusCode": 204, "headers": _get_cors_headers(), "body": ""}