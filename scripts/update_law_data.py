"""
Playwright 헤드리스 브라우저로 법제처 웹페이지를 완전 렌더링하여
국가계약법 관련 금액 기준을 실시간 파싱하고
contracts.json / contracts.js 를 자동 업데이트하는 스크립트

GitHub Actions 에서 playwright가 자동으로 설치됩니다.
로컬 실행: pip install playwright && playwright install chromium
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

DATA_JSON = os.path.join(os.path.dirname(__file__), "..", "data", "contracts.json")
DATA_JS   = os.path.join(os.path.dirname(__file__), "..", "data", "contracts.js")

# ──────────────────────────────────────────────────────────────────────
# 금액 파싱 유틸
# ──────────────────────────────────────────────────────────────────────

def parse_korean_amount(text: str) -> int | None:
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
    m = re.search(r"(?<!천)(?<!백)(\d+)만(?!원이)", text)
    if m:
        total += int(m.group(1)) * 10_000
    return total if total > 0 else None


# ──────────────────────────────────────────────────────────────────────
# 법제처 페이지 스크래핑 (Playwright)
# ──────────────────────────────────────────────────────────────────────

LAW_PAGES = {
    "시행령_제26조": {
        "url":   "https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률시행령",
        "jo":    "제26조",
        "label": "국가계약법 시행령",
    },
    "MAS규정_제49조": {
        "url":   "https://www.law.go.kr/행정규칙/물품다수공급자계약업무처리규정",
        "jo":    "제49조",
        "label": "물품 다수공급자계약 업무처리규정",
    },
    "국제입찰고시": {
        "url":   "https://www.law.go.kr/행정규칙/국제입찰에관한고시",
        "jo":    "제2조",
        "label": "국제입찰에 관한 고시",
    },
}


def fetch_article_text(page, url: str, jo: str) -> str | None:
    """Playwright page 객체로 법령 조문 텍스트를 추출."""
    try:
        page.goto(url, wait_until="networkidle", timeout=30000)

        # 조문 번호 클릭 또는 전체 텍스트 대기
        page.wait_for_timeout(2000)

        # 전체 조문 텍스트 추출
        full_text = page.inner_text("body")

        # 해당 조문 부분만 추출
        jo_num = re.search(r"제(\d+)조", jo)
        if not jo_num:
            return full_text

        n = int(jo_num.group(1))
        # 제N조 ~ 제N+1조 사이 텍스트
        pattern = rf"제{n}조.*?(?=제{n+1}조|$)"
        m = re.search(pattern, full_text, re.DOTALL)
        if m:
            article = m.group(0)[:5000]
            print(f"    조문 텍스트 {len(article)}자 추출")
            return article

        # 조문을 못 찾으면 전체 텍스트 반환
        return full_text[:8000]

    except Exception as exc:
        print(f"  [ERROR] 페이지 로딩 실패: {exc}")
        return None


def get_effective_date(page, url: str) -> str | None:
    """법령 페이지에서 시행일 추출."""
    try:
        page.goto(url, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1000)
        text = page.inner_text("body")
        m = re.search(r"시행\s*(\d{4})[.\s]+(\d{1,2})[.\s]+(\d{1,2})", text)
        if m:
            y, mo, d = m.group(1), m.group(2).zfill(2), m.group(3).zfill(2)
            return f"{y}-{mo}-{d}"
        # efYd 파라미터에서 추출
        current_url = page.url
        m2 = re.search(r"efYd=(\d{8})", current_url)
        if m2:
            s = m2.group(1)
            return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    except Exception as exc:
        print(f"  [WARN] 시행일 추출 실패: {exc}")
    return None


# ──────────────────────────────────────────────────────────────────────
# 개별 파서
# ──────────────────────────────────────────────────────────────────────

def parse_suui_amounts(text: str) -> dict:
    result = {}
    # 1인 수의계약 상한: "2천만원 이하인 물품의 제조·구매·임차계약"
    m = re.search(r"추정가격이\s*([\d억천백만]+원)\s*이하인\s*물품의\s*제조", text)
    if m:
        amt = parse_korean_amount(m.group(1))
        if amt:
            result["suui_1in"] = amt
            print(f"    수의계약 1인 상한: {amt:,}원")

    # 소기업·소상공인 수의계약 상한
    m = re.search(
        r"추정가격이\s*[\d억천백만]+원\s*초과\s*([\d억천백만]+원)\s*이하인\s*계약으로서.*?소기업",
        text, re.DOTALL
    )
    if m:
        amt = parse_korean_amount(m.group(1))
        if amt:
            result["suui_upper"] = amt
            print(f"    수의계약 소기업 상한: {amt:,}원")
    return result


def parse_mas_amounts(text: str) -> dict:
    result = {}
    m = re.search(r"(?:중소기업자간\s*)?경쟁제품.*?([\d억천백만]+원)\s*이상", text, re.DOTALL)
    if m:
        amt = parse_korean_amount(m.group(1))
        if amt:
            result["mas_competition"] = amt
            print(f"    MAS 경쟁제품 기준: {amt:,}원")

    m = re.search(r"(?:그\s*밖|그\s*외).*?물품.*?([\d억천백만]+원)\s*이상", text, re.DOTALL)
    if m:
        amt = parse_korean_amount(m.group(1))
        if amt:
            result["mas_other"] = amt
            print(f"    MAS 기타물품 기준: {amt:,}원")
    return result


def parse_wto_amounts(text: str) -> dict:
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


PARSER_MAP = {
    "제26조": parse_suui_amounts,
    "제49조": parse_mas_amounts,
    "제2조":  parse_wto_amounts,
}


# ──────────────────────────────────────────────────────────────────────
# contracts.json 업데이트
# ──────────────────────────────────────────────────────────────────────

def apply_parsed_values(data: dict, parsed: dict) -> bool:
    changed  = False
    meta     = data.setdefault("meta", {})
    thresholds = data.get("thresholds", {})

    def _set(container, key, new_val):
        nonlocal changed
        if container.get(key) != new_val:
            print(f"    {key}: {container.get(key)} → {new_val:,}")
            container[key] = new_val
            changed = True

    if "suui_1in" in parsed:
        new_val = parsed["suui_1in"]
        for key in ["goods", "service_general", "service_tech", "service_research"]:
            tier = thresholds.get(key, [])
            if tier and tier[0].get("maxAmount") != new_val:
                print(f"    thresholds.{key}[0].maxAmount: {tier[0].get('maxAmount')} → {new_val:,}")
                tier[0]["maxAmount"] = new_val
                if len(tier) > 1:
                    tier[1]["minAmount"] = new_val
                changed = True

    if "suui_upper" in parsed:
        _set(meta, "suui_upper_threshold", parsed["suui_upper"])

    mas_reg = meta.setdefault("masRegulation", {})
    mas_thr = mas_reg.setdefault("thresholds", {})

    if "mas_competition" in parsed:
        if mas_thr.get("competition_product") != parsed["mas_competition"]:
            print(f"    MAS 경쟁제품: {mas_thr.get('competition_product')} → {parsed['mas_competition']:,}")
            mas_thr["competition_product"] = parsed["mas_competition"]
            mas_thr["sme_manufacture"]     = parsed["mas_competition"]
            changed = True

    if "mas_other" in parsed:
        if mas_thr.get("other") != parsed["mas_other"]:
            print(f"    MAS 기타: {mas_thr.get('other')} → {parsed['mas_other']:,}")
            mas_thr["other"] = parsed["mas_other"]
            changed = True

    if "wto_goods"   in parsed: _set(meta, "wto_threshold_goods",   parsed["wto_goods"])
    if "wto_service" in parsed: _set(meta, "wto_threshold_service", parsed["wto_service"])

    return changed


# ──────────────────────────────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────────────────────────────

def main():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[ERROR] playwright 미설치. pip install playwright && playwright install chromium")
        sys.exit(1)

    print("=" * 60)
    print("법제처 웹 스크래핑 — 법령 데이터 업데이트")
    print("=" * 60)

    with open(DATA_JSON, encoding="utf-8-sig") as f:
        data = json.load(f)

    today        = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    meta         = data.setdefault("meta", {})
    law_versions = meta.get("lawVersions", {})
    amendment_found = False
    all_parsed: dict = {}

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        context = browser.new_context(
            locale="ko-KR",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        page = context.new_page()

        for key, cfg in LAW_PAGES.items():
            jo    = cfg["jo"]
            url   = cfg["url"]
            label = cfg["label"]
            print(f"\n▶ [{label}] {jo}")

            # 시행일 조회
            eff_date = get_effective_date(page, url)
            if not eff_date:
                print(f"  [SKIP] 시행일 조회 실패")
                continue

            print(f"  시행일: {eff_date}")
            prev_date = (law_versions.get(key) or {}).get("effectiveDate", "1900-01-01")

            if eff_date > prev_date:
                print(f"  🔔 개정 감지! {prev_date} → {eff_date}")
                amendment_found = True
            else:
                print(f"  ✓ 변경 없음 (이전: {prev_date})")

            law_versions[key] = {
                "label":         label,
                "effectiveDate": eff_date,
                "url":           url,
            }

            # 조문 텍스트 파싱
            print(f"  조문 텍스트 추출 중...")
            text = fetch_article_text(page, url, jo)
            if not text:
                print(f"  [WARN] 조문 추출 실패")
                continue

            parser = PARSER_MAP.get(jo)
            if parser:
                all_parsed.update(parser(text))

        browser.close()

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
        print("\n⚠️  법령이 개정되었습니다. 홈페이지에 개정 알림 배너가 표시됩니다.")


if __name__ == "__main__":
    main()
