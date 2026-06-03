/* ── 절차 법령 ref → URL 자동 매핑 (조문 딥링크 지원) ── */
const PROC_REF_URL_MAP = [
  { prefix: '시행규칙', url: 'https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률시행규칙' },
  { prefix: '시행령',   url: 'https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률시행령' },
  { prefix: '본법',     url: 'https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률' },
];

/* 법령명 → base URL 매핑 (경고 텍스트 내 참조용) */
const LAW_NAME_URL_MAP = {
  '시행규칙': 'https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률시행규칙',
  '시행령':   'https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률시행령',
  '본법':     'https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률',
  '국가계약법 시행령': 'https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률시행령',
  '국가계약법 시행규칙': 'https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률시행규칙',
  '조달청 고시': 'https://www.pps.go.kr',
  '업무처리기준': 'https://www.law.go.kr/admRulLsInfoP.do?admRulSeq=2100000276242',
  '업무처리규정': 'https://www.law.go.kr/admRulLsInfoP.do?admRulSeq=2100000276242',
};

/**
 * ref 문자열에서 조문 번호를 추출하여 딥링크 URL 생성
 * 예: "시행령 제43조" → "https://www.law.go.kr/법령/.../제43조"
 * 예: "시행규칙 제44조" → "https://www.law.go.kr/법령/.../제44조"
 * 복합 참조(제55조·제58조)는 첫 번째 조문으로 딥링크
 */
function getProcRefUrl(ref) {
  if (!ref) return null;
  for (const { prefix, url } of PROC_REF_URL_MAP) {
    if (ref.startsWith(prefix)) {
      // "제13조의2" 같은 패턴도 지원
      const artMatch = ref.match(/제(\d+조(?:의\d+)?)/);
      if (artMatch) {
        return url + '/제' + artMatch[1];
      }
      return url;
    }
  }
  return null;
}

/**
 * 경고/참고정보 텍스트 내 법령 참조를 자동 감지하여 링크로 변환
 * 예: "(시행규칙 제44조)" → 클릭 가능한 링크
 * 예: "(시행령 제64조)" → 클릭 가능한 링크
 */
function linkifyLawRefs(escapedText) {
  // 괄호 안의 법령 참조: (시행령 제26조), (시행규칙 제44조) 등
  return escapedText.replace(
    /\(([^)]*?(시행규칙|시행령|본법|업무처리기준|업무처리규정|조달청 고시)[^)]*?)\)/g,
    function(match, inner) {
      // 법령명 매칭
      let baseUrl = null;
      let lawKey = null;
      for (const [key, url] of Object.entries(LAW_NAME_URL_MAP)) {
        if (inner.includes(key)) {
          baseUrl = url;
          lawKey = key;
          break;
        }
      }
      if (!baseUrl) return match;

      // 조문 번호 추출 ("제13조의2" 같은 패턴 지원)
      const artMatch = inner.match(/제(\d+조(?:의\d+)?)/);
      let finalUrl = baseUrl;
      if (artMatch && (lawKey === '시행규칙' || lawKey === '시행령' || lawKey === '본법'
          || lawKey === '국가계약법 시행령' || lawKey === '국가계약법 시행규칙')) {
        finalUrl = baseUrl + '/제' + artMatch[1];
      }

      return `(<a class="warn-law-link" href="${finalUrl}" target="_blank" rel="noopener" title="${inner} 원문 보기">${inner} ↗</a>)`;
    }
  );
}

/* ── 주의사항 경중 분류 ── */
const WARN_REF_PATTERNS = [
  /^선금\s*지급\s*비율/,
  /^지체상금률/,
  /^물가변동\s*조정/,
  /^WTO\s*고시금액/,
  /^부정당업자\s*제재/,
  /^낙찰하한율\(/,
  /^협상\s*기간은/,
  /^협상적격자\s*선정\s*기준/,
  /^계약보증금\s*납부\s*원칙/,
];

function isRefWarning(text) {
  return WARN_REF_PATTERNS.some(re => re.test(text));
}

/* ── 법령 개정 알림 배너 ── */
function renderAmendmentBanner(meta) {
  const banner = document.getElementById('amendmentBanner');
  if (!banner || !meta) return;
  const lastChecked = meta.lastChecked;
  const alert       = meta.amendmentAlert;
  const versions    = meta.lawVersions || {};
  if (!lastChecked) { banner.style.display = 'none'; return; }
  if (alert) {
    const changed = Object.values(versions)
      .filter(v => v.effectiveDate > (meta.lastUpdated || ''))
      .map(v => `<strong>${escHtml(v.label)}</strong> (시행일 ${escHtml(v.effectiveDate)})`)
      .join(', ');
    banner.className = 'amendment-banner amendment-alert';
    banner.innerHTML = `⚠ 법령 개정 감지! ${changed || '일부 법령이 변경되었습니다'} — 내용을 확인 후 데이터를 갱신하세요.`;
  } else {
    banner.className = 'amendment-banner amendment-ok';
    banner.innerHTML = `✓ 법령 최신 확인: ${escHtml(lastChecked)} — 현재 데이터는 최신 법령과 일치합니다.`;
  }
  banner.style.display = 'block';
}

/* ── Data Loader ── */
async function loadData() {
  if (typeof CONTRACT_DATA !== 'undefined') return CONTRACT_DATA;
  try {
    const res = await fetch('./data/contracts.json');
    if (!res.ok) throw new Error('fetch failed');
    return await res.json();
  } catch {
    throw new Error('데이터를 불러올 수 없습니다. 서버 환경에서 열거나 contracts.js 파일을 확인하세요.');
  }
}

/* ── Amount Formatter ── */
function formatComma(n) {
  if (!n && n !== 0) return '';
  return Number(n).toLocaleString('ko-KR');
}

const UNITS = [
  [1_0000_0000, '억'],
  [1000_0000,   '천만'],
  [100_0000,    '백만'],
  [10_0000,     '십만'],
  [1_0000,      '만'],
  [1000,        '천'],
];

function toKorean(n) {
  if (!n || n <= 0) return '';
  let result = '';
  let remain = n;
  for (const [val, label] of UNITS) {
    const count = Math.floor(remain / val);
    if (count > 0) {
      result += `${count}${label} `;
      remain -= count * val;
    }
  }
  return result.trim() + '원';
}

/* ── 금액 구간 레이블 생성 ── */
function getRangeLabel(rule) {
  if (!rule) return '';
  const min = rule.minAmount;
  const max = rule.maxAmount;
  if (min === 0 && max !== null) return `추정가격 ${toKorean(max)} 이하 구간`;
  if (max === null) return `추정가격 ${toKorean(min)} 초과 구간`;
  return `추정가격 ${toKorean(min)} 초과 ~ ${toKorean(max)} 이하 구간`;
}

/* ── Threshold Matcher ── */
function findThreshold(data, key, amount) {
  const rules = data.thresholds[key];
  if (!rules) return null;
  return rules.find(r =>
    amount >= r.minAmount && (r.maxAmount === null || amount <= r.maxAmount)
  ) || null;
}

/* ── 다음 카드로 부드럽게 스크롤 ── */
function scrollToCard(cardId) {
  const el = document.getElementById(cardId);
  if (!el || el.style.display === 'none') return;
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

/* ── Progress Bar ── */
function updateProgress(activeStep) {
  const steps = document.querySelectorAll('.progress-step');
  const order = ['1', '2', '3', '4', 'R'];
  const activeIdx = order.indexOf(String(activeStep));
  steps.forEach(s => {
    const idx = order.indexOf(s.dataset.step);
    s.classList.remove('active', 'done');
    if (idx < activeIdx) s.classList.add('done');
    else if (idx === activeIdx) s.classList.add('active');
  });
}

/* ── 특수조건 체크박스 값 가져오기 ── */
function getSpecialConditions() {
  const isGoods = selectedCategory === 'goods';
  const name = isGoods ? 'goodsCond' : 'serviceCond';
  const checked = Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
    .map(cb => cb.value);
  if (checked.includes('none')) return ['none'];
  return checked;
}

/* ── WTO 고시금액 (중앙행정기관 기준) ── */
const WTO_THRESHOLD = 230000000;

/* ── 낙찰방법 결정 로직 ── */
function determineAwardMethod(rule, amount, conditions, category, serviceType) {
  const isMas = rule && rule.methodBadge === 'MAS';

  if (conditions.includes('sole_source')) {
    return {
      name: '수의계약 (특수조건 — 특정인 기술·특허)',
      ref: '시행령 제26조 제1항 제3호',
      override: true,
      condLabel: '특정인의 기술·특허·상표 등으로 대체 불가'
    };
  }
  if (conditions.includes('emergency')) {
    return {
      name: '수의계약 (긴급 조달)',
      ref: '시행령 제26조 제1항 제1호',
      override: true,
      condLabel: '긴급 조달 필요 (재해·안보 등)'
    };
  }

  if (amount <= 20000000) {
    return {
      name: '소액수의계약',
      ref: '시행령 제26조 제1항 제5호'
    };
  }

  if (isMas) {
    const isOver = rule.contractMethod.includes('2단계경쟁');
    return {
      name: isOver ? 'MAS 2단계경쟁' : 'MAS 직접구매 (2단계경쟁 면제)',
      ref: '물품 다수공급자계약 2단계경쟁 업무처리기준 제2조'
    };
  }

  if (category === 'service') {
    const isTech = serviceType === 'service_tech';
    const isResearch = serviceType === 'service_research' || serviceType === 'service_academic';
    const hasTechProposal = conditions.includes('tech_proposal');
    const hasComplexLarge = conditions.includes('complex_large');

    if (isTech || hasTechProposal) {
      if (amount > WTO_THRESHOLD) {
        return {
          name: '협상에 의한 계약(RFP) — 일반경쟁',
          ref: '시행령 제43조, 제7조',
          wto: true
        };
      }
      if (amount > 50000000) {
        return {
          name: '협상에 의한 계약(RFP) 또는 제한경쟁입찰',
          ref: '시행령 제43조',
          smeNote: amount <= WTO_THRESHOLD
        };
      }
    }

    if (hasComplexLarge && amount > 50000000) {
      return {
        name: '대안입찰 또는 일괄입찰',
        ref: '시행령 제43조의2',
        smeNote: amount <= WTO_THRESHOLD
      };
    }

    if (isResearch && amount > 20000000) {
      return {
        name: '협상에 의한 계약(제안요청) 또는 학술연구 특례 수의계약',
        ref: '시행령 제43조, 제26조 제1항 제3호',
        smeNote: amount > 50000000 && amount <= WTO_THRESHOLD
      };
    }
  }

  if (amount > WTO_THRESHOLD) {
    return {
      name: '적격심사 (일반경쟁입찰)',
      ref: '시행령 제42조, 적격심사기준 고시',
      wto: true
    };
  }

  if (amount > 50000000) {
    return {
      name: '적격심사 (제한경쟁 가능)',
      ref: '시행령 제42조, 적격심사기준 고시',
      smeNote: true
    };
  }

  return {
    name: '적격심사 또는 최저가낙찰',
    ref: '시행령 제42조'
  };
}

/* ── Renderer: Related Laws ── */
function renderRelatedLaws(serviceTypeId) {
  const sec = document.getElementById('relatedLawsCard');
  if (!sec) return;
  if (!serviceTypeId || !appData.serviceTypeMeta || !appData.serviceTypeMeta[serviceTypeId]) {
    sec.style.display = 'none';
    return;
  }
  const laws = appData.serviceTypeMeta[serviceTypeId].relatedLaws;
  if (!laws || laws.length === 0) { sec.style.display = 'none'; return; }

  const listEl = document.getElementById('relatedLawsList');
  listEl.innerHTML = laws.map((l, idx) => `
    <li class="related-law-item" data-law-idx="${idx}" data-service-type="${escHtml(serviceTypeId)}" role="button" tabindex="0">
      <div class="related-law-header">
        <span class="related-law-name">${escHtml(l.law)}</span>
        <span class="related-law-article">${escHtml(l.article)}</span>
      </div>
      <div class="related-law-condition">📍 ${escHtml(l.condition)}</div>
      <div class="related-law-summary">${escHtml(l.summary)}</div>
      ${l.details ? `<span class="detail-hint">📄 상세 내용 보기 ›</span>` : ''}
    </li>`).join('');

  listEl.querySelectorAll('.related-law-item[data-law-idx]').forEach(item => {
    const open = () => {
      const idx = parseInt(item.dataset.lawIdx, 10);
      const stype = item.dataset.serviceType;
      openLawModal(appData.serviceTypeMeta[stype].relatedLaws[idx]);
    };
    item.addEventListener('click', open);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  sec.style.display = 'block';
}

/* ── Law Detail Modal ── */
function openLawModal(law) {
  if (!law || !law.details) return;
  const d = law.details;
  document.getElementById('modalLawName').textContent = law.law;
  document.getElementById('modalLawArticle').textContent = law.article + (law.condition ? '  ·  ' + law.condition : '');
  const link = document.getElementById('modalLawLink');
  if (law.url) { link.href = law.url; link.style.display = 'inline'; }
  else { link.style.display = 'none'; }

  const cautionsHTML = (d.cautions || []).map(c => `<li>${escHtml(c)}</li>`).join('');
  const specialHTML  = (d.specialNotes || []).map(s => `<li>${escHtml(s)}</li>`).join('');
  document.getElementById('modalBody').innerHTML = `
    ${d.overview ? `<div class="modal-section"><div class="modal-section-title">개요</div><div class="modal-overview">${escHtml(d.overview)}</div></div>` : ''}
    ${cautionsHTML ? `<div class="modal-section"><div class="modal-section-title">⚠ 유의사항</div><ul class="modal-caution-list">${cautionsHTML}</ul></div>` : ''}
    <div class="modal-section">
      <div class="modal-section-title">계약 정보</div>
      <div class="modal-info-grid">
        ${d.awardMethod  ? `<div class="modal-info-box"><div class="modal-info-box-label">낙찰 방법</div><div class="modal-info-box-value">${escHtml(d.awardMethod)}</div></div>` : ''}
        ${d.contractMethod ? `<div class="modal-info-box"><div class="modal-info-box-label">계약 방법</div><div class="modal-info-box-value">${escHtml(d.contractMethod)}</div></div>` : ''}
        ${d.advancePayment ? `<div class="modal-info-box"><div class="modal-info-box-label">선금 지급</div><div class="modal-info-box-value">${escHtml(d.advancePayment)}</div></div>` : ''}
        ${d.insurance ? `<div class="modal-info-box"><div class="modal-info-box-label">손해배상보험증권</div><div class="modal-info-box-value">${escHtml(d.insurance)}</div></div>` : ''}
      </div>
    </div>
    ${specialHTML ? `<div class="modal-section"><div class="modal-section-title">✓ 특이사항</div><ul class="modal-special-list">${specialHTML}</ul></div>` : ''}`;

  document.getElementById('lawModalOverlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.getElementById('modalClose').focus();
}

function closeLawModal() {
  document.getElementById('lawModalOverlay').style.display = 'none';
  document.body.style.overflow = '';
}

/* ── 선택 미완료 안내 ── */
function renderGuide(icon, title, desc) {
  const card = document.getElementById('resultCard');
  const container = document.getElementById('result');
  card.style.display = 'block';
  container.innerHTML = `
    <div class="service-guide">
      <div class="service-guide-icon">${icon}</div>
      <div class="service-guide-text">
        <strong>${title}</strong>
        <span>${desc}</span>
      </div>
    </div>`;
}

/* ── 결과 렌더 ── */
function renderResult(rule, award, conditions) {
  const container = document.getElementById('result');
  if (!rule) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-text">금액을 입력하고 조회 버튼을 눌러주세요.</div>
      </div>`;
    return;
  }

  const legalHTML = rule.legalBasis.map(b => {
    let legalUrl = b.url || '';
    // 근거법령 링크도 조문 딥링크 지원
    if (legalUrl && b.article) {
      const artMatch = b.article.match(/제(\d+조(?:의\d+)?)/);
      if (artMatch && !legalUrl.includes('/제')) {
        legalUrl = legalUrl + '/제' + artMatch[1];
      }
    }
    return `
    <li class="legal-item">
      <div class="legal-article">${escHtml(b.article)}</div>
      <div class="legal-law">${escHtml(b.law)}</div>
      <div class="legal-summary">${escHtml(b.summary)}</div>
      ${legalUrl ? `<a class="legal-link" href="${escHtml(legalUrl)}" target="_blank" rel="noopener">↗ ${escHtml(b.article)} 원문 보기</a>` : ''}
    </li>`;
  }).join('');

  const procHTML = rule.procedures.map((p, i) => {
    let refEl = '';
    if (p.ref) {
      const href = p.refUrl || getProcRefUrl(p.ref);
      refEl = href
        ? `<a class="proc-ref proc-ref-link" href="${escHtml(href)}" target="_blank" rel="noopener" title="${escHtml(p.ref)} 원문 보기">${escHtml(p.ref)} ↗</a>`
        : `<span class="proc-ref">${escHtml(p.ref)}</span>`;
    }
    return `<li class="procedure-item">
      <span class="proc-num">${i + 1}</span>
      <span class="proc-body">${escHtml(p.text)}${refEl}</span>
    </li>`;
  }).join('');

  const criticalWarns = rule.warnings.filter(w => !isRefWarning(w));
  const refWarns      = rule.warnings.filter(w =>  isRefWarning(w));
  const criticalHTML  = criticalWarns.map(w => `<li class="warning-item">${linkifyLawRefs(escHtml(w))}</li>`).join('');
  const refHTML       = refWarns.map(w => `<li class="warning-item warn-ref">${linkifyLawRefs(escHtml(w))}</li>`).join('');
  const warnHTML      = criticalHTML + (refHTML ? `<li class="warning-separator">ℹ 참고 정보</li>${refHTML}` : '');

  const excHTML = rule.exceptions.map(e => `<div class="exception-item">${escHtml(e)}</div>`).join('');
  const badgeClass = rule.methodBadge || '경쟁입찰';
  const rangeLabel = getRangeLabel(rule);

  const isMas = (rule.methodBadge === 'MAS');
  const g2bLink = isMas
    ? `<a href="https://shopping.g2b.go.kr" target="_blank" rel="noopener">→ 나라장터 종합쇼핑몰 바로가기</a>`
    : `<a href="https://www.g2b.go.kr" target="_blank" rel="noopener">→ 나라장터(G2B) 바로가기</a>`;

  let awardHTML = '';
  if (award) {
    let smeHTML = '';
    if (award.smeNote) {
      smeHTML = `<div class="sme-info-box"><strong>💡 중소기업자간 제한경쟁</strong> 가능 — 중소기업 제품 구매 촉진에 관한 법률에 따라 중소기업자간 제한경쟁을 적용할 수 있습니다.</div>`;
    }
    awardHTML = `
      <div class="award-method-section">
        <div class="award-method-label">낙찰자 결정방법</div>
        <div class="award-method-name">${escHtml(award.name)}</div>
        <div class="award-method-ref">근거: ${escHtml(award.ref)}</div>
        ${smeHTML}
      </div>`;
  }

  let condAppliedHTML = '';
  if (award && award.override && award.condLabel) {
    condAppliedHTML = `<div class="special-cond-applied"><strong>⚡ 특수조건 적용:</strong> ${escHtml(award.condLabel)} → 금액과 무관하게 수의계약이 적용됩니다.</div>`;
  }

  container.innerHTML = `
    ${condAppliedHTML}
    ${awardHTML}

    <div class="result-header">
      <div class="result-method">
        <div class="result-range-badge">${escHtml(rangeLabel)}</div>
        <div class="result-method-label">계약방법</div>
        <div class="result-method-name">${escHtml(rule.contractMethod)}</div>
      </div>
      <span class="method-badge ${escHtml(badgeClass)}">${escHtml(badgeClass)}</span>
    </div>

    <div class="result-section">
      <div class="section-title">📋 근거 법령</div>
      <ul class="legal-list">${legalHTML}</ul>
    </div>

    <div class="result-section">
      <div class="section-title">📌 필수 절차</div>
      <ul class="procedure-list">${procHTML}</ul>
    </div>

    <div class="result-section">
      <div class="section-title">⚠ 주의사항</div>
      <ul class="warning-list">${warnHTML}</ul>
    </div>

    <div class="result-section">
      <button class="exceptions-toggle" id="excToggle" aria-expanded="false">
        <span>예외사항 / 특례 (${rule.exceptions.length}건)</span>
        <span class="arrow">▼</span>
      </button>
      <div class="exceptions-body" id="excBody">${excHTML}</div>
    </div>

    <div class="action-btns">
      <button class="action-btn" id="printBtn">🖨 인쇄</button>
      <button class="action-btn" id="copyBtn">📋 클립보드 복사</button>
      <button class="action-btn" id="resetBtn">🔄 처음부터</button>
    </div>

    <div class="next-step-guide">
      💡 다음 단계: 위 절차에 따라 품의서를 작성하고, 나라장터에서 계약을 진행하세요.<br>
      ${g2bLink}
      &nbsp;|&nbsp;
      <a href="https://www.law.go.kr" target="_blank" rel="noopener">→ 국가법령정보센터</a>
    </div>`;

  document.getElementById('excToggle').addEventListener('click', function () {
    const body = document.getElementById('excBody');
    const open = body.classList.toggle('open');
    this.classList.toggle('open', open);
    this.setAttribute('aria-expanded', String(open));
  });
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  document.getElementById('copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(buildCopyText(rule, award))
      .then(() => showToast('클립보드에 복사되었습니다.'))
      .catch(() => showToast('복사 실패 — 브라우저 권한을 확인하세요.'));
  });
  document.getElementById('resetBtn').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    resetAll();
  });
}

function buildCopyText(rule, award) {
  const lines = [
    `[계약방법 조회 결과]`,
    `계약방법: ${rule.contractMethod}`,
    `구간: ${getRangeLabel(rule)}`,
  ];
  if (award) {
    lines.push(`낙찰자 결정방법: ${award.name}`);
    lines.push(`낙찰 근거: ${award.ref}`);
  }
  lines.push(
    ``,
    `■ 근거 법령`,
    ...rule.legalBasis.map(b => `  • ${b.law} ${b.article}\n    ${b.summary}`),
    ``,
    `■ 필수 절차`,
    ...rule.procedures.map((p, i) => `  ${i + 1}. ${p.text}${p.ref ? ` [${p.ref}]` : ''}`),
    ``,
    `■ 주의사항`,
    ...rule.warnings.map(w => `  ⚠ ${w}`),
    ``,
    `■ 예외사항`,
    ...rule.exceptions.map(e => `  ✓ ${e}`),
  );
  return lines.join('\n');
}

/* ── Toast ── */
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

/* ── Escape HTML ── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── App State ── */
let appData             = null;
let selectedCategory    = 'goods';
let selectedGoodsMethod = null;
let selectedMasProduct  = null;
let selectedServiceType = null;
let currentAmount       = 0;

function getThresholdKey() {
  if (selectedCategory === 'goods') {
    if (selectedGoodsMethod === 'goods_mas') return selectedMasProduct || null;
    return selectedGoodsMethod || null;
  }
  if (selectedCategory === 'service') return selectedServiceType || null;
  return null;
}

/* ── 전체 초기화 ── */
function resetAll() {
  selectedGoodsMethod = null;
  selectedMasProduct  = null;
  selectedServiceType = null;
  currentAmount       = 0;

  document.getElementById('amountInput').value = '';
  document.getElementById('amountKorean').textContent = '';
  document.getElementById('amountKorean').classList.remove('active');

  document.getElementById('masProductCard').style.display = 'none';
  document.getElementById('specialCondCard').style.display = 'none';
  document.getElementById('resultCard').style.display = 'none';
  document.getElementById('relatedLawsCard').style.display = 'none';
  document.getElementById('wtoBanner').style.display = 'none';

  document.querySelectorAll('.subtype-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('input[name="goodsCond"], input[name="serviceCond"]').forEach(cb => cb.checked = false);

  if (selectedCategory === 'goods') {
    document.getElementById('goodsMethodCard').style.display = 'block';
    document.getElementById('serviceSubCard').style.display = 'none';
  } else {
    document.getElementById('goodsMethodCard').style.display = 'none';
    document.getElementById('serviceSubCard').style.display = 'block';
  }

  updateProgress(1);
}

/* ── STEP 4 표시 ── */
function showStep4() {
  if (!currentAmount || currentAmount <= 0) {
    showToast('추정가격을 입력해주세요.');
    document.getElementById('amountInput').focus();
    return;
  }

  const key = getThresholdKey();
  if (selectedCategory === 'goods' && !selectedGoodsMethod) {
    showToast('STEP 2에서 구매방식을 먼저 선택해주세요.');
    scrollToCard('goodsMethodCard');
    return;
  }
  if (selectedCategory === 'goods' && selectedGoodsMethod === 'goods_mas' && !selectedMasProduct) {
    showToast('STEP 2-1에서 물품 유형을 먼저 선택해주세요.');
    scrollToCard('masProductCard');
    return;
  }
  if (selectedCategory === 'service' && !selectedServiceType) {
    showToast('STEP 2에서 용역 유형을 먼저 선택해주세요.');
    scrollToCard('serviceSubCard');
    return;
  }

  const condCard = document.getElementById('specialCondCard');
  const goodsConds = document.getElementById('goodsSpecialConds');
  const serviceConds = document.getElementById('serviceSpecialConds');

  if (selectedCategory === 'goods') {
    goodsConds.style.display = 'flex';
    serviceConds.style.display = 'none';
  } else {
    goodsConds.style.display = 'none';
    serviceConds.style.display = 'flex';
  }

  document.querySelectorAll('input[name="goodsCond"], input[name="serviceCond"]').forEach(cb => cb.checked = false);
  condCard.style.display = 'block';
  updateProgress(4);
  scrollToCard('specialCondCard');
}

/* ── 조회 실행 ── */
function submitQuery() {
  if (!appData) return;

  const conditions = getSpecialConditions();
  if (conditions.length === 0) {
    showToast('특수조건을 확인해주세요. 해당 없으면 "해당 없음"을 선택하세요.');
    return;
  }

  const key = getThresholdKey();

  renderRelatedLaws(selectedCategory === 'service' ? selectedServiceType : null);

  const rule = findThreshold(appData, key, currentAmount);

  const award = determineAwardMethod(
    rule, currentAmount, conditions, selectedCategory, selectedServiceType
  );

  const showWto = award && award.wto;
  document.getElementById('wtoBanner').style.display = showWto ? 'flex' : 'none';
  if (showWto && currentAmount >= WTO_THRESHOLD) {
    document.getElementById('wtoBanner').style.display = 'flex';
  }

  document.getElementById('resultCard').style.display = 'block';
  renderResult(rule, award, conditions);
  updateProgress('R');
  scrollToCard(showWto ? 'wtoBanner' : 'resultCard');
}

/* ── 물품 구매방식 그리드 구성 ── */
function buildGoodsMethodGrid() {
  const grid = document.getElementById('goodsMethodGrid');
  if (!appData || !appData.goodsSubTypes) return;

  grid.innerHTML = appData.goodsSubTypes.map(t => `
    <button class="subtype-btn" data-method="${escHtml(t.id)}">
      <span class="subtype-label">${escHtml(t.label)}</span>
      <span class="subtype-desc">${escHtml(t.desc)}</span>
    </button>`).join('');

  grid.querySelectorAll('.subtype-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.subtype-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedGoodsMethod = btn.dataset.method;
      selectedMasProduct  = null;

      const masCard = document.getElementById('masProductCard');
      if (selectedGoodsMethod === 'goods_mas') {
        masCard.style.display = 'block';
        document.querySelectorAll('#masProductGrid .subtype-btn')
          .forEach(b => b.classList.remove('active'));
        updateProgress(2);
        scrollToCard('masProductCard');
      } else {
        masCard.style.display = 'none';
        updateProgress(3);
        scrollToCard('amountCard');
      }
    });
  });
}

/* ── MAS 물품유형 그리드 구성 ── */
function buildMasProductGrid() {
  const grid = document.getElementById('masProductGrid');
  if (!appData || !appData.masProductTypes) return;

  grid.innerHTML = appData.masProductTypes.map(t => `
    <button class="subtype-btn" data-product="${escHtml(t.id)}">
      <span class="subtype-label">${escHtml(t.label)}</span>
      <span class="subtype-desc">${escHtml(t.desc)}</span>
    </button>`).join('');

  grid.querySelectorAll('.subtype-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.subtype-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMasProduct = btn.dataset.product;
      updateProgress(3);
      scrollToCard('amountCard');
    });
  });
}

/* ── 용역 서브타입 그리드 구성 ── */
function buildServiceSubGrid() {
  const grid = document.getElementById('serviceSubGrid');
  if (!appData || !appData.serviceSubTypes) return;

  grid.innerHTML = appData.serviceSubTypes.map(t => `
    <button class="subtype-btn" data-subtype="${escHtml(t.id)}">
      <span class="subtype-label">${escHtml(t.label)}</span>
      <span class="subtype-desc">${escHtml(t.desc)}</span>
    </button>`).join('');

  grid.querySelectorAll('.subtype-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.subtype-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedServiceType = btn.dataset.subtype;
      updateProgress(3);
      scrollToCard('amountCard');
    });
  });
}

/* ── 특수조건 체크박스 "해당 없음" 상호 배타 로직 ── */
function setupConditionCheckboxes() {
  ['goodsCond', 'serviceCond'].forEach(name => {
    const checkboxes = document.querySelectorAll(`input[name="${name}"]`);
    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.value === 'none' && cb.checked) {
          checkboxes.forEach(other => {
            if (other !== cb) other.checked = false;
          });
        } else if (cb.value !== 'none' && cb.checked) {
          const noneBox = document.querySelector(`input[name="${name}"][value="none"]`);
          if (noneBox) noneBox.checked = false;
        }
      });
    });
  });
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {

  /* 모달 이벤트 */
  document.getElementById('modalClose').addEventListener('click', closeLawModal);
  document.getElementById('lawModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLawModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLawModal(); });

  /* 카테고리 선택 */
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCategory    = btn.dataset.category;
      selectedGoodsMethod = null;
      selectedServiceType = null;

      const goodsCard   = document.getElementById('goodsMethodCard');
      const masCard     = document.getElementById('masProductCard');
      const serviceCard = document.getElementById('serviceSubCard');
      const resultCard  = document.getElementById('resultCard');
      const condCard    = document.getElementById('specialCondCard');

      goodsCard.style.display   = 'none';
      masCard.style.display     = 'none';
      serviceCard.style.display = 'none';
      resultCard.style.display  = 'none';
      condCard.style.display    = 'none';
      document.getElementById('wtoBanner').style.display = 'none';
      document.getElementById('relatedLawsCard').style.display = 'none';
      selectedMasProduct = null;
      document.querySelectorAll('.subtype-btn').forEach(b => b.classList.remove('active'));

      if (selectedCategory === 'goods') {
        goodsCard.style.display = 'block';
        scrollToCard('goodsMethodCard');
      } else {
        serviceCard.style.display = 'block';
        scrollToCard('serviceSubCard');
      }
      updateProgress(2);
    });
  });

  /* 금액 입력 */
  const amountInput  = document.getElementById('amountInput');
  const amountKorean = document.getElementById('amountKorean');

  amountInput.addEventListener('input', () => {
    const raw = amountInput.value.replace(/[^0-9.]/g, '');
    const inputMillion = raw ? parseFloat(raw) : 0;
    currentAmount = inputMillion > 0 ? Math.round(inputMillion * 1_000_000) : 0;
    if (currentAmount > 0) {
      amountKorean.textContent = '= ' + formatComma(currentAmount) + '원 (' + toKorean(currentAmount) + ')';
      amountKorean.classList.add('active');
    } else {
      amountKorean.textContent = '';
      amountKorean.classList.remove('active');
    }
  });

  /* 빠른 선택 버튼 — 금액 설정만 */
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      amountInput.value = btn.dataset.amount;
      amountInput.dispatchEvent(new Event('input'));
    });
  });

  /* STEP 3 → STEP 4 버튼 */
  document.getElementById('toStep4Btn').addEventListener('click', showStep4);

  /* Enter 키로 STEP 4 이동 */
  amountInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') showStep4();
  });

  /* 조회하기 버튼 (STEP 4) */
  document.getElementById('submitBtn').addEventListener('click', submitQuery);

  /* 특수조건 체크박스 상호배타 */
  setupConditionCheckboxes();

  /* 데이터 로드 */
  try {
    appData = await loadData();
    const updated = document.getElementById('lastUpdated');
    if (updated && appData.meta) {
      updated.textContent = '최종 업데이트: ' + appData.meta.lastUpdated;
    }
    buildGoodsMethodGrid();
    buildMasProductGrid();
    buildServiceSubGrid();
    renderAmendmentBanner(appData.meta);

    document.getElementById('goodsMethodCard').style.display = 'block';
    updateProgress(1);

  } catch (err) {
    document.getElementById('result').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">${escHtml(err.message)}</div>
      </div>`;
    document.getElementById('resultCard').style.display = 'block';
  }
});
