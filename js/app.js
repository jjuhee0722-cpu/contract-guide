/* ── 절차 법령 ref → URL 자동 매핑 ── */
const PROC_REF_URL_MAP = [
  { prefix: '시행규칙', url: 'https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률시행규칙' },
  { prefix: '시행령',   url: 'https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률시행령' },
  { prefix: '본법',     url: 'https://www.law.go.kr/법령/국가를당사자로하는계약에관한법률' },
];

function getProcRefUrl(ref) {
  if (!ref) return null;
  for (const { prefix, url } of PROC_REF_URL_MAP) {
    if (ref.startsWith(prefix)) return url;
  }
  return null;
}

/* ── 주의사항 경중 분류 ── */
// 참고 정보성(숫자/비율 안내) 항목은 파란 스타일로 구분
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
  if (min === 0 && max !== null) {
    return `추정가격 ${toKorean(max)} 이하 구간`;
  }
  if (max === null) {
    return `추정가격 ${toKorean(min)} 초과 구간`;
  }
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
  if (!el) return;
  setTimeout(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

/* ── Renderer ── */
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
    ${d.overview ? `
    <div class="modal-section">
      <div class="modal-section-title">개요</div>
      <div class="modal-overview">${escHtml(d.overview)}</div>
    </div>` : ''}

    ${cautionsHTML ? `
    <div class="modal-section">
      <div class="modal-section-title">⚠ 유의사항</div>
      <ul class="modal-caution-list">${cautionsHTML}</ul>
    </div>` : ''}

    <div class="modal-section">
      <div class="modal-section-title">계약 정보</div>
      <div class="modal-info-grid">
        ${d.awardMethod ? `<div class="modal-info-box">
          <div class="modal-info-box-label">낙찰 방법</div>
          <div class="modal-info-box-value">${escHtml(d.awardMethod)}</div>
        </div>` : ''}
        ${d.contractMethod ? `<div class="modal-info-box">
          <div class="modal-info-box-label">계약 방법</div>
          <div class="modal-info-box-value">${escHtml(d.contractMethod)}</div>
        </div>` : ''}
        ${d.advancePayment ? `<div class="modal-info-box">
          <div class="modal-info-box-label">선금 지급</div>
          <div class="modal-info-box-value">${escHtml(d.advancePayment)}</div>
        </div>` : ''}
        ${d.insurance ? `<div class="modal-info-box">
          <div class="modal-info-box-label">손해배상보험증권</div>
          <div class="modal-info-box-value">${escHtml(d.insurance)}</div>
        </div>` : ''}
      </div>
    </div>

    ${specialHTML ? `
    <div class="modal-section">
      <div class="modal-section-title">✓ 특이사항</div>
      <ul class="modal-special-list">${specialHTML}</ul>
    </div>` : ''}
  `;

  const overlay = document.getElementById('lawModalOverlay');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.getElementById('modalClose').focus();
}

function closeLawModal() {
  document.getElementById('lawModalOverlay').style.display = 'none';
  document.body.style.overflow = '';
}

/* ── 용역 유형 미선택 안내 ── */
function renderServiceGuide() {
  const card = document.getElementById('resultCard');
  const container = document.getElementById('result');
  card.style.display = 'block';
  container.innerHTML = `
    <div class="service-guide">
      <div class="service-guide-icon">☝️</div>
      <div class="service-guide-text">
        <strong>위에서 용역 유형을 먼저 선택해주세요.</strong><br>
        <span>유형(일반용역 / 기술·IT / 학술·연구)에 따라 적용 법령과 계약방법이 달라집니다.</span>
      </div>
    </div>`;
}

function renderResult(rule) {
  const container = document.getElementById('result');
  if (!rule) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-text">유형과 금액을 입력하면 계약방법이 표시됩니다.</div>
      </div>`;
    return;
  }

  const legalHTML = rule.legalBasis.map(b => `
    <li class="legal-item">
      <div class="legal-article">${escHtml(b.article)}</div>
      <div class="legal-law">${escHtml(b.law)}</div>
      <div class="legal-summary">${escHtml(b.summary)}</div>
      ${b.url ? `<a class="legal-link" href="${escHtml(b.url)}" target="_blank" rel="noopener">↗ 국가법령정보센터에서 보기</a>` : ''}
    </li>`).join('');

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

  /* 주의사항 — 필수/참고 분리 */
  const criticalWarns = rule.warnings.filter(w => !isRefWarning(w));
  const refWarns      = rule.warnings.filter(w =>  isRefWarning(w));

  const criticalHTML = criticalWarns.map(w =>
    `<li class="warning-item">${escHtml(w)}</li>`).join('');
  const refHTML = refWarns.map(w =>
    `<li class="warning-item warn-ref">${escHtml(w)}</li>`).join('');

  const warnHTML = `
    ${criticalHTML}
    ${refHTML ? `
      <li class="warning-separator">ℹ 참고 정보</li>
      ${refHTML}` : ''}`;

  const excHTML = rule.exceptions.map(e =>
    `<div class="exception-item">${escHtml(e)}</div>`).join('');

  const badgeClass = rule.methodBadge || '경쟁입찰';
  const rangeLabel = getRangeLabel(rule);

  container.innerHTML = `
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
    </div>

    <div class="next-step-guide">
      💡 다음 단계: 위 절차에 따라 품의서를 작성하고, 나라장터(G2B)에서 계약을 진행하세요.<br>
      <a href="https://www.g2b.go.kr" target="_blank" rel="noopener">→ 나라장터(G2B) 바로가기</a>
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
    navigator.clipboard.writeText(buildCopyText(rule))
      .then(() => showToast('클립보드에 복사되었습니다.'))
      .catch(() => showToast('복사 실패 — 브라우저 권한을 확인하세요.'));
  });
}

function buildCopyText(rule) {
  const lines = [
    `[계약방법 조회 결과]`,
    `계약방법: ${rule.contractMethod}`,
    `구간: ${getRangeLabel(rule)}`,
    ``,
    `■ 근거 법령`,
    ...rule.legalBasis.map(b => `  • ${b.law} ${b.article}\n    ${b.summary}`),
    ``,
    `■ 필수 절차`,
    ...rule.procedures.map((p, i) => {
      const ref = p.ref ? ` [${p.ref}]` : '';
      return `  ${i + 1}. ${p.text}${ref}`;
    }),
    ``,
    `■ 주의사항`,
    ...rule.warnings.map(w => `  ⚠ ${w}`),
    ``,
    `■ 예외사항`,
    ...rule.exceptions.map(e => `  ✓ ${e}`),
  ];
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── App State ── */
let appData = null;
let selectedCategory = 'goods';
let selectedServiceType = null;
let currentAmount = 0;

function getThresholdKey() {
  if (selectedCategory === 'goods') return 'goods';
  return selectedServiceType || null;
}

function update() {
  if (!appData) return;
  const key = getThresholdKey();

  if (selectedCategory === 'service' && !selectedServiceType) {
    renderRelatedLaws(null);
    renderServiceGuide();
    return;
  }

  renderRelatedLaws(selectedCategory === 'service' ? selectedServiceType : null);

  if (currentAmount > 0 && key) {
    const rule = findThreshold(appData, key, currentAmount);
    document.getElementById('resultCard').style.display = 'block';
    renderResult(rule);
  } else {
    document.getElementById('resultCard').style.display = 'none';
  }
}

/* ── Service Sub-type UI ── */
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
      update();
      // 금액 입력 카드로 스크롤
      scrollToCard('amountCard');
    });
  });
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {

  document.getElementById('modalClose').addEventListener('click', closeLawModal);
  document.getElementById('lawModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLawModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeLawModal();
  });

  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCategory = btn.dataset.category;

      const subCard  = document.getElementById('serviceSubCard');
      const stepLabel = document.getElementById('amountStepLabel');

      if (selectedCategory === 'service') {
        subCard.style.display = 'block';
        selectedServiceType = null;
        document.querySelectorAll('.subtype-btn').forEach(b => b.classList.remove('active'));
        stepLabel.textContent = 'STEP 3   추정가격 입력';
        // 용역 유형 선택 카드로 스크롤
        scrollToCard('serviceSubCard');
      } else {
        subCard.style.display = 'none';
        selectedServiceType = null;
        stepLabel.textContent = 'STEP 2   추정가격 입력';
        // 금액 입력 카드로 스크롤
        scrollToCard('amountCard');
      }
      update();
    });
  });

  const amountInput = document.getElementById('amountInput');
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
    update();
    // 결과 카드로 스크롤 (금액 입력 후)
    if (currentAmount > 0) scrollToCard('resultCard');
  });

  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      amountInput.value = btn.dataset.amount;
      amountInput.dispatchEvent(new Event('input'));
    });
  });

  try {
    appData = await loadData();
    const updated = document.getElementById('lastUpdated');
    if (updated && appData.meta) {
      updated.textContent = '최종 업데이트: ' + appData.meta.lastUpdated;
    }
    buildServiceSubGrid();
    renderAmendmentBanner(appData.meta);
  } catch (err) {
    document.getElementById('result').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">${escHtml(err.message)}</div>
      </div>`;
    document.getElementById('resultCard').style.display = 'block';
  }
});
