"""
법제처 Open API를 이용해 계약 관련 주요 법령의 최신 개정 여부를 확인하고
contracts.json / contracts.js 를 자동 업데이트합니다.

실행 방법:
  python scripts/check_law_updates.py

환경변수:
  LAW_API_KEY  - 법제처 Open API 인증키 (https://open.law.go.kr 에서 무료 발급)
"""

import json
import os
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timezone

# ── 설정 ────────────────────────────────────────────────────────────────────
API_KEY  = os.environ.get("LAW_API_KEY", "")
BASE_URL = "http://apis.data.go.kr/1170000/law/lawSearchList.do"  # 공공데이터포털 법제처 API

DATA_JSON = os.path.join(os.path.dirname(__file__), "..", "data", "contracts.json")
DATA_JS   = os.path.join(os.path.dirname(__file__), "..", "data", "contracts.js")

# 확인할 법령 목록
LAWS_TO_CHECK = [
    {
        "key":   "본법",
        "query": "국가를 당사자로 하는 계약에 관한 법률",
        "label": "국가계약법 (본법)",
    },
    {
        "key":   "시행령",
        "query": "국가를 당사자로 하는 계약에 관한 법률 시행령",
        "label": "국가계약법 시행령",
    },
    {
        "key":   "시행규칙",
        "query": "국가를 당사자로 하는 계약에 관한 법률 시행규칙",
        "label": "국가계약법 시행규칙",
    },
]

# ── 법제처 API 호출 (공공데이터포털) ─────────────────────────────────────────
def fetch_law_info(query: str) -> dict | None:
    """공공데이터포털 법제처 API를 호출하여 가장 최신 법령 정보를 반환합니다."""
    params = urllib.parse.urlencode({
        "serviceKey": API_KEY,
        "target":     "law",
        "query":      query,
        "numOfRows":  "5",
        "pageNo":     "1",
        "type":       "json",
    })
    url = f"{BASE_URL}?{params}"
    print(f"  호출 URL: {BASE_URL}?target=law&query={urllib.parse.quote(query)}&...")
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")

        # 응답이 XML인 경우(오류) 처리
        if raw.strip().startswith("<"):
            print(f"  [WARN] XML 오류 응답 수신: {raw[:200]}")
            return None

        data = json.loads(raw)
        print(f"  응답 키: {list(data.keys())}")

        # 공공데이터포털 표준 응답 구조
        body   = data.get("response", data).get("body", data.get("body", {}))
        items  = body.get("items", {})

        if not items:
            # 응답 구조가 다른 경우 전체 탐색
            for v in data.values():
                if isinstance(v, dict) and "item" in v:
                    items = v
                    break

        item_raw = items.get("item", None) if isinstance(items, dict) else None

        if item_raw is None:
            print(f"  [WARN] '{query}' 결과 없음. 응답: {raw[:300]}")
            return None

        # 결과가 1건이면 dict, 여러 건이면 list
        item = item_raw[0] if isinstance(item_raw, list) else item_raw

        return {
            "lawName":          item.get("법령명한글", item.get("lawNm", query)),
            "lawId":            item.get("법령ID",     item.get("lawId", "")),
            "promulgationDate": item.get("공포일자",   item.get("promulgDt", "")),
            "effectiveDate":    item.get("시행일자",   item.get("enfoDt", "")),
            "ministry":         item.get("소관부처명", item.get("ministry", "")),
        }
    except Exception as exc:
        print(f"  [ERROR] '{query}' API 호출 실패: {exc}")
        return None

# ── 날짜 포맷 변환 ──────────────────────────────────────────────────────────
def fmt_date(yyyymmdd: str) -> str:
    """'20240101' → '2024-01-01'"""
    s = str(yyyymmdd).strip()
    if len(s) == 8:
        return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    return s

# ── 메인 ────────────────────────────────────────────────────────────────────
def main():
    if not API_KEY:
        print("[ERROR] 환경변수 LAW_API_KEY 가 설정되어 있지 않습니다.")
        print("        https://open.law.go.kr 에서 무료로 API 키를 발급받은 뒤")
        print("        GitHub 저장소의 Settings > Secrets > Actions 에")
        print("        LAW_API_KEY 이름으로 등록하세요.")
        sys.exit(1)

    # contracts.json 읽기 (PowerShell이 생성한 UTF-8 BOM 파일 대응)
    with open(DATA_JSON, encoding="utf-8-sig") as f:
        data = json.load(f)

    last_updated = data.get("meta", {}).get("lastUpdated", "1900-01-01")
    law_versions = {}
    amendment_found = False

    print("=== 법령 최신 개정 여부 확인 ===")
    for law_cfg in LAWS_TO_CHECK:
        print(f"\n▶ {law_cfg['label']} 확인 중...")
        info = fetch_law_info(law_cfg["query"])
        if info:
            eff = fmt_date(info["effectiveDate"])
            print(f"  시행일: {eff}  (데이터 기준일: {last_updated})")
            law_versions[law_cfg["key"]] = {
                "label":          law_cfg["label"],
                "lawName":        info["lawName"],
                "effectiveDate":  eff,
                "promulgationDate": fmt_date(info["promulgationDate"]),
                "ministry":       info["ministry"],
            }
            if eff > last_updated:
                print(f"  ⚠  개정 감지! ({eff} > {last_updated})")
                amendment_found = True

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # meta 업데이트
    data.setdefault("meta", {})
    data["meta"]["lastChecked"]      = today
    data["meta"]["lawVersions"]      = law_versions
    data["meta"]["amendmentAlert"]   = amendment_found

    # contracts.json 저장
    with open(DATA_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # contracts.js 동기화
    json_str = json.dumps(data, ensure_ascii=False, indent=2)
    with open(DATA_JS, "w", encoding="utf-8") as f:
        f.write(f"const CONTRACT_DATA = {json_str};")

    print(f"\n✓ 완료  (확인일: {today}  개정 감지: {'있음 ⚠' if amendment_found else '없음'})")
    if amendment_found:
        print("  → contracts.json 의 meta.lastUpdated 와 관련 조문을 갱신하세요.")

if __name__ == "__main__":
    main()
