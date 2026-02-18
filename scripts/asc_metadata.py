#!/usr/bin/env python3
"""
App Store Connect API - Set metadata for app version 1.0
"""

import jwt
import time
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ISSUER_ID = os.environ["ASC_ISSUER_ID"]
KEY_ID = os.environ["ASC_KEY_ID"]
PRIVATE_KEY_PATH = os.environ["ASC_PRIVATE_KEY_PATH"]
APP_ID = os.environ["ASC_APP_ID"]
BASE_URL = "https://api.appstoreconnect.apple.com/v1"

DESCRIPTION = """唱題の回数を、声で自動カウント。

題目カウンターは、音声認識技術を活用して「南無妙法蓮華経」の回数を自動でカウントするアプリです。唱題に集中しながら、正確な記録を残すことができます。

【主な機能】
・音声認識による自動カウント（オンライン・オフライン対応）
・手動タップカウント
・日々の目標設定と進捗表示
・過去30日間の唱題記録グラフ
・セッション履歴の管理

【3つの認識モード】
・ネイティブモード：Apple音声認識を使用（オフライン対応）
・クラウドモード：高精度なクラウド音声認識
・ローカルモード：音声の強弱で検出（完全オフライン）

アカウント登録は不要。すぐに使い始められます。

日々の唱題を、静かに見守るパートナーとして。"""

KEYWORDS = "題目,唱題,カウンター,南無妙法蓮華経,音声認識,日蓮,仏教,勤行,信仰,記録"
SUPPORT_URL = "https://yoshi0703.github.io/daimoku-counter/"
SUBTITLE = "音声認識で唱題を自動カウント"
PRIVACY_POLICY_URL = "https://yoshi0703.github.io/daimoku-counter/privacy-policy.html"
APP_NAME = "題目カウンター"


def generate_token():
    with open(PRIVATE_KEY_PATH, "r") as f:
        private_key = f.read()
    now = int(time.time())
    payload = {"iss": ISSUER_ID, "iat": now, "exp": now + 20 * 60, "aud": "appstoreconnect-v1"}
    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": KEY_ID})


def api_request(method, path, body=None, token=None):
    url = path if path.startswith("http") else f"{BASE_URL}{path}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    data = json.dumps(body).encode("utf-8") if body else None
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except HTTPError as e:
        error_body = e.read().decode("utf-8")
        print(f"  HTTP {e.code}: {error_body}")
        raise

def api_get(path, token): return api_request("GET", path, token=token)
def api_patch(path, body, token): return api_request("PATCH", path, body=body, token=token)
def api_post(path, body, token): return api_request("POST", path, body=body, token=token)


def main():
    print("=" * 60)
    print("App Store Connect Metadata Setup")
    print("=" * 60)

    token = generate_token()
    print(f"\n[1] JWT token generated successfully")

    # Get version
    print("\n[2] Getting editable app store version...")
    resp = api_get(f"/apps/{APP_ID}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION,READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,DEVELOPER_REJECTED", token)
    versions = resp.get("data", [])
    if not versions:
        resp = api_get(f"/apps/{APP_ID}/appStoreVersions", token)
        versions = resp.get("data", [])
    version = versions[0]
    version_id = version["id"]
    version_state = version["attributes"]["appStoreState"]
    print(f"  Version: {version['attributes']['versionString']} (state: {version_state}, id: {version_id})")

    # Get version localizations
    print("\n[3] Getting version localizations...")
    resp = api_get(f"/appStoreVersions/{version_id}/appStoreVersionLocalizations", token)
    localizations = resp.get("data", [])
    ja_loc_id = None
    en_loc_id = None
    for loc in localizations:
        locale = loc["attributes"]["locale"]
        print(f"    - {locale} (id: {loc['id']})")
        if locale == "ja": ja_loc_id = loc["id"]
        if locale == "en-US": en_loc_id = loc["id"]

    # Version localization attributes
    # NOTE: whatsNew cannot be set for PREPARE_FOR_SUBMISSION (first version)
    version_loc_attrs = {
        "description": DESCRIPTION,
        "keywords": KEYWORDS,
        "supportUrl": SUPPORT_URL,
        "promotionalText": "",
    }
    # Only add whatsNew if not first submission
    if version_state not in ("PREPARE_FOR_SUBMISSION",):
        version_loc_attrs["whatsNew"] = "初回リリース"

    # Step 4a: Try to create ja version localization
    print("\n[4] Setting up version localization...")
    created_ja = False
    if not ja_loc_id:
        try:
            print(f"  Attempting to create ja version localization...")
            body = {
                "data": {
                    "type": "appStoreVersionLocalizations",
                    "attributes": {"locale": "ja", **version_loc_attrs},
                    "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}}},
                }
            }
            resp = api_post("/appStoreVersionLocalizations", body, token)
            ja_loc_id = resp["data"]["id"]
            created_ja = True
            print(f"  Created ja version localization (id: {ja_loc_id})")
        except HTTPError:
            print(f"  Could not create ja locale (name conflict with another app).")
            print(f"  Will update en-US localization with Japanese content instead.")

    if ja_loc_id and not created_ja:
        print(f"  Updating existing ja version localization (id: {ja_loc_id})...")
        body = {"data": {"type": "appStoreVersionLocalizations", "id": ja_loc_id, "attributes": version_loc_attrs}}
        resp = api_patch(f"/appStoreVersionLocalizations/{ja_loc_id}", body, token)
    elif not ja_loc_id:
        # Fall back to en-US
        print(f"  Updating en-US version localization (id: {en_loc_id})...")
        body = {"data": {"type": "appStoreVersionLocalizations", "id": en_loc_id, "attributes": version_loc_attrs}}
        resp = api_patch(f"/appStoreVersionLocalizations/{en_loc_id}", body, token)

    attrs = resp["data"]["attributes"]
    print(f"\n  Result: locale={attrs['locale']}, id={resp['data']['id']}")
    print(f"    description length: {len(attrs.get('description','') or '')}")
    print(f"    keywords: {attrs.get('keywords', '')}")
    print(f"    supportUrl: {attrs.get('supportUrl', '')}")

    # App Info
    print("\n[5] Getting app info...")
    resp = api_get(f"/apps/{APP_ID}/appInfos", token)
    app_infos = resp.get("data", [])
    app_info = None
    for ai in app_infos:
        state = ai["attributes"].get("appStoreState", "")
        print(f"  AppInfo: id={ai['id']}, state={state}")
        if state in ("PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW"):
            app_info = ai
    if not app_info:
        app_info = app_infos[0]
    app_info_id = app_info["id"]

    # Set primary category
    print("\n[5a] Setting primary category to LIFESTYLE...")
    body = {
        "data": {
            "type": "appInfos", "id": app_info_id,
            "relationships": {"primaryCategory": {"data": {"type": "appCategories", "id": "LIFESTYLE"}}},
        }
    }
    try:
        resp = api_patch(f"/appInfos/{app_info_id}", body, token)
        print(f"  Primary category set successfully!")
    except Exception as e:
        print(f"  Warning: Could not set primary category: {e}")

    # App info localizations
    print("\n[5b] Getting app info localizations...")
    resp = api_get(f"/appInfos/{app_info_id}/appInfoLocalizations", token)
    info_locs = resp.get("data", [])

    ja_info_loc_id = None
    en_info_loc_id = None
    for loc in info_locs:
        locale = loc["attributes"]["locale"]
        print(f"    - {locale} (id: {loc['id']}, name={loc['attributes'].get('name','')}, subtitle={loc['attributes'].get('subtitle','')})")
        if locale == "ja": ja_info_loc_id = loc["id"]
        if locale == "en-US": en_info_loc_id = loc["id"]

    # Set subtitle and privacy policy
    print("\n[5c] Setting subtitle and privacy policy...")
    info_loc_attrs = {"subtitle": SUBTITLE, "privacyPolicyUrl": PRIVACY_POLICY_URL}

    target_info_loc_id = ja_info_loc_id or en_info_loc_id

    if ja_info_loc_id:
        print(f"  Updating ja app info localization (id: {ja_info_loc_id})...")
        body = {"data": {"type": "appInfoLocalizations", "id": ja_info_loc_id, "attributes": info_loc_attrs}}
        resp = api_patch(f"/appInfoLocalizations/{ja_info_loc_id}", body, token)
    elif not ja_info_loc_id:
        # Try creating ja info loc
        try:
            print(f"  Creating ja app info localization...")
            body = {
                "data": {
                    "type": "appInfoLocalizations",
                    "attributes": {"locale": "ja", "name": APP_NAME, **info_loc_attrs},
                    "relationships": {"appInfo": {"data": {"type": "appInfos", "id": app_info_id}}},
                }
            }
            resp = api_post("/appInfoLocalizations", body, token)
            print(f"  Created ja app info localization!")
        except HTTPError:
            print(f"  Could not create ja app info locale. Updating en-US instead...")
            body = {"data": {"type": "appInfoLocalizations", "id": en_info_loc_id, "attributes": info_loc_attrs}}
            resp = api_patch(f"/appInfoLocalizations/{en_info_loc_id}", body, token)

    attrs = resp["data"]["attributes"]
    print(f"\n  Result: locale={attrs.get('locale','')}, id={resp['data']['id']}")
    print(f"    name: {attrs.get('name', '')}")
    print(f"    subtitle: {attrs.get('subtitle', '')}")
    print(f"    privacyPolicyUrl: {attrs.get('privacyPolicyUrl', '')}")

    # Verification
    print("\n" + "=" * 60)
    print("[6] VERIFICATION")
    print("=" * 60)

    print("\nVersion Localizations:")
    resp = api_get(f"/appStoreVersions/{version_id}/appStoreVersionLocalizations", token)
    for loc in resp.get("data", []):
        a = loc["attributes"]
        print(f"  [{a['locale']}] id={loc['id']}")
        print(f"    description: {(a.get('description','') or '')[:80]}...")
        print(f"    keywords: {a.get('keywords','')}")
        print(f"    supportUrl: {a.get('supportUrl','')}")
        print(f"    whatsNew: {a.get('whatsNew','')}")
        print(f"    promotionalText: {a.get('promotionalText','')}")

    print("\nApp Info Localizations:")
    resp = api_get(f"/appInfos/{app_info_id}/appInfoLocalizations", token)
    for loc in resp.get("data", []):
        a = loc["attributes"]
        print(f"  [{a['locale']}] id={loc['id']}")
        print(f"    name: {a.get('name','')}")
        print(f"    subtitle: {a.get('subtitle','')}")
        print(f"    privacyPolicyUrl: {a.get('privacyPolicyUrl','')}")

    print("\n" + "=" * 60)
    print("All metadata setup complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
