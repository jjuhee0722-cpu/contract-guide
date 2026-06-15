# 국가기관 계약방법 조회 사이트 — 프로젝트 컨텍스트

## 프로젝트 개요
공무원이 물품구매·용역 발주 시 금액·유형·특수조건을 단계별로 입력하면 **계약방법·낙찰자 결정방법·절차·주의사항**을 자동으로 안내하는 정적 웹사이트.

- **배포 URL**: https://jjuhee0722-cpu.github.io/contract-guide/
- **GitHub**: https://github.com/jjuhee0722-cpu/contract-guide
- **로컬 경로**: `C:\Users\LG\Desktop\용역·물품 구매 관리\contract-guide\`

## 파일 구조
```
contract-guide/
├── index.html          # 단일 진입점
├── css/style.css       # 반응형 스타일 (진행바, 특수조건 체크박스, WTO 배너 포함)
├── js/app.js           # 핵심 로직 (마법사 4단계 + 낙찰방법 자동 도출)
├── data/
│   ├── contracts.json  # 법령 데이터 — 유일한 정기 수정 대상
│   └── contracts.js    # 오프라인 폴백 (contracts.json과 항상 동기화)
├── scripts/
│   ├── check_law_updates.py     # 법령 개정 자동 체크 스크립트
│   └── fix_mas_thresholds.py    # MAS 구간 재구성 유틸 (참고용)
└── .github/workflows/
    └── check-law-updates.yml    # 매주 월요일 자동 실행 GitHub Actions
```

## contracts.js 동기화 규칙
contracts.json 수정 후 반드시 아래 명령 실행:
```bash
python -c "
import json
with open('data/contracts.json', encoding='utf-8') as f:
    data = json.load(f)
json_str = json.dumps(data, ensure_ascii=False, indent=2)
with open('data/contracts.js', 'w', encoding='utf-8') as f:
    f.write('const CONTRACT_DATA = ' + json_str + ';')
print('OK')
"
```

## 현재 데이터 구조 (contracts.json)

### meta
- `lastUpdated`: 법령 데이터 기준일 (현재: 2026-05-12)
- `masRegulation`: MAS 2단계경쟁 업무처리규정 정보
  - 근거: 물품 다수공급자계약 업무처리규정 제49조 (조달청 훈령, admRulSeq=2100000276242)
  - 기준금액: 경쟁제품 1억원 / SME제조 1억원(예외 면제) / 그 외 5천만원

### thresholds 키 목록
| 키 | 설명 |
|----|------|
| `goods` | 물품 일반 구매 (수의계약/경쟁입찰 4구간) |
| `goods_mas_competition` | MAS + 중소기업자간 경쟁제품 (1억 기준, 2구간) |
| `goods_mas_sme` | MAS + 중소기업 제조물품 비경쟁제품 (1억 기준 예외, 2구간) |
| `goods_mas_other` | MAS + 그 외 일반물품 (5천만 기준, 2구간) |
| `service_general` | 일반용역 (4구간) |
| `service_tech` | 기술용역 — IT·설계·엔지니어링 (4구간) |
| `service_research` | 연구용역 (4구간) |
| `service_academic` | 학술·자문용역 (4구간) ← **신규 추가** |

### 주요 배열
- `goodsSubTypes`: 물품 구매방식 선택 (일반구매 / MAS)
- `masProductTypes`: MAS 물품유형 선택 (경쟁제품 / SME제조 / 그 외)
- `serviceSubTypes`: 용역유형 선택 (일반/기술/연구/학술·자문)
- `serviceTypeMeta`: 용역 유형별 참고 법령 (details 포함)

## UI 흐름 (마법사 4단계)
```
STEP 1: 물품/용역 선택
STEP 2:
  - 물품 → MAS 이용 가능 여부 (가능 → STEP 2-1, 불가 → STEP 3)
  - 용역 → 일반/기술/연구/학술·자문 선택
STEP 2-1 (MAS만): 물품 유형 선택 (경쟁제품/SME/그 외)
STEP 3: 추정가격 입력 (단위: 백만원, 빠른선택 버튼 제공)
         → "다음 → 특수조건 확인" 버튼
STEP 4: 특수조건 확인 (체크박스 복수선택)
  - 물품: 특정인 기술·특허 / 긴급조달 / 해당없음
  - 용역: 기술제안서 평가 필요 / 복잡 대형사업 / 소기업·소상공인 / 해당없음
         → 🔍 계약방법·낙찰방법 조회하기 버튼
결과:
  - 낙찰자 결정방법 (자동 도출: 소액수의/적격심사/협상RFP/MAS 2단계경쟁 등)
  - WTO 경고 배너 (고시금액 2억3천만원 이상 시 자동 표시)
  - 중소기업 제한경쟁 가능 안내
  - 계약방법, 근거법령, 필수절차, 주의사항(경중 분리), 예외사항
  - 조달 검토 체크리스트 (분할발주, 제한요건, 예정가격, 보증금, 검사·검수 등)
  - 계약 서류·공식 서식 링크 (국가계약법 시행규칙 별지서식 직접 링크)
  - 인쇄/클립보드복사/처음부터 버튼
```

### 낙찰방법 자동 도출 로직 (app.js: determineAwardMethod)
| 조건 | 낙찰방법 |
|------|----------|
| 특정인 기술·특허 체크 | 수의계약 (특수조건) |
| 긴급조달 체크 | 수의계약 (긴급) |
| 2천만원 이하 | 소액수의계약 |
| MAS 해당 | MAS 직접구매 or 2단계경쟁 |
| 기술·IT용역 or 기술제안서 평가 필요 체크 | 협상에 의한 계약(RFP) |
| 복잡 대형사업 체크 | 대안입찰/일괄입찰 |
| 학술·연구용역 | 협상(제안요청) or 학술연구 특례 수의계약 |
| 2억3천만원 이상 | WTO 경고 + 일반경쟁 |
| 5천만원 초과~2억3천만원 | 적격심사 + 중소기업 제한경쟁 안내 |

## 법령 자동 모니터링 (GitHub Actions)
- 스케줄: 매주 월요일 오전 9시 KST
- 모니터링 대상:
  1. 국가계약법 (본법)
  2. 국가계약법 시행령
  3. 국가계약법 시행규칙
  4. 물품 다수공급자계약 업무처리규정 (MAS 2단계경쟁 기준)
- 결과: contracts.json meta.lawVersions 갱신, amendmentAlert 배너 표시

## MCP 커넥터
- **법제처 MCP** (`mcp__9d675d58-fc0f-4e3e-adad-4fe68cad0a97__*`):
  - `search_law`: 법령명 검색
  - `get_law_text`: 법령 조문 조회 (mst/lawId 필요)
  - `search_admin_rule` / `get_admin_rule` (execute_tool 경유): 행정규칙 조회
  - `discover_tools`: 추가 도구 검색
  - `execute_tool`: 발견된 도구 실행

## 주요 법령 기준 (현행)
| 항목 | 기준 | 근거 |
|------|------|------|
| 수의계약 1인 상한 | 2,000만원 | 시행령 제26조①5가 |
| 수의계약 2인 상한 | 5,000만원 | 시행령 제26조①5나 |
| 경쟁입찰 기준 | 2억원 초과 | 시행령 제21조 |
| WTO 국제입찰 기준 | 약 2억 3,000만원 | 기재부 고시 (2025~2026) |
| 낙찰하한율 | 86.245% | 조달청 고시 (2026.5.26~) |
| MAS 2단계경쟁 (경쟁제품) | 1억원 이상 | 업무처리규정 제49조①1 |
| MAS 2단계경쟁 (그 외) | 5천만원 이상 | 업무처리규정 제49조①2 |
| MAS 중소기업 제조 예외 | 5천만~1억 미만 면제 | 업무처리규정 제49조④ |

## 알려진 이슈 및 TODO
- [ ] WTO 고시금액 2억 3,000만원 — 2년마다 갱신되므로 기재부 고시 주기적 확인 필요
- [ ] 용역 serviceTypeMeta details에 법령 정보 추가 가능 (엔지니어링대가, SW개발 등)
- [ ] 인쇄 스타일 추가 개선 가능

## 개발 환경
- Python 3.x (contracts.js 동기화, 법령 체크 스크립트)
- 빌드 도구 없음 — 정적 파일 그대로 사용
- GitHub Pages 배포 (master 브랜치 자동 배포)
