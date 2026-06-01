"""
법제처 Open API를 사용하여 국가계약법 관련 금액 기준을 실시간 조회하고
contracts.json / contracts.js 를 자동 업데이트하는 스크립트

사용법:
  LAW_API_KEY=<발급키> python scripts/update_law_data.py

GitHub Actions 에서는 secrets.LAW_API_KEY 가 자동으로 주입됩니다.
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone

# ──────────────────────────────────────────────────────────────────────
DATA_JSON = os.path.join(os.path.dirname(__file__), "..", "data", "contracts.json")
DATA_JS   = os.path.join(os.path.dirname(__file__), "..", "data", "contracts.js")

API_KEY  = os.environ.get("LAW_API_KEY", "").strip()

# 법제처 API 엔드포인트 목록 (순서대로 시도)
DRF_BASES = [
    "https://www.law.go.kr/DRF",
    "http://www.law.go.kr/DRF",
]
DRF_BASE = DRF_BASES[0]  # 기본값, api_get 내부에서 자동 폴백


# ──────────────────────────────────────────────────────────────────────
# 금액 파싱 유틸
# ──────────────────────────────────────────────────────────────────────

def parse_korean_amount(text: str) -> int | None:
    """
    한국어 금액 표현을 정수(원)로 변환.
    예: "2천만원" → 20_000_000
        "5천만원" → 50_000_000
        "2억원"   → 200_000_000
        "1억6천만원" → 160_000_000
    """
    text = text.replace(",", "").replace(" ", "")
    total = 0

    m = re.search(r"(\d+)억", text)
    if m:
        total += int(m.group(1)) * 100_000_000

    m = re.search(r"(\d+)천만", text)
    if m:
        total += int(m.group(1)) * 10_000_000

    m = re.search(r"(\d+)백만", text)
    if m:
        total += int(m.group(1)) * 1_000_000

    # 독립 '만' (억·천만·백만 뒤에 오지 않는 경우)
    m = re.search(r"(?<!천)(?<!백)(\d+)만(?!원이)", text)
    if m:
        total += int(m.group(1).replace(",", "")) * 10_000

    return total if total > 0 else None


# ──────────────────────────────────────────────────────────────────────
# 조문별 파서
# ──────────────────────────────────────────────────────────────────────

def parse_suui_amounts(text: str) -> dict:
    """
    시행령 제26조 → 수의계약 기준금액.
    반환: {"suui_1in": int, "suui_upper": int}
    """
    result = {}

    # 1인 견적 상한: "추정가격이 2천만원 이하인 물품의 제조·구매·임차계약"
    m = re.search(r"추정가격이\s*([\d억천백만]+원)\s*이하인\s*물품의\s*제조", text)
    if m:
        amt = parse_korean_amount(m.group(1))
        if amt:
            result["suui_1in"] = amt
            print(f"    수의계약 1인 상한: {amt:,}원")

    # 소기업·소상공인 수의계약 상한: "2천만원 초과 1억원 이하인 계약으로서 … 소기업 또는 소상공인"
    m = re.search(
        r"추정가격이\s*[\d억천백만]+원\s*초과\s*([\d억천백만]+원)\s*이하인\s*계약으로서.*?소기업",
        text,
    )
    if m:
        amt = parse_korean_amount(m.group(1))
        if amt:
            result["suui_upper"] = amt
            print(f"    수의계약 소기업 상한: {amt:,}원")

    return result


def parse_mas_amounts(text: str) -> dict:
    """
    MAS 업무처리규정 제49조 → 2단계경쟁 기준금액.
    반환: {"mas_competition": int, "mas_other": int}
    """
    result = {}

    # 경쟁제품(중소기업자간 경쟁제품) 기준: 통상 1억원
    m = re.search(r"(?:중소기업자간\s*)?경쟁제품.*?([\d억천백만]+원)\s*이상", text)
    if m:
        amt = parse_korean_amount(m.group(1))
        if amt:
            result["mas_competition"] = amt
            print(f"    MAS 경쟁제품 2단계경쟁 기준: {amt:,}원")

    # 그 외 물품 기준: 통상 5천만원
    m = re.search(r"(?:그\s*밖|그\s*외).*?물품.*?([\d억천백만]+원)\s*이상", text)
    if m:
        amt = parse_korean_amount(m.group(1))
        if amt:
            result["mas_other"] = amt
            print(f"    MAS 기타물품 2단계경쟁 기준: {amt:,}원")

    return result


def parse_wto_amounts(text: str) -> dict:
    """
    국제입찰 고시 → WTO 고시금액.
    반환: {"wto_goods": int, "wto_service": int}
    """
    result = {}

    m = re.search(r"물품.*?([\d억천백만]+원)", text)
    if m:
        amt = parse_korean_amount(m.group(1))
        if amt:
            result["wto_goods"] = amt
            print(f"    WTO 물품 고시금액: {amt:,}원")

    m = re.search(r"용역.*?([\d억천백만]+원)", text)
    if m:
        amt = parse_korean_amount(m.group(1))
        if amt:
            result["wto_service"] = amt
            print(f"    WTO 용역 고시금액: {amt:,}원")

    return result


# 조문 → 파서 매핑
PARSER_MAP = {
    "제26조": parse_suui_amounts,
    "제49조": parse_mas_amounts,
    "제2조":  parse_wto_amounts,
}

# 조회할 법령 → 조문 목록
QUERY_ARTICLE_MAP = {
    "국가를 당사자로 하는 계약에 관한 법률 시행령": ["제26조"],
    "물품 다수공급자계약 업무처리규정":             ["제49조"],
    "국제입찰에 관한 고시":                       ["제2조"],
}


# ──────────────────────────────────────────────────────────────────────
# 법제처 Open API 호출
# ──────────────────────────────────────────────────────────────────────

def api_get(endpoint: str, params: dict) -> dict | None:
    params = dict(params)
    params["OC"]   = API_KEY
    params["type"] = "JSON"
    query = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)

    for base in DRF_BASES:
        url = f"{base}/{endpoint}?{query}"
        for attempt in range(3):  # 최대 3회 재시도
            try:
                req = urllib.request.Request(
                    url, headers={"User-Agent": "Mozilla/5.0 contract-guide-updater/2.0"}
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except Exception as exc:
                wait = 2 ** attempt
                print(f"  [WARN] API 호출 실패 (시도 {attempt+1}/3, {base}): {exc}")
                if attempt < 2:
                    print(f"  {wait}초 후 재시도...")
                    time.sleep(wait)
        print(f"  [SKIP] {base} 에서 모두 실패, 다음 엔드포인트 시도")

    print(f"  [ERROR] 모든 엔드포인트 실패 ({endpoint})")
    return None


def search_law(query: str) -> dict | None:
    """법령명으로 검색해 가장 정확한 결과 반환."""
    data = api_get("lawSearch.do", {"target": "law", "query": query, "display": 10})
    if not data:
        return None
    laws = (data.get("LawSearch") or {}).get("law", [])
    if isinstance(laws, dict):
        laws = [laws]
    # 정확매칭 우선
    for law in laws:
        if (law.get("법령명한글") or "").strip() == query.strip():
            return law
    # 포함 매칭
    for law in laws:
        if query in (law.get("법령명한글") or ""):
            return law
    return laws[0] if laws else None


def fetch_article(mst: str, jo: str) -> str | None:
    """법령 MST와 조문 번호(예: '제26조')로 조문 텍스트 반환."""
    m = re.search(r"제(\d+)조", jo)
    jo_code = f"{int(m.group(1)):04d}00" if m else None

    params: dict = {"target": "law", "MST": mst}
    if jo_code:
        params["jo"] = jo_code

    data = api_get("lawService.do", params)
    if not data:
        return None

    # 응답 구조를 재귀 탐색해 조문 텍스트 수집
    raw = json.dumps(data, ensure_ascii=False)

    # jo_code 기반으로 해당 조문 위치 찾기
    marker = jo  # "제26조"
    idx = raw.find(marker)
    if idx != -1:
        snippet = raw[idx: idx + 5000]
        # JSON 이스케이프 제거 후 정리
        snippet = snippet.replace("\\n", " ").replace("\\t", " ").replace('\\"', '"')
        return snippet

    return raw[:5000]  # 폴백: 전체 앞부분


# ──────────────────────────────────────────────────────────────────────
# contracts.json 업데이트
# ──────────────────────────────────────────────────────────────────────

def apply_parsed_values(data: dict, parsed: dict) -> bool:
    """파싱된 금액을 contracts.json 구조에 반영. 변경 있으면 True."""
    changed = False
    meta    = data.setdefault("meta", {})
    thresholds = data.get("thresholds", {})

    def _set(container, key, new_val):
        nonlocal changed
        if container.get(key) != new_val:
            print(f"    {key}: {container.get(key)} → {new_val:,}")
            container[key] = new_val
            changed = True

    # ── 수의계약 1인 상한 ──────────────────────────────────────────
    if "suui_1in" in parsed:
        new_val = parsed["suui_1in"]
        for key in ["goods", "service_general", "service_tech", "service_research"]:
            tier = thresholds.get(key, [])
            if tier:
                if tier[0].get("maxAmount") != new_val:
                    print(f"    thresholds.{key}[0].maxAmount: "
                          f"{tier[0].get('maxAmount')} → {new_val:,}")
                    tier[0]["maxAmount"] = new_val
                    if len(tier) > 1:
                        tier[1]["minAmount"] = new_val
                    changed = True

    # ── 수의계약 소기업 상한 ────────────────────────────────────────
    if "suui_upper" in parsed:
        _set(meta, "suui_upper_threshold", parsed["suui_upper"])

    # ── MAS 기준 ────────────────────────────────────────────────────
    mas_reg = meta.setdefault("masRegulation", {})
    mas_thr = mas_reg.setdefault("thresholds", {})
    if "mas_competition" in parsed:
        if mas_thr.get("competition_product") != parsed["mas_competition"]:
            print(f"    masRegulation.thresholds.competition_product: "
                  f"{mas_thr.get('competition_product')} → {parsed['mas_competition']:,}")
            mas_thr["competition_product"] = parsed["mas_competition"]
            mas_thr["sme_manufacture"]     = parsed["mas_competition"]
            changed = True
    if "mas_other" in parsed:
        if mas_thr.get("other") != parsed["mas_other"]:
            print(f"    masRegulation.thresholds.other: "
                  f"{mas_thr.get('other')} → {parsed['mas_other']:,}")
            mas_thr["other"] = parsed["mas_other"]
            changed = True

    # ── WTO 고시금액 ─────────────────────────────────────────────────
    if "wto_goods"   in parsed:
        _set(meta, "wto_threshold_goods",   parsed["wto_goods"])
    if "wto_service" in parsed:
        _set(meta, "wto_threshold_service", parsed["wto_service"])

    return changed


# ──────────────────────────────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────────────────────────────

def main():
    if not API_KEY:
        print("[ERROR] 환경변수 LAW_API_KEY 가 설정되지 않았습니다.")
        print("  사용법: LAW_API_KEY=<발급키> python scripts/update_law_data.py")
        sys.exit(1)

    print("=" * 60)
    print("법제처 Open API — 법령 데이터 업데이트")
    print("=" * 60)

    with open(DATA_JSON, encoding="utf-8-sig") as f:
        data = json.load(f)

    today        = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    meta         = data.setdefault("meta", {})
    law_versions = meta.get("lawVersions", {})
    amendment_found = False
    all_parsed:  dict = {}

    for query, articles in QUERY_ARTICLE_MAP.items():
        print(f"\n▶ [{query}]")
        law_info = search_law(query)
        if not law_info:
            print("  [SKIP] 검색 결과 없음")
            continue

        mst      = str(law_info.get("법령일련번호") or law_info.get("MST") or "")
        law_name = law_info.get("법령명한글") or query
        pub_raw  = str(law_info.get("공포일자") or "")
        eff_date = (f"{pub_raw[:4]}-{pub_raw[4:6]}-{pub_raw[6:]}"
                    if len(pub_raw) == 8 else pub_raw)

        print(f"  법령명: {law_name}  MST={mst}  공포일≈{eff_date}")

        prev_date = (law_versions.get(query) or {}).get("effectiveDate", "1900-01-01")
        if eff_date > prev_date:
            print(f"  🔔 개정 감지! {prev_date} → {eff_date}")
            amendment_found = True
        else:
            print(f"  ✓ 변경 없음 (이전 확인: {prev_date})")

        law_versions[query] = {
            "label":         law_name,
            "effectiveDate": eff_date,
            "mst":           mst,
            "url":           "https://www.law.go.kr/법령/"
                             + urllib.parse.quote(law_name),
        }

        for jo in articles:
            print(f"  → {jo} 조회 중...")
            text = fetch_article(mst, jo)
            if not text:
                print(f"  [WARN] {jo} 조문 조회 실패")
                continue
            print(f"     조문 텍스트 {len(text)}자 수신")
            parser = PARSER_MAP.get(jo)
            if parser:
                all_parsed.update(parser(text))

    # ── contracts.json 반영 ──────────────────────────────────────────
    print("\n" + "─" * 60)
    print("contracts.json 반영 중...")
    data_changed = apply_parsed_values(data, all_parsed)

    meta["lastChecked"]    = today
    meta["lawVersions"]    = law_versions
    meta["amendmentAlert"] = amendment_found
    if amendment_found or data_changed:
        meta["lastUpdated"] = today

    with open(DATA_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    js_content = json.dumps(data, ensure_ascii=False, indent=2)
    with open(DATA_JS, "w", encoding="utf-8") as f:
        f.write(f"const CONTRACT_DATA = {js_content};\n")

    print(f"\n✅ 완료 ({today})")
    print(f"   개정 감지: {'🔔 있음' if amendment_found else '없음'}")
    print(f"   금액 변경: {'📝 있음' if data_changed else '없음'}")

    if amendment_found:
        print()
        print("⚠️  법령이 개정되었습니다.")
        print("   contracts.json의 상세 절차·주의사항을 수동으로 검토하세요.")
        print("   홈페이지에 '개정 알림 배너'가 자동으로 표시됩니다.")


if __name__ == "__main__":
    main()
