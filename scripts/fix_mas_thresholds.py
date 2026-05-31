"""
MAS 2단계경쟁 업무처리기준 제2조 기반으로
goods_mas 구간을 3개 유형별로 재구성합니다.

근거: 물품 다수공급자계약 2단계경쟁 업무처리기준 제2조
  - 중소기업자간 경쟁제품: 1억원 이상 시 2단계경쟁 의무
  - 중소기업 제조물품(경쟁제품 공급물품 제외): 1억원 미만 면제(예외), 1억 이상 의무
  - 그 외 일반물품: 5천만원 이상 시 2단계경쟁 의무
"""
import json, os

BASE = os.path.join(os.path.dirname(__file__), "..")
JSON_PATH = os.path.join(BASE, "data", "contracts.json")
JS_PATH   = os.path.join(BASE, "data", "contracts.js")

with open(JSON_PATH, encoding="utf-8") as f:
    data = json.load(f)

# ── 1. meta에 MAS 법령 추적 정보 추가 ──────────────────────────────────────
data["meta"]["masRegulation"] = {
    "name": "물품 다수공급자계약 2단계경쟁 업무처리기준",
    "article": "제2조 (제안요청 기준)",
    "authority": "조달청",
    "url": "https://www.law.go.kr/admRulLsInfoP.do?admRulSeq=2100000187675",
    "lastChecked": "2026-06-01",
    "thresholds": {
        "competition_product": 100000000,
        "sme_manufacture":     100000000,
        "other":                50000000
    },
    "note": "법령 개정 시 thresholds 값을 수정하면 사이트 전체에 자동 반영됩니다."
}

# ── 2. masProductTypes 배열 추가 ──────────────────────────────────────────
data["masProductTypes"] = [
    {
        "id":    "goods_mas_competition",
        "label": "중소기업자간 경쟁제품",
        "desc":  "중소벤처기업부장관이 경쟁제품으로 고시한 물품 (중소기업 판로지원법 제6조)"
    },
    {
        "id":    "goods_mas_sme",
        "label": "중소기업이 제조하는 물품",
        "desc":  "경쟁제품 공급물품에 해당하지 않는 중소기업 제조 물품"
    },
    {
        "id":    "goods_mas_other",
        "label": "그 외 물품",
        "desc":  "위 두 유형에 해당하지 않는 일반 물품"
    }
]

# ── 공통 법령 근거 ─────────────────────────────────────────────────────────
LEGAL = [
    {
        "law":     "조달사업에 관한 법률",
        "article": "제9조의2",
        "summary": "다수공급자계약(MAS) — 품질·성능·효율이 같거나 유사한 물품을 2인 이상과 단가계약 후 수요기관이 선택 구매",
        "url":     "https://www.law.go.kr/법령/조달사업에관한법률"
    },
    {
        "law":     "물품 다수공급자계약 2단계경쟁 업무처리기준",
        "article": "제2조 (제안요청 기준)",
        "summary": "2단계경쟁 의무 금액: 중소기업자간 경쟁제품 1억원 이상 / 그 외 물품 5천만원 이상",
        "url":     "https://www.law.go.kr/admRulLsInfoP.do?admRulSeq=2100000187675"
    }
]

# ── 공통 절차 ──────────────────────────────────────────────────────────────
PROC_DIRECT = [
    {"text": "나라장터 종합쇼핑몰(shopping.g2b.go.kr)에서 해당 물품 검색"},
    {"text": "MAS 계약 물품 목록에서 규격·가격 비교 후 공급업체 선택"},
    {"text": "내부결재(품의) 작성 및 예산 확인"},
    {"text": "수요기관 구매요청서 작성 및 발주"},
    {"text": "납품 검수 및 검사조서 작성"},
    {"text": "대금 지급 (구매카드 또는 계좌이체)"}
]

PROC_2STAGE = [
    {"text": "나라장터 종합쇼핑몰에서 해당 규격 MAS 물품 목록 확인"},
    {"text": "내부결재(품의) 작성 및 예산 확인"},
    {"text": "나라장터 2단계경쟁 공고 게시 (규격·평가기준·제출서류 명시)"},
    {"text": "1단계: 규격 적합성 확인 (MAS 계약 물품 해당 여부)"},
    {"text": "2단계: 제안서 평가 (가격·납품실적·납기 등 종합 비교)"},
    {"text": "낙찰 업체 선정 및 발주"},
    {"text": "납품 검수 및 검사조서 작성"},
    {"text": "대금 지급"}
]

WARN_DIRECT_COMMON = [
    "나라장터 쇼핑몰에 등록된 물품에 한해 MAS 구매 가능 — 미등록 물품은 일반 구매(입찰/수의계약) 절차를 따르세요.",
    "직접생산확인서 보유 업체 여부를 반드시 확인하세요 (직접생산 위반 적발 시 계약 취소, 부정당업자 제재).",
    "특정 업체 지정 유도 등 불공정 조달행위 금지 (조달사업법 제21조)."
]

WARN_2STAGE_COMMON = [
    "평가기준 및 배점을 공고문에 반드시 명시해야 합니다.",
    "직접생산확인서 보유 업체 여부 확인 필수.",
    "금액 분할을 통한 2단계경쟁 회피는 위법입니다 (업무처리기준 제2조 제6항).",
    "선금 지급 비율: 계약금액 3억 이하 50%, 3억 초과~10억 이하 40%, 10억 초과 30% 이내.",
    "지체상금률: 1일당 계약금액의 1,000분의 0.75 (물품)."
]

EXC_DIRECT   = ["긴급 재난·재해 시 별도 절차 적용 가능 (국가계약법 시행령 제26조)"]
EXC_2STAGE   = [
    "재해복구·방역 등 긴급 사유 시 2단계경쟁 예외 가능 (업무처리기준 제2조 제3항)",
    "규격 적합 업체가 1개인 경우 사유 기재 후 해당 업체와 계약 가능"
]

# ── 3. 유형별 thresholds 생성 ────────────────────────────────────────────

# ① 중소기업자간 경쟁제품  (기준: 1억원)
data["thresholds"]["goods_mas_competition"] = [
    {
        "id": "gmc-1", "minAmount": 0, "maxAmount": 99999999,
        "contractMethod": "나라장터 쇼핑몰 직접구매 (2단계경쟁 면제 — 1억원 미만)",
        "methodBadge": "MAS",
        "legalBasis": LEGAL,
        "procedures": PROC_DIRECT,
        "warnings": WARN_DIRECT_COMMON + [
            "중소기업자간 경쟁제품은 1억원 이상부터 2단계경쟁 의무 — 1억원 미만은 직접구매 가능합니다 (업무처리기준 제2조 제1항)."
        ],
        "exceptions": EXC_DIRECT
    },
    {
        "id": "gmc-2", "minAmount": 100000000, "maxAmount": None,
        "contractMethod": "나라장터 쇼핑몰 2단계경쟁 의무 (경쟁제품 · 1억원 이상)",
        "methodBadge": "MAS",
        "legalBasis": LEGAL,
        "procedures": PROC_2STAGE,
        "warnings": WARN_2STAGE_COMMON + [
            "중소기업자간 경쟁제품은 제안 최저가격을 계약가격의 90% 미만으로 제안할 수 없습니다 (업무처리기준 제8조)."
        ],
        "exceptions": EXC_2STAGE
    }
]

# ② 중소기업 제조물품 (비경쟁제품)  (기준: 1억원, 예외 규정 있음)
data["thresholds"]["goods_mas_sme"] = [
    {
        "id": "gms-1", "minAmount": 0, "maxAmount": 99999999,
        "contractMethod": "나라장터 쇼핑몰 직접구매 (예외 규정 — 1억원 미만 면제)",
        "methodBadge": "MAS",
        "legalBasis": LEGAL,
        "procedures": PROC_DIRECT,
        "warnings": WARN_DIRECT_COMMON + [
            "중소기업이 제조하는 물품(경쟁제품 공급물품 제외)은 1억원 미만인 경우 2단계경쟁 없이 직접구매 가능합니다 (업무처리기준 제2조 제2항 단서).",
            "해당 공급업체가 실제 중소기업 제조업체인지 반드시 사전 확인하세요."
        ],
        "exceptions": EXC_DIRECT
    },
    {
        "id": "gms-2", "minAmount": 100000000, "maxAmount": None,
        "contractMethod": "나라장터 쇼핑몰 2단계경쟁 의무 (중소기업 제조물품 · 1억원 이상)",
        "methodBadge": "MAS",
        "legalBasis": LEGAL,
        "procedures": PROC_2STAGE,
        "warnings": WARN_2STAGE_COMMON,
        "exceptions": EXC_2STAGE
    }
]

# ③ 그 외 일반물품  (기준: 5천만원)
data["thresholds"]["goods_mas_other"] = [
    {
        "id": "gmo-1", "minAmount": 0, "maxAmount": 49999999,
        "contractMethod": "나라장터 쇼핑몰 직접구매 (2단계경쟁 면제 — 5천만원 미만)",
        "methodBadge": "MAS",
        "legalBasis": LEGAL,
        "procedures": PROC_DIRECT,
        "warnings": WARN_DIRECT_COMMON + [
            "중소기업자간 경쟁제품·중소기업 제조물품 이외의 물품은 5천만원 이상부터 2단계경쟁 의무입니다 (업무처리기준 제2조 제1항)."
        ],
        "exceptions": EXC_DIRECT
    },
    {
        "id": "gmo-2", "minAmount": 50000000, "maxAmount": None,
        "contractMethod": "나라장터 쇼핑몰 2단계경쟁 의무 (그 외 물품 · 5천만원 이상)",
        "methodBadge": "MAS",
        "legalBasis": LEGAL,
        "procedures": PROC_2STAGE,
        "warnings": WARN_2STAGE_COMMON + [
            "WTO 고시금액(약 2억 3,000만원, 2025~2026년 기준) 이상 시 국제입찰 적용 여부도 별도 검토하세요."
        ],
        "exceptions": EXC_2STAGE
    }
]

# ── 4. 기존 잘못된 goods_mas 제거 ────────────────────────────────────────
data["thresholds"].pop("goods_mas", None)

# ── 5. 저장 ───────────────────────────────────────────────────────────────
json_str = json.dumps(data, ensure_ascii=False, indent=2)
with open(JSON_PATH, "w", encoding="utf-8") as f:
    f.write(json_str)
with open(JS_PATH, "w", encoding="utf-8") as f:
    f.write("const CONTRACT_DATA = " + json_str + ";")

# 검증
assert "goods_mas" not in data["thresholds"]
for key in ("goods_mas_competition", "goods_mas_sme", "goods_mas_other"):
    assert key in data["thresholds"], f"missing {key}"
    assert len(data["thresholds"][key]) == 2
assert "masProductTypes" in data
assert "masRegulation" in data["meta"]

print("=== 완료 ===")
for key in ("goods_mas_competition", "goods_mas_sme", "goods_mas_other"):
    rows = data["thresholds"][key]
    for r in rows:
        print(f"  {r['id']}: {r['minAmount']:,} ~ {r['maxAmount']} | {r['contractMethod'][:30]}")
