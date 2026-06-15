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
  '계약예규 "협상에 의한 계약체결기준"': 'https://www.law.go.kr/admRulLsInfoP.do?admRulSeq=2100000272436',
  '국고금관리법 시행령': 'https://www.law.go.kr/법령/국고금관리법시행령',
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
  // 괄호 안의 법령 참조: (시행령 제26조), (계약예규 "..." 제8조) 등
  return escapedText.replace(
    /\(([^)]*?(시행규칙|시행령|본법|업무처리기준|업무처리규정|조달청 고시|계약예규|국고금관리법)[^)]*?)\)/g,
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

/* ── 공식 서식 / 감사 검토 체크리스트 ── */
const OFFICIAL_FORM_URLS = {
  bidApplication: 'https://www.law.go.kr/LSW/lsBylInfoP.do?bylSeq=17913185&lsiSeq=282607&efYd=20260102',
  bidForm: 'https://www.law.go.kr/LSW/lsBylInfoP.do?bylSeq=17913189&lsiSeq=282607&efYd=20260102',
  goodsContract: 'https://www.law.go.kr/LSW/lsBylInfoP.do?bylSeq=17913195&lsiSeq=282607&efYd=20260102',
  serviceContract: 'https://www.law.go.kr/LSW/lsBylInfoP.do?bylSeq=17913197&lsiSeq=282607&efYd=20260102',
  contractGuarantee: 'https://www.law.go.kr/LSW/lsBylInfoP.do?bylSeq=17913199&lsiSeq=282607&efYd=20260102',
  guaranteeSubstitute: 'https://www.law.go.kr/LSW/lsBylInfoP.do?bylSeq=17913201&lsiSeq=282607&efYd=20260102',
  defectGuarantee: 'https://www.law.go.kr/LSW/lsBylInfoP.do?bylSeq=17913203&lsiSeq=282607&efYd=20260102',
  pledge: 'https://www.law.go.kr/LSW/lsBylInfoP.do?bylSeq=17913207&lsiSeq=282607&efYd=20260102',
  sanctionsConfirm: 'https://www.law.go.kr/LSW/lsBylInfoP.do?bylSeq=17913209&lsiSeq=282607&efYd=20260102',
  sanctionsCriteria: 'https://www.law.go.kr/LSW/lsBylInfoP.do?bylSeq=17913175&lsiSeq=282607&efYd=20260102',
  validCompetitionCriteria: 'https://www.law.go.kr/LSW/lsBylInfoP.do?bylSeq=17913179&lsiSeq=282607&efYd=20260102',
  ruleFormsList: 'https://www.law.go.kr/LSW/lsBylListR.do?lsiSeq=282607&lsId=006590'
};

function buildOfficialDocLinksHTML(rule, award) {
  const isService = selectedCategory === 'service';
  const isGoods = selectedCategory === 'goods';
  const isBid = !(rule.methodBadge === '수의계약') || (award && /적격심사|협상|RFP|일반경쟁|제한경쟁/.test(award.name || ''));
  const isMas = rule.methodBadge === 'MAS';
  const contractForm = isService ? {
    title: '용역표준계약서',
    form: '시행규칙 별지 제9호서식',
    url: OFFICIAL_FORM_URLS.serviceContract
  } : {
    title: '물품구매표준계약서',
    form: '시행규칙 별지 제8호서식',
    url: OFFICIAL_FORM_URLS.goodsContract
  };

  const docs = [
    {
      phase: '계약 체결',
      title: contractForm.title,
      desc: isMas ? 'MAS 발주라도 별도 계약서 작성 또는 계약조건 확인이 필요한 경우 표준계약서 체계를 대조합니다.' : '계약서 작성 시 계약명, 금액, 납품·수행기간, 검사, 지체상금, 대금지급 조건을 빠뜨리지 않습니다.',
      form: contractForm.form,
      url: contractForm.url,
      show: true
    },
    {
      phase: '계약 체결',
      title: '계약보증금납부서',
      desc: '계약보증금 징수 대상이면 계약체결 전 납부 여부와 보증서 유효기간을 확인합니다.',
      form: '시행규칙 별지 제10호서식',
      url: OFFICIAL_FORM_URLS.contractGuarantee,
      show: currentAmount > 50000000 || isBid || isMas
    },
    {
      phase: '입찰 보증',
      title: '입찰보증금의 계약보증금 대체납부신청서',
      desc: '입찰보증금을 계약보증금으로 대체하려는 경우 사용합니다.',
      form: '시행규칙 별지 제11호서식',
      url: OFFICIAL_FORM_URLS.guaranteeSubstitute,
      show: isBid
    },
    {
      phase: '입찰',
      title: '입찰참가신청서 / 입찰서',
      desc: '전자입찰은 나라장터 전자서식으로 처리되지만, 서면 또는 대조가 필요한 경우 공식 서식을 확인합니다.',
      form: '시행규칙 별지 제3호·제5호서식',
      url: OFFICIAL_FORM_URLS.bidApplication,
      extraUrl: OFFICIAL_FORM_URLS.bidForm,
      extraLabel: '입찰서 보기',
      show: isBid
    },
    {
      phase: '하자 담보',
      title: '하자보수보증금납부서',
      desc: '하자담보책임 또는 유지보수 조건이 있는 물품·용역이면 하자보수보증금 징수 여부를 검토합니다.',
      form: '시행규칙 별지 제12호서식',
      url: OFFICIAL_FORM_URLS.defectGuarantee,
      show: isGoods || selectedServiceType === 'service_tech'
    },
    {
      phase: '제재 확인',
      title: '부정당업자제재확인서 / 제한기준',
      desc: '계약 전 제재 여부, 대표자·공동수급체 관련 제한 여부를 확인합니다.',
      form: '시행규칙 별지 제15호서식 / 별표 2',
      url: OFFICIAL_FORM_URLS.sanctionsConfirm,
      extraUrl: OFFICIAL_FORM_URLS.sanctionsCriteria,
      extraLabel: '제한기준 보기',
      show: isBid || currentAmount > 20000000
    }
  ].filter(d => d.show);

  const docItems = docs.map(d => `
    <div class="official-doc-card">
      <div class="official-doc-phase">${escHtml(d.phase)}</div>
      <div class="official-doc-title">${escHtml(d.title)}</div>
      <div class="official-doc-desc">${escHtml(d.desc)}</div>
      <div class="official-doc-form">${escHtml(d.form)}</div>
      <div class="official-doc-actions">
        <a href="${escHtml(d.url)}" target="_blank" rel="noopener">서식 바로가기 ↗</a>
        ${d.extraUrl ? `<a href="${escHtml(d.extraUrl)}" target="_blank" rel="noopener">${escHtml(d.extraLabel)} ↗</a>` : ''}
      </div>
    </div>`).join('');

  return `
  <div class="result-section official-doc-section">
    <div class="section-title">🧾 계약 서류·공식 서식</div>
    <p class="official-doc-intro">법제처 국가법령정보센터의 국가계약법 시행규칙 별지서식 중 이 계약에서 확인할 가능성이 큰 서식입니다. 기관 내부 양식이나 나라장터 전자서식이 우선 적용될 수 있으니, 최종 작성 전 소속기관 지침도 함께 확인하세요.</p>
    <div class="official-doc-grid">${docItems}</div>
    <div class="official-doc-all">
      <a href="${OFFICIAL_FORM_URLS.ruleFormsList}" target="_blank" rel="noopener">국가계약법 시행규칙 별표·서식 목록 전체 보기 ↗</a>
    </div>
  </div>`;
}

function buildAuditChecklistHTML(rule, award, conditions) {
  const isSuui = rule.methodBadge === '수의계약' || (award && /수의/.test(award.name || ''));
  const isMas = rule.methodBadge === 'MAS';
  const isRfp = award && /협상|RFP/.test(award.name || '');
  const isQual = award && /적격심사/.test(award.name || '');
  const isWto = currentAmount >= WTO_THRESHOLD;

  const items = [
    {
      title: '추정가격·예산 확인',
      desc: 'VAT 제외 추정가격인지, 같은 목적의 구매를 금액 기준 회피 목적으로 분할하지 않았는지 확인합니다.',
      ref: '시행령 제7조·제9조, 분할발주 금지 원칙',
      level: 'must'
    },
    {
      title: '계약방법 선택 사유',
      desc: isSuui
        ? '수의계약은 금액 기준 또는 특수사유가 문서로 남아야 합니다. 특정 업체 선정을 유도하는 사양은 특히 주의합니다.'
        : '일반·제한경쟁, 적격심사, 협상계약 중 왜 이 방법을 선택했는지 품의서와 공고문에 일관되게 남깁니다.',
      ref: isSuui ? '시행령 제26조' : '시행령 제21조·제42조·제43조',
      level: 'must'
    },
    {
      title: '입찰참가자격·제한요건',
      desc: '실적·면허·지역·중소기업 제한은 과도하면 경쟁제한 지적을 받을 수 있습니다. 필요성, 관련 법령, 과업 연관성을 함께 적습니다.',
      ref: '시행령 제21조, 중소기업제품 구매촉진 관련 기준',
      level: 'must'
    },
    {
      title: isRfp ? '평가기준 사전공개·위원 이해충돌' : '낙찰자 결정기준 사전공개',
      desc: isRfp
        ? '정성·정량 배점, 차등점수제 여부, 협상적격자 기준, 평가위원 제척·회피 사항을 공고/RFP에 미리 명시합니다.'
        : '적격심사 세부기준, 낙찰하한율, 제출서류, 제출기한을 공고 단계에서 참가자가 알 수 있어야 합니다.',
      ref: isRfp ? '시행령 제43조, 계약예규 협상에 의한 계약체결기준' : '계약예규 적격심사기준 제2조·제3조',
      level: 'must',
      show: isRfp || isQual
    },
    {
      title: '예정가격·기초금액 산정 근거',
      desc: '견적, 거래실례가격, 원가계산 등 산정 근거를 남기고, 특정 견적 하나에만 기대지 않도록 검토합니다.',
      ref: '시행령 제9조',
      level: 'must'
    },
    {
      title: '계약보증금·하자보증',
      desc: '계약보증금 징수 또는 면제 사유, 하자보수보증금 필요 여부, 보증기간과 보증금액을 계약서와 일치시킵니다.',
      ref: '시행령 제50조, 시행규칙 별지 제10호·제12호서식',
      level: 'must'
    },
    {
      title: '검사·검수와 대금지급',
      desc: '납품·용역완료 후 검사/검수 결과, 세금계산서, 대금청구서, 지체상금 여부를 확인한 뒤 지급합니다.',
      ref: '시행령 제55조·제58조·제74조',
      level: 'must'
    },
    {
      title: 'MAS 구매 적정성',
      desc: '쇼핑몰 등록 물품 여부, 2단계경쟁 기준금액, 동일·유사 규격 비교, 분할구매 회피 여부를 확인합니다.',
      ref: '물품 다수공급자계약 업무처리규정 제49조',
      level: 'must',
      show: isMas
    },
    {
      title: 'WTO·국제입찰 검토',
      desc: '고시금액 이상이면 중소기업 제한, 공고기간, 영문공고 등 국제입찰 적용 여부를 별도로 검토합니다.',
      ref: '국가계약법 제4조',
      level: 'warn',
      show: isWto
    },
    {
      title: '기록 보존',
      desc: '품의, 공고문, 예정가격 산정자료, 견적/입찰서, 평가표, 계약서, 보증서, 검사조서, 지급자료를 한 묶음으로 보관합니다.',
      ref: '감사 대응 핵심 증빙',
      level: 'info'
    }
  ].filter(item => item.show !== false);

  const applied = conditions && conditions.length
    ? `<div class="audit-applied">선택된 특수조건: ${conditions.map(c => escHtml(c.label)).join(', ')}</div>`
    : '';

  return `
  <div class="result-section audit-check-section">
    <div class="section-title">🔎 조달 검토 체크리스트</div>
    <p class="audit-check-intro">계약담당자가 실무에서 감사 지적을 받기 쉬운 지점을 먼저 확인하도록 만든 체크리스트입니다. 아래 항목은 결과 계약방법과 입력 조건에 맞춰 표시됩니다.</p>
    ${applied}
    <div class="audit-check-grid">
      ${items.map(item => `
        <div class="audit-check-card ${escHtml(item.level)}">
          <div class="audit-check-top">
            <span class="audit-check-badge">${item.level === 'warn' ? '주의' : item.level === 'info' ? '보관' : '필수'}</span>
            <strong>${escHtml(item.title)}</strong>
          </div>
          <div class="audit-check-desc">${escHtml(item.desc)}</div>
          <div class="audit-check-ref">${escHtml(item.ref)}</div>
        </div>`).join('')}
    </div>
  </div>`;
}

function getProcedureFormLinks(procText, rule) {
  const links = [];
  const isService = selectedCategory === 'service';
  const text = procText || '';

  if (/입찰공고|전자입찰|입찰서/.test(text)) {
    links.push({ label: '입찰참가신청서', url: OFFICIAL_FORM_URLS.bidApplication });
    links.push({ label: '입찰서', url: OFFICIAL_FORM_URLS.bidForm });
  }
  if (/계약 체결|계약서|수의계약서/.test(text)) {
    links.push({
      label: isService ? '용역표준계약서' : '물품구매표준계약서',
      url: isService ? OFFICIAL_FORM_URLS.serviceContract : OFFICIAL_FORM_URLS.goodsContract
    });
  }
  if (/계약보증금/.test(text)) {
    links.push({ label: '계약보증금납부서', url: OFFICIAL_FORM_URLS.contractGuarantee });
  }
  if (/하자/.test(text)) {
    links.push({ label: '하자보수보증금납부서', url: OFFICIAL_FORM_URLS.defectGuarantee });
  }
  if (/부정당업자|제재/.test(text)) {
    links.push({ label: '부정당업자제재확인서', url: OFFICIAL_FORM_URLS.sanctionsConfirm });
  }

  if (!links.length) return '';
  const unique = links.filter((link, idx, arr) => arr.findIndex(x => x.label === link.label) === idx);
  return `<span class="proc-form-links">${unique.map(link =>
    `<a href="${escHtml(link.url)}" target="_blank" rel="noopener">${escHtml(link.label)} ↗</a>`
  ).join('')}</span>`;
}

/* ── 적격심사 상세 안내 (적격심사 결과 시 표시) ── */
function buildQualGuideHTML() {
  const REF_URL = 'https://www.law.go.kr/admRulLsInfoP.do?admRulSeq=2100000274732';
  return `
  <div class="rfp-guide qual-guide">
    <div class="rfp-guide-header qual-header">
      <div class="rfp-guide-title">📗 적격심사 상세 안내</div>
      <div class="rfp-guide-subtitle">계약예규 "적격심사기준" · 시행령 제42조 기반 · 초보자용 단계별 가이드</div>
    </div>

    <!-- ① 적격심사란? -->
    <div class="rfp-section">
      <div class="rfp-section-title">① 적격심사란?</div>
      <div class="qual-overview-box">
        <div class="qual-overview-main">
          예정가격 이하 <strong>최저가 입찰자</strong> 순으로<br>
          계약이행능력을 심사하여<br>
          종합평점 <strong class="qual-95">95점 이상</strong>이면 낙찰
        </div>
        <div class="qual-overview-note">최저가 입찰자가 부적격이면 → 차순위 최저가자를 심사합니다</div>
      </div>
      <p class="rfp-desc">적격심사는 <strong>"가격만으로 결정하지 않겠다"</strong>는 취지입니다. 단순 최저가 낙찰이 아니라, 이행실적·경영상태·기술능력 등을 종합 평가하여 계약을 제대로 이행할 수 있는지 확인한 후 낙찰자를 결정합니다.</p>
      <div class="rfp-ref">근거: 시행령 제42조 제1항·제5항, 계약예규 "적격심사기준" 제1조·제8조</div>
    </div>

    <!-- ② 심사항목 및 배점 -->
    <div class="rfp-section">
      <div class="rfp-section-title">② 심사항목 및 배점 — 금액 규모별로 다릅니다</div>
      <p class="rfp-desc">추정가격이 클수록 <strong>수행능력 비중이 높아지고</strong>, 작을수록 <strong>입찰가격 비중이 높아집니다.</strong> 물품·용역은 공사 기준을 준용하여 각 중앙관서의 장이 정합니다.</p>

      <div class="qual-scale-table">
        <div class="qual-scale-header">
          <span>추정가격 규모</span>
          <span>수행능력</span>
          <span>입찰가격</span>
          <span>비율 (능력:가격)</span>
        </div>
        <div class="qual-scale-row">
          <span>50억~100억</span>
          <span class="qual-pts">50점</span>
          <span class="qual-pts">50점</span>
          <span class="qual-ratio"><div class="qual-bar"><div class="qual-bar-fill" style="width:50%"></div></div>50:50</span>
        </div>
        <div class="qual-scale-row">
          <span>10억~50억</span>
          <span class="qual-pts">30점</span>
          <span class="qual-pts">70점</span>
          <span class="qual-ratio"><div class="qual-bar"><div class="qual-bar-fill" style="width:30%"></div></div>30:70</span>
        </div>
        <div class="qual-scale-row">
          <span>3억~10억</span>
          <span class="qual-pts">20점</span>
          <span class="qual-pts">80점</span>
          <span class="qual-ratio"><div class="qual-bar"><div class="qual-bar-fill" style="width:20%"></div></div>20:80</span>
        </div>
        <div class="qual-scale-row">
          <span>2억~3억</span>
          <span class="qual-pts">10점</span>
          <span class="qual-pts">90점</span>
          <span class="qual-ratio"><div class="qual-bar"><div class="qual-bar-fill" style="width:10%"></div></div>10:90</span>
        </div>
        <div class="qual-scale-row">
          <span>2억 미만</span>
          <span class="qual-pts">10점</span>
          <span class="qual-pts">90점</span>
          <span class="qual-ratio"><div class="qual-bar"><div class="qual-bar-fill" style="width:10%"></div></div>10:90</span>
        </div>
      </div>
      <div class="rfp-ref">근거: 계약예규 "적격심사기준" 제5조 별표 (공사 기준, 물품·용역은 이를 준용)</div>
    </div>

    <!-- ③ 수행능력 심사 세부항목 -->
    <div class="rfp-section">
      <div class="rfp-section-title">③ 수행능력 심사 — 무엇을 평가하나?</div>
      <div class="qual-items-grid">
        <div class="qual-item-card">
          <div class="qual-item-icon">📊</div>
          <div class="qual-item-name">납품(시공) 실적</div>
          <div class="qual-item-desc">해당 물품·용역과 유사한 <strong>최근 5년간 실적</strong> 누계액을 추정금액 대비 비율로 평가</div>
          <div class="qual-item-tip">물품: 납품실적 / 용역: 수행실적</div>
        </div>
        <div class="qual-item-card">
          <div class="qual-item-icon">💰</div>
          <div class="qual-item-name">경영상태</div>
          <div class="qual-item-desc">부채비율·유동비율 또는 <strong>신용평가등급</strong> 중 택 1로 평가</div>
          <div class="qual-item-tip">신용등급이 유리하면 신용등급 제출 가능</div>
        </div>
        <div class="qual-item-card">
          <div class="qual-item-icon">⭐</div>
          <div class="qual-item-name">신인도</div>
          <div class="qual-item-desc">사회적기업 가점, 산재예방 가점, 일자리창출 가점 등 <strong>가감점</strong> 항목</div>
          <div class="qual-item-tip">벌금·제재 이력은 감점 대상</div>
        </div>
        <div class="qual-item-card">
          <div class="qual-item-icon">🔧</div>
          <div class="qual-item-name">기술능력 (결격 여부)</div>
          <div class="qual-item-desc">관계법령상 <strong>등록기준 기술자 보유</strong> 미달 시 최대 10점 감점</div>
          <div class="qual-item-tip">감점항목이므로 반드시 사전 확인</div>
        </div>
      </div>
      <div class="rfp-ref">근거: 계약예규 "적격심사기준" 제5조 별표 / 물품·용역은 각 중앙관서 세부기준에 따름</div>
    </div>

    <!-- ④ 낙찰하한율 -->
    <div class="rfp-section">
      <div class="rfp-section-title">④ 낙찰하한율 — 너무 낮은 가격은 안 됩니다</div>
      <p class="rfp-desc">입찰가격이 예정가격 대비 일정 비율 미만이면 <strong>심사 대상에서 제외</strong>되거나 입찰가격 평점이 낮아집니다.</p>
      <div class="qual-threshold-cards">
        <div class="qual-threshold-card">
          <div class="qual-threshold-label">물품</div>
          <div class="qual-threshold-value">86.245%</div>
          <div class="qual-threshold-note">조달청 고시 (2026.5.26~ 기준)<br>매년 변경되므로 반드시 확인</div>
        </div>
        <div class="qual-threshold-card">
          <div class="qual-threshold-label">공사 (100억 미만)</div>
          <div class="qual-threshold-value">예정가격의 98%</div>
          <div class="qual-threshold-note">(재료비+노무비+경비+부가세) 기준<br>미만 입찰 시 심사 대상 제외</div>
        </div>
      </div>
      <div class="rfp-ref">근거: 시행령 제42조, 계약예규 "적격심사기준" 제7조 제1항 / 조달청 낙찰하한율 고시</div>
    </div>

    <!-- ⑤ 전체 절차 타임라인 -->
    <div class="rfp-section">
      <div class="rfp-section-title">⑤ 적격심사 전체 절차</div>
      <div class="rfp-timeline">
        <div class="tl-item">
          <div class="tl-marker">1</div>
          <div class="tl-content">
            <div class="tl-title">입찰공고</div>
            <div class="tl-detail">나라장터에 입찰공고 (10일 이상)</div>
            <div class="tl-detail">낙찰자 결정방법(적격심사), 심사기준 열람 방법 명시</div>
            <div class="tl-detail">심사에 필요한 서류·제출기한 명시</div>
          </div>
        </div>
        <div class="tl-item">
          <div class="tl-marker">2</div>
          <div class="tl-content">
            <div class="tl-title">세부심사기준 열람</div>
            <div class="tl-detail">입찰참가자가 열람 가능하도록 비치 (공고일~입찰등록마감일)</div>
            <div class="tl-detail">전자조달시스템 게재로 교부 갈음 가능</div>
          </div>
        </div>
        <div class="tl-item">
          <div class="tl-marker">3</div>
          <div class="tl-content">
            <div class="tl-title">입찰 및 개찰</div>
            <div class="tl-detail">나라장터 전자입찰 원칙</div>
            <div class="tl-detail">예정가격 이하 최저가 입찰자 확인</div>
          </div>
        </div>
        <div class="tl-item tl-highlight">
          <div class="tl-marker">4</div>
          <div class="tl-content">
            <div class="tl-title">심사서류 요구</div>
            <div class="tl-detail"><strong>최저가 입찰자</strong>에게 심사 서류 제출 요구</div>
            <div class="tl-detail">제출기한: 통보받은 날부터 <strong>5일 이상</strong></div>
            <div class="tl-detail">서류 미비 시 보완 요구 가능 (3일 이상)</div>
          </div>
        </div>
        <div class="tl-item tl-highlight">
          <div class="tl-marker">5</div>
          <div class="tl-content">
            <div class="tl-title">적격심사 실시</div>
            <div class="tl-detail">서류 제출마감일부터 <strong>7일 이내</strong> 심사 (불가피 시 +3일)</div>
            <div class="tl-detail">수행능력 + 입찰가격을 합산하여 <strong>종합평점</strong> 산출</div>
          </div>
        </div>
        <div class="tl-item tl-highlight">
          <div class="tl-marker">6</div>
          <div class="tl-content">
            <div class="tl-title">낙찰자 결정</div>
            <div class="tl-detail">종합평점 <strong>95점 이상</strong> → 낙찰자 결정</div>
            <div class="tl-detail">95점 미만 → <strong>차순위 최저가자</strong>를 동일 절차로 심사</div>
          </div>
        </div>
        <div class="tl-item">
          <div class="tl-marker">7</div>
          <div class="tl-content">
            <div class="tl-title">결과 통보 및 재심사</div>
            <div class="tl-detail">낙찰/부적격 결과를 지체 없이 통보</div>
            <div class="tl-detail">부적격 통보 시 <strong>3일 이내 재심사 요청</strong> 가능</div>
            <div class="tl-detail">재심사 요청 접수 후 3일 이내 재심사 실시</div>
          </div>
        </div>
        <div class="tl-item">
          <div class="tl-marker">8</div>
          <div class="tl-content">
            <div class="tl-title">계약 체결</div>
            <div class="tl-detail">낙찰자 결정 후 계약보증금 납부 및 계약서 체결</div>
          </div>
        </div>
      </div>
      <div class="rfp-ref">근거: 계약예규 "적격심사기준" 제2조~제9조 · <a href="${REF_URL}" target="_blank" rel="noopener">계약예규 전문 보기 ↗</a></div>
    </div>

    <!-- ⑥ 주의사항 -->
    <div class="rfp-section">
      <div class="rfp-section-title">⑥ 초보자가 자주 놓치는 포인트</div>
      <div class="qual-tips-list">
        <div class="qual-tip-item">
          <div class="qual-tip-num">1</div>
          <div class="qual-tip-text"><strong>심사기준일 = 입찰공고일</strong>입니다. 공고일 기준 실적·경영상태·기술자 보유 현황이 심사됩니다.</div>
        </div>
        <div class="qual-tip-item">
          <div class="qual-tip-num">2</div>
          <div class="qual-tip-text"><strong>허위 서류 제출 시</strong> 낙찰 취소 + 계약 해제 + 부정당업자 제재(입찰참가자격 제한)까지 됩니다.</div>
        </div>
        <div class="qual-tip-item">
          <div class="qual-tip-num">3</div>
          <div class="qual-tip-text"><strong>물품·용역은 각 중앙관서별 세부기준</strong>이 다를 수 있습니다. 조달청 집행 물품은 조달청 세부기준을 확인하세요.</div>
        </div>
        <div class="qual-tip-item">
          <div class="qual-tip-num">4</div>
          <div class="qual-tip-text"><strong>경영상태 평가 방식 선택권</strong>이 있습니다. 부채비율·유동비율 또는 신용평가등급 중 유리한 것을 제출할 수 있습니다.</div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ── 제안서평가 상세 안내 (협상에 의한 계약 시 표시) ── */
function buildRfpGuideHTML() {
  const REF_URL = 'https://www.law.go.kr/admRulLsInfoP.do?admRulSeq=2100000272436';
  return `
  <div class="rfp-guide">
    <div class="rfp-guide-header">
      <div class="rfp-guide-title">📘 제안서평가 상세 안내</div>
      <div class="rfp-guide-subtitle">계약예규 "협상에 의한 계약체결기준" 기준 · 초보자용 단계별 가이드</div>
    </div>

    <!-- ① 평가유형 선택 -->
    <div class="rfp-section">
      <div class="rfp-section-title">① 평가유형 선택 — 기술 vs 가격 비중을 먼저 결정</div>
      <p class="rfp-desc">사업의 전문성·기술성 정도에 따라 3가지 유형 중 선택합니다. <strong>입찰공고 시 반드시 명시</strong>해야 합니다.</p>
      <div class="eval-type-grid">
        <div class="eval-type-card type-tech">
          <div class="eval-type-name">기술강조형</div>
          <div class="eval-type-ratio">기술 90 : 가격 10</div>
          <div class="eval-type-bar"><div class="bar-fill" style="width:90%"></div></div>
          <div class="eval-type-desc">고도의 전문성·기술성을 요하는 사업</div>
          <div class="eval-type-example">예: 대규모 SI, 고난도 설계</div>
        </div>
        <div class="eval-type-card type-balance">
          <div class="eval-type-name">기술·가격 균형형</div>
          <div class="eval-type-ratio">기술 80~60 : 가격 20~40</div>
          <div class="eval-type-bar"><div class="bar-fill" style="width:70%"></div></div>
          <div class="eval-type-desc">일정 수준 이상의 전문성 필요</div>
          <div class="eval-type-example">예: 일반 IT용역, 컨설팅</div>
        </div>
        <div class="eval-type-card type-price">
          <div class="eval-type-name">가격중시형</div>
          <div class="eval-type-ratio">기술 50 : 가격 50</div>
          <div class="eval-type-bar"><div class="bar-fill" style="width:50%"></div></div>
          <div class="eval-type-desc">전문성이 상대적으로 덜 중요</div>
          <div class="eval-type-example">예: 단순 유지보수, 운영</div>
        </div>
      </div>
      <div class="rfp-ref">근거: 계약예규 제7조 제2항, 별표 주4) / 기본 배점: 기술 70 : 가격 30 (20점 범위 내 가·감 조정 가능)</div>
    </div>

    <!-- ② 평가항목 및 배점한도 -->
    <div class="rfp-section">
      <div class="rfp-section-title">② 평가항목 및 배점한도</div>
      <p class="rfp-desc">기술능력평가는 아래 항목으로 구성됩니다. <strong>배점 규칙을 반드시 지켜야</strong> 합니다.</p>
      <table class="rfp-score-table">
        <thead>
          <tr><th>구분</th><th>평가항목</th><th>배점한도</th></tr>
        </thead>
        <tbody>
          <tr class="rfp-score-group">
            <td rowspan="8" class="score-group-label">기술능력<br>평가</td>
            <td>기술·지식능력</td>
            <td rowspan="8" class="score-group-total">합계 70점<br><span class="score-note">(항목당 최대 30점)</span></td>
          </tr>
          <tr><td>인력·조직·관리기술</td></tr>
          <tr><td>사업수행계획</td></tr>
          <tr><td>지원기술·사후관리</td></tr>
          <tr><td>수행실적</td></tr>
          <tr><td>재무구조·경영상태</td></tr>
          <tr><td>상호협력</td></tr>
          <tr><td>외주근로자 근로조건·원가절감 적정성</td></tr>
          <tr class="rfp-score-price">
            <td>입찰가격 평가</td>
            <td>입찰가격</td>
            <td class="score-group-total">30점</td>
          </tr>
          <tr class="rfp-score-total">
            <td colspan="2"><strong>합계</strong></td>
            <td><strong>100점</strong></td>
          </tr>
        </tbody>
      </table>

      <div class="score-rules-box">
        <div class="score-rules-title">📐 배점 세부 규칙</div>
        <div class="score-rule-grid">
          <div class="score-rule-item">
            <div class="score-rule-label">평가항목별 배점한도</div>
            <div class="score-rule-value">각 항목 <strong>최대 30점</strong></div>
            <div class="score-rule-note">하도급 평가항목은 5점 이상 필수</div>
          </div>
          <div class="score-rule-item">
            <div class="score-rule-label">정량평가 총 배점한도</div>
            <div class="score-rule-value">합계 <strong>최대 20점</strong></div>
            <div class="score-rule-note">수행실적·경영상태·상생협력 등</div>
          </div>
          <div class="score-rule-item">
            <div class="score-rule-label">세부평가항목 등급</div>
            <div class="score-rule-value"><strong>최고 5등급</strong> 기준 평가</div>
            <div class="score-rule-note">우열 판별 불가 시 동점 부여 가능</div>
          </div>
          <div class="score-rule-item">
            <div class="score-rule-label">평점구간 제한</div>
            <div class="score-rule-value">최고-최저 차이 <strong>배점의 30% 이내</strong></div>
            <div class="score-rule-note">상생협력 등 일부 항목은 예외</div>
          </div>
          <div class="score-rule-item">
            <div class="score-rule-label">10점 초과 항목</div>
            <div class="score-rule-value">세부평가항목 <strong>2개 이상</strong> 구성</div>
            <div class="score-rule-note">수요기관이 세부항목 설정</div>
          </div>
          <div class="score-rule-item">
            <div class="score-rule-label">평가점수 산출</div>
            <div class="score-rule-value">위원 점수 중 <strong>최고·최저 제외</strong> 후 평균</div>
            <div class="score-rule-note">12명 이상 시 상·하위 각 2개 제외</div>
          </div>
        </div>
      </div>
      <div class="rfp-ref">근거: 계약예규 제7조 제1항·별표 / 조달청 세부기준 제9조 제4항·제5항·제8항, 제12조</div>
    </div>

    <!-- ③ 정성평가 vs 정량평가 -->
    <div class="rfp-section">
      <div class="rfp-section-title">③ 정성평가 vs 정량평가</div>
      <p class="rfp-desc">기술능력 평가항목은 두 가지로 구분되며, <strong>평가 주체가 다릅니다.</strong></p>
      <div class="eval-compare-grid">
        <div class="eval-compare-card">
          <div class="eval-compare-badge qualitative">정성평가</div>
          <div class="eval-compare-who">평가: <strong>제안서평가위원회</strong></div>
          <div class="eval-compare-items">
            <div>• 기술·지식능력</div>
            <div>• 사업수행계획</div>
            <div>• 지원기술·사후관리</div>
            <div>• 인력·조직·관리기술</div>
          </div>
          <div class="eval-compare-note">위원 개별 평가 후 평균 산출<br>위원 구성: 소속공무원 + 외부전문가</div>
        </div>
        <div class="eval-compare-card">
          <div class="eval-compare-badge quantitative">정량평가</div>
          <div class="eval-compare-who">평가: <strong>계약담당공무원</strong></div>
          <div class="eval-compare-items">
            <div>• 수행실적</div>
            <div>• 재무구조·경영상태</div>
            <div>• 상호협력 실적</div>
          </div>
          <div class="eval-compare-note">세부기준에 따른 정량 지표 산출<br>위원회 심의 불요</div>
        </div>
      </div>
      <div class="rfp-ref">근거: 계약예규 제7조 제5항 단서, 제16조 제2항</div>
    </div>

    <!-- ④ 차등점수제 -->
    <div class="rfp-section">
      <div class="rfp-section-title">④ 차등점수제 (선택 적용)</div>
      <p class="rfp-desc">기술능력평가의 <strong>변별력이 부족할 것으로 예상</strong>되는 경우 적용합니다. 입찰공고 시 적용 여부와 순위간 점수차를 <strong>반드시 명시</strong>해야 합니다.</p>
      <div class="diff-score-box">
        <div class="diff-score-key">
          <div class="diff-key-label">핵심 규칙</div>
          <div class="diff-key-value">순위간 점수차: <strong>3점 이내</strong>에서 지정</div>
        </div>
        <div class="diff-score-flow">
          <div class="diff-score-step">
            <div class="diff-step-num">1</div>
            <div class="diff-step-text">제안서평가위원회가 기술능력을 평가하여 <strong>원 기술능력평가점수</strong>로 순위 결정</div>
          </div>
          <div class="diff-score-arrow">→</div>
          <div class="diff-score-step">
            <div class="diff-step-num">2</div>
            <div class="diff-step-text">순위에 따라 <strong>3점 이내 간격</strong>의 차등점수 부여<br>
              <span class="diff-example">예: 기술배점 70점 기준<br>1위 70점, 2위 67점, 3위 64점, 4위 61점...</span></div>
          </div>
          <div class="diff-score-arrow">→</div>
          <div class="diff-score-step">
            <div class="diff-step-num">3</div>
            <div class="diff-step-text">차등점수 + 가격점수를 합산하여 <strong>최종 순위</strong> 결정</div>
          </div>
        </div>
        <div class="diff-score-caution">
          <div class="diff-caution-item">⚠ <strong>협상적격자(85%) 판단</strong>은 차등점수가 아닌 <strong>원 기술능력평가점수</strong> 기준으로 판단합니다.</div>
          <div class="diff-caution-item">⚠ 차등점수제와 <strong>원가절감 적정성 평가</strong>는 <strong>중복 적용 불가</strong>합니다.</div>
          <div class="diff-caution-item">⚠ 적용하지 않으려면 조달요청 시 <strong>미적용 사유를 명시</strong>해야 합니다.</div>
        </div>
        <div class="diff-score-tip">💡 <strong>언제 사용?</strong> 동종사업 낙찰률이 비슷하거나 참여업체 간 기술 수준 차이가 크지 않을 때, 가격 경쟁력을 더 반영하기 위해 적용합니다. 조달청 집행 사업의 경우 수요기관이 조달요청 시 점수차를 지정합니다.</div>
      </div>
      <div class="rfp-ref">근거: 계약예규 제7조 제6항·제7항 / 조달청 세부기준 제9조 제10항, 제12조 제3항·제5항</div>
    </div>

    <!-- ⑤ 전체 절차 타임라인 -->
    <div class="rfp-section">
      <div class="rfp-section-title">⑤ 제안서평가 → 협상 → 계약 전체 절차</div>
      <div class="rfp-timeline">
        <div class="tl-item">
          <div class="tl-marker">1</div>
          <div class="tl-content">
            <div class="tl-title">입찰공고</div>
            <div class="tl-detail">제안서 제출마감 40일 전 공고 (긴급·고시금액 미만 시 10일 전)</div>
            <div class="tl-detail">평가유형·배점·차등점수제 적용 여부 명시 필수</div>
          </div>
        </div>
        <div class="tl-item">
          <div class="tl-marker">2</div>
          <div class="tl-content">
            <div class="tl-title">제안요청서(RFP) 교부</div>
            <div class="tl-detail">과업내용·요구사항·평가요소·평가방법 포함</div>
            <div class="tl-detail">필요 시 제안요청 설명회 개최 가능</div>
          </div>
        </div>
        <div class="tl-item">
          <div class="tl-marker">3</div>
          <div class="tl-content">
            <div class="tl-title">제안서 + 가격입찰서 접수</div>
            <div class="tl-detail">제안서와 가격입찰서는 별도 작성·제출</div>
            <div class="tl-detail">가격입찰서는 봉함하여 개봉 시까지 보관</div>
          </div>
        </div>
        <div class="tl-item tl-highlight">
          <div class="tl-marker">4</div>
          <div class="tl-content">
            <div class="tl-title">기술능력 평가 (제안서평가위원회)</div>
            <div class="tl-detail">정성평가: 위원회 심의 (기술·수행계획 등)</div>
            <div class="tl-detail">정량평가: 계약담당공무원 (실적·재무 등)</div>
            <div class="tl-detail">평가 후 위원 명단·항목별 점수 공개 의무</div>
          </div>
        </div>
        <div class="tl-item">
          <div class="tl-marker">5</div>
          <div class="tl-content">
            <div class="tl-title">가격입찰서 개봉 및 가격평가</div>
            <div class="tl-detail">입찰참가자 참석 하에 봉함 개봉</div>
            <div class="tl-detail">기준금액 미만 입찰 시 원가절감 적정성 심사 가능</div>
          </div>
        </div>
        <div class="tl-item tl-highlight">
          <div class="tl-marker">6</div>
          <div class="tl-content">
            <div class="tl-title">협상적격자 선정</div>
            <div class="tl-detail"><strong>기술능력평가 점수 ≥ 배점한도의 85%</strong>인 자만 선정</div>
            <div class="tl-detail">기술점수 + 가격점수 합산 고득점순으로 협상순위 결정</div>
          </div>
        </div>
        <div class="tl-item">
          <div class="tl-marker">7</div>
          <div class="tl-content">
            <div class="tl-title">협상 진행</div>
            <div class="tl-detail">우선순위자부터 순차 협상 (사업내용·이행방법·가격 협의)</div>
            <div class="tl-detail">협상기간: 15일 이내 (5일 조정 + 10일 연장 가능)</div>
          </div>
        </div>
        <div class="tl-item">
          <div class="tl-marker">8</div>
          <div class="tl-content">
            <div class="tl-title">계약 체결</div>
            <div class="tl-detail">협상 성립 후 10일 이내 계약 체결 의무</div>
            <div class="tl-detail">모든 협상적격자와 결렬 시 → 재공고입찰</div>
          </div>
        </div>
      </div>
      <div class="rfp-ref">근거: 계약예규 제4조~제15조 · <a href="${REF_URL}" target="_blank" rel="noopener">계약예규 전문 보기 ↗</a></div>
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
    const formLinks = getProcedureFormLinks(p.text, rule);
    return `<li class="procedure-item">
      <span class="proc-num">${i + 1}</span>
      <span class="proc-body">${escHtml(p.text)}${refEl}${formLinks}</span>
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

    ${buildAuditChecklistHTML(rule, award, conditions)}

    ${buildOfficialDocLinksHTML(rule, award)}

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

    ${(award && award.name && (award.name.includes('협상') || award.name.includes('RFP'))) ? buildRfpGuideHTML() : ''}
    ${(award && award.name && award.name.includes('적격심사')) ? buildQualGuideHTML() : ''}

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
