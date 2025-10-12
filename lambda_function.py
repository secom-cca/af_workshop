import json
import base64
import boto3
import os
import re
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

def _sanitize_username(username):
    """ユーザー名をサニタイズしてファイル名に使用可能にする"""
    if not username or not isinstance(username, str):
        return "anonymous"
    
    # 危険な文字とスペースを除去または置換
    sanitized = re.sub(r'[<>:"/\\|?*\s]', '_', username)
    # 連続するアンダースコアを単一に
    sanitized = re.sub(r'_+', '_', sanitized)
    # 先頭・末尾のアンダースコアを除去
    sanitized = sanitized.strip('_')
    # 空文字列の場合はanonymousに
    if not sanitized:
        return "anonymous"
    
    return sanitized

def _load_existing_logs(key: str):
    """S3から既存のログを読み込む。ファイルが存在しない場合は空の配列を返す"""
    try:
        # print(f"DEBUG: Attempting to load from S3: bucket='{BUCKET_NAME}', key='{key}'")
        obj = s3.get_object(Bucket=BUCKET_NAME, Key=key)
        data = obj["Body"].read()
        if not data:
            # print("DEBUG: Empty file, returning empty list")
            return []
        parsed = json.loads(data)
        if isinstance(parsed, list):
            # print(f"DEBUG: Successfully loaded {len(parsed)} logs from existing file")
            return parsed
        # print("DEBUG: File exists but is not a list, returning empty list")
        return []
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code')
        # print(f"DEBUG: S3 ClientError: {error_code}")
        if error_code in ("NoSuchKey", "404"):
            # ファイルが存在しない場合は空の配列を返す（自動作成の準備）
            # print("DEBUG: File does not exist, returning empty list for auto-creation")
            return []
        # print(f"ERROR: Unexpected S3 error: {str(e)}")
        raise

def _save_logs(key: str, logs: list):
    """S3にログを保存する。ファイルが存在しない場合は自動作成される"""
    try:
        # print(f"DEBUG: Attempting to save to S3: bucket='{BUCKET_NAME}', key='{key}', logs_count={len(logs)}")
        response = s3.put_object(
            Bucket=BUCKET_NAME,
            Key=key,
            Body=json.dumps(logs, ensure_ascii=False),
            ContentType='application/json'
        )
        # print(f"DEBUG: S3 put_object successful: ETag={response.get('ETag', 'N/A')}")
    except Exception as e:
        # print(f"ERROR: Failed to save logs to S3: {str(e)}")
        raise

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

    # ユーザー名を抽出してファイル名を決定
    username = "anonymous"  # デフォルト値
    if isinstance(payload_obj, dict) and isinstance(payload_obj.get("events"), list):
        # events配列から最初のイベントのユーザー名を取得
        events = payload_obj.get("events", [])
        if events and isinstance(events[0], dict) and "user" in events[0]:
            username = events[0]["user"]
    elif isinstance(payload_obj, list) and payload_obj:
        # 配列の最初の要素からユーザー名を取得
        if isinstance(payload_obj[0], dict) and "user" in payload_obj[0]:
            username = payload_obj[0]["user"]
    elif isinstance(payload_obj, dict) and "user" in payload_obj:
        # 単一オブジェクトからユーザー名を取得
        username = payload_obj["user"]
    
    # ユーザー名をサニタイズしてファイル名を生成
    sanitized_username = _sanitize_username(username)
    key = f"logs/{sanitized_username}.json"
    
    # デバッグログ
    # print(f"DEBUG: username='{username}', sanitized='{sanitized_username}', key='{key}'")

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
        # print(f"DEBUG: Loading existing logs from key='{key}'")
        existing_logs = _load_existing_logs(key)
        # print(f"DEBUG: Loaded {len(existing_logs)} existing logs")
        
        combined_logs = existing_logs + normalized_events
        # print(f"DEBUG: Combined logs count: {len(combined_logs)}")
        
        # 最大件数を制限（10,000件）
        MAX_LEN = 10000
        if len(combined_logs) > MAX_LEN:
            combined_logs = combined_logs[-MAX_LEN:]
            # print(f"DEBUG: Trimmed to {len(combined_logs)} logs")
        
        # print(f"DEBUG: Saving logs to key='{key}'")
        _save_logs(key, combined_logs)
        # print(f"DEBUG: Successfully saved {len(combined_logs)} logs")
        
    except Exception as e:
        # print(f"ERROR: Failed to process logs: {str(e)}")
        # print(f"ERROR: Key='{key}', Events count={len(normalized_events)}")
        return {
            "statusCode": 500,
            "headers": _get_cors_headers(),
            "body": json.dumps({"message": "Failed to append logs", "error": str(e)})
        }

    # 成功時は204 No Contentを返す（サーバ負荷軽減）
    return {"statusCode": 204, "headers": _get_cors_headers(), "body": ""}