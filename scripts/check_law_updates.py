"""
법제처 법령 페이지에서 시행일자를 직접 파싱하여 계약 관련 주요 법령의
최신 개정 여부를 확인하고 contracts.json / contracts.js 를 자동 업데이트합니다.

API 키 불필요 — 법제처 공개 웹페이지를 직접 읽어옵니다.

실행 방법:
  python scripts/check_law_updates.py
"""

import json
import os
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

# ── 설정 ────────────────────────────────────────────────────────────────────
DATA_JSON = os.path.join(os.path.dirname(__file__), "..", "data", "contracts.json")
DATA_JS   = os.path.join(os.path.dirname(__file__), "..", "data", "contracts.js")

# 확인할 법령 목록 — URL은 법제처 법령명 기반 고정 링크
LAWS_TO_CHECK = [
    {
        "key":   "본법",
        "label": "국가계약법 (본법)",
        "url":   "https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률",
    },
    {
        "key":   "시행령",
        "label": "국가계약법 시행령",
        "url":   "https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률시행령",
    },
    {
        "key":   "시행규칙",
        "label": "국가계약법 시행규칙",
        "url":   "https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률시행규칙",
    },
]

# ── HTML 텍스트 파서 ─────────────────────────────────────────────────────────
class TextCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.texts = []

    def handle_data(self, data):
        t = data.strip()
        if t:
            self.texts.append(t)

    def get_text(self):
        return " ".join(self.texts)


# ── 법제처 페이지에서 시행일자 파싱 ─────────────────────────────────────────
def fetch_effective_date(law_url: str) -> str | None:
    """
    법제처 법령 페이지를 가져와 '시행 YYYY. M. D.' 형태의 날짜를 파싱합니다.
    반환값: 'YYYY-MM-DD' 형식 문자열 또는 None
    """
    try:
        req = urllib.request.Request(
            law_url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; law-checker/1.0)"}
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            html = resp.read().decode("utf-8", errors="replace")

        # 패턴 1: "시행 2024. 1. 1." 또는 "시행 2024.1.1"
        m = re.search(r'시행\s+(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?', html)
        if m:
            y, mo, d = m.group(1), m.group(2).zfill(2), m.group(3).zfill(2)
            return f"{y}-{mo}-{d}"

        # 패턴 2: 메타데이터나 다른 형식
        m2 = re.search(r'enfoDt["\s:=]+(\d{8})', html)
        if m2:
            s = m2.group(1)
            return f"{s[:4]}-{s[4:6]}-{s[6:]}"

        # 패턴 3: JSON-LD 또는 스크립트 내 날짜
        m3 = re.search(r'"effectiveDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"', html)
        if m3:
            return m3.group(1)

        print("  [WARN] 페이지에서 시행일자를 찾지 못했습니다.")
        return None

    except Exception as exc:
        print(f"  [ERROR] 페이지 로드 실패: {exc}")
        return None


# ── 메인 ────────────────────────────────────────────────────────────────────
def main():
    # contracts.json 읽기 (PowerShell UTF-8 BOM 대응)
    with open(DATA_JSON, encoding="utf-8-sig") as f:
        data = json.load(f)

    last_updated = data.get("meta", {}).get("lastUpdated", "1900-01-01")
    law_versions = {}
    amendment_found = False

    print("=== 법령 최신 개정 여부 확인 (API 키 불필요) ===\n")

    for law_cfg in LAWS_TO_CHECK:
        print(f"▶ {law_cfg['label']} 확인 중...")
        print(f"  URL: {law_cfg['url']}")

        eff = fetch_effective_date(law_cfg["url"])

        if eff:
            print(f"  시행일: {eff}  (데이터 기준일: {last_updated})")
            law_versions[law_cfg["key"]] = {
                "label":         law_cfg["label"],
                "effectiveDate": eff,
                "url":           law_cfg["url"],
            }
            if eff > last_updated:
                print(f"  ⚠  개정 감지! 새 시행일 {eff} > 기준일 {last_updated}")
                amendment_found = True
            else:
                print(f"  ✓  최신 상태")
        else:
            print(f"  [SKIP] 날짜 파싱 실패 — 건너뜀")
        print()

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # meta 업데이트
    data.setdefault("meta", {})
    data["meta"]["lastChecked"]    = today
    data["meta"]["lawVersions"]    = law_versions
    data["meta"]["amendmentAlert"] = amendment_found

    # contracts.json 저장 (BOM 없이 저장)
    with open(DATA_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # contracts.js 동기화
    json_str = json.dumps(data, ensure_ascii=False, indent=2)
    with open(DATA_JS, "w", encoding="utf-8") as f:
        f.write(f"const CONTRACT_DATA = {json_str};")

    print(f"✓ 완료  (확인일: {today}  개정 감지: {'있음 ⚠' if amendment_found else '없음'})")
    if amendment_found:
        print("  → contracts.json의 meta.lastUpdated와 관련 조문을 갱신하세요.")


if __name__ == "__main__":
    main()
