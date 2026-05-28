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
API_KEY = os.environ.get("LAW_API_KEY", "")
BASE_URL = "https://www.law.go.kr/DRF/lawSearch.do"

DATA_JSON = os.path.join(os.path.dirname(__file__), "..", "data", "contracts.json")
DATA_JS   = os.path.join(os.path.dirname(__file__), "..", "data", "contracts.js")

# 확인할 법령 목록 (법령명은 법제처 검색 키워드와 동일하게 입력)
LAWS_TO_CHECK = [
    {
        "key":   "본법",
        "query": "국가를당사자로하는계약에관한법률",
        "label": "국가계약법 (본법)",
    },
    {
        "key":   "시행령",
        "query": "국가를당사자로하는계약에관한법률시행령",
        "label": "국가계약법 시행령",
    },
    {
        "key":   "시행규칙",
        "query": "국가를당사자로하는계약에관한법률시행규칙",
        "label": "국가계약법 시행규칙",
    },
]

# ── 법제처 API 호출 ─────────────────────────────────────────────────────────
def fetch_law_info(query: str) -> dict | None:
    """법령 검색 API를 호출하여 가장 최신 법령 정보를 반환합니다."""
    params = urllib.parse.urlencode({
        "OC":      API_KEY,
        "target":  "law",
        "type":    "JSON",
        "query":   query,
        "display": "1",
        "sort":    "efdes",   # 시행일 내림차순 → 최신 법령이 첫 번째
    })
    url = f"{BASE_URL}?{params}"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)

        search = data.get("LawSearch", {})
        law_raw = search.get("law", None)

        # API는 결과가 1건이면 객체, 여러 건이면 배열로 반환
        if isinstance(law_raw, list):
            law = law_raw[0]
        elif isinstance(law_raw, dict):
            law = law_raw
        else:
            print(f"  [WARN] '{query}' 결과 없음")
            return None

        return {
            "lawName":          law.get("법령명한글", query),
            "lawId":            law.get("법령ID", ""),
            "promulgationDate": law.get("공포일자", ""),   # "YYYYMMDD"
            "effectiveDate":    law.get("시행일자", ""),   # "YYYYMMDD"
            "ministry":         law.get("소관부처명", ""),
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
