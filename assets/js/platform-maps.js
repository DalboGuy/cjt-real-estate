(function () {
  const search = document.getElementById('mapSearch');
  const status = document.getElementById('mapStatusFilter');
  const priority = document.getElementById('mapPriorityFilter');
  const results = document.getElementById('mapResults');
  const reset = document.getElementById('clearMapFilters');
  const expand = document.getElementById('expandAllMaps');
  const collapse = document.getElementById('collapseAllMaps');
  const copy = document.getElementById('copyMapSummary');
  const copyStatus = document.getElementById('copyMapStatus');
  const backToTop = document.getElementById('mapBackToTop');
  const domainCards = [...document.querySelectorAll('details[data-domain]')];
  const deliveryLedger = document.getElementById('delivery-ledger');
  const filterable = [...domainCards, deliveryLedger].filter(Boolean);
  const indexLinks = [...document.querySelectorAll('.domain-index a')];
  const indexGroups = [...document.querySelectorAll('.domain-index-group')];
  const anchorLinks = [...document.querySelectorAll('.domain-index a, .system-node')];
  const priorityButtons = [...document.querySelectorAll('[data-priority-filter]')];

  if (!domainCards.length) return;

  const noResults = document.createElement('div');
  noResults.className = 'map-no-results';
  noResults.setAttribute('role', 'status');
  noResults.textContent = 'No mapped system matches those filters. Reset the filters or broaden the search.';
  document.querySelector('.domain-stack')?.after(noResults);

  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  function applyFilters() {
    const query = normalize(search?.value);
    const wantedState = String(status?.value || 'all');
    const wantedPriority = String(priority?.value || 'all');
    let visibleDomains = 0;
    let ledgerVisible = false;

    filterable.forEach(section => {
      const states = String(section.dataset.state || '').split(/\s+/).filter(Boolean);
      const priorities = String(section.dataset.priority || '').split(/\s+/).filter(Boolean);
      const stateMatch = wantedState === 'all' || states.includes(wantedState);
      const priorityMatch = wantedPriority === 'all' || priorities.includes(wantedPriority);
      const textMatch = !query || normalize(section.textContent).includes(query);
      const visible = stateMatch && priorityMatch && textMatch;
      section.hidden = !visible;
      if (visible && section.matches('details[data-domain]')) {
        visibleDomains += 1;
        if (query.length >= 2) section.open = true;
      }
      if (visible && section === deliveryLedger) ledgerVisible = true;
    });

    indexLinks.forEach(link => {
      const target = document.querySelector(link.getAttribute('href'));
      link.hidden = Boolean(target?.hidden);
    });
    indexGroups.forEach(group => {
      group.hidden = ![...group.querySelectorAll('a')].some(link => !link.hidden);
    });

    priorityButtons.forEach(button => {
      const active = wantedPriority !== 'all' && button.dataset.priorityFilter === wantedPriority;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const totalVisible = visibleDomains + (ledgerVisible ? 1 : 0);
    noResults.classList.toggle('visible', totalVisible === 0);
    if (results) {
      const domainText = `${visibleDomains} domain${visibleDomains === 1 ? '' : 's'}`;
      const priorityText = wantedPriority === 'all' ? 'all priorities' : wantedPriority.toUpperCase();
      const stateText = wantedState === 'all' ? 'all states' : wantedState;
      const shown = ledgerVisible ? `${domainText} + delivery ledger` : domainText;
      results.textContent = `${shown} · ${priorityText} · ${stateText}`;
    }
  }

  function clearFiltersForTarget(target) {
    if (!target?.hidden) return;
    if (search) search.value = '';
    if (status) status.value = 'all';
    if (priority) priority.value = 'all';
    applyFilters();
  }

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const schedule = callback => (window.requestAnimationFrame || (fn => fn()))(callback);

  function topAlign(selector, updateHistory = false) {
    if (!selector?.startsWith('#')) return null;
    const target = document.querySelector(selector);
    clearFiltersForTarget(target);
    if (target?.matches('details')) target.open = true;
    if (!target) return null;
    if (updateHistory && window.history?.pushState) window.history.pushState(null, '', selector);
    schedule(() => {
      target.scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      if (target.matches('details')) target.querySelector?.('summary')?.focus?.({ preventScroll: true });
    });
    return target;
  }

  anchorLinks.forEach(link => link.addEventListener('click', event => {
    const selector = link.getAttribute('href');
    if (!selector?.startsWith('#')) return;
    event.preventDefault();
    topAlign(selector, true);
  }));
  search?.addEventListener('input', applyFilters);
  status?.addEventListener('change', applyFilters);
  priority?.addEventListener('change', applyFilters);

  reset?.addEventListener('click', () => {
    if (search) search.value = '';
    if (status) status.value = 'all';
    if (priority) priority.value = 'all';
    applyFilters();
    search?.focus();
  });

  priorityButtons.forEach(button => button.addEventListener('click', () => {
    if (search) search.value = '';
    if (status) status.value = 'all';
    if (priority) priority.value = button.dataset.priorityFilter || 'all';
    applyFilters();
    topAlign(button.dataset.scrollTarget || '#domainAtlas');
  }));

  expand?.addEventListener('click', () => {
    domainCards.filter(card => !card.hidden).forEach(card => { card.open = true; });
    domainCards.find(card => !card.hidden)?.querySelector('summary')?.focus({ preventScroll: true });
  });

  collapse?.addEventListener('click', () => {
    domainCards.forEach(card => { card.open = false; });
    collapse.focus({ preventScroll: true });
  });

  function mapReviewSummary() {
    return [
      'CJT PLATFORM MAPS V2 — REVIEW SUMMARY',
      'Baseline: reorg/platform-v1 @ ccc4566 (audited Sep 8, 2026)',
      '',
      'Locked decisions:',
      '- A booking request blocks dates until an owner explicitly releases them.',
      '- Availability fails closed when a required calendar source is unhealthy.',
      '- Approval, contract, payment, confirmation, and date lock are separate facts.',
      '- Stripe remains parked.',
      '- Preview must remain isolated from the Production Neon database.',
      '',
      'Active sequence:',
      '1. Guest-to-owner Preview acceptance, including trip/pet/event plus 2-guest and 14-guest paths.',
      '2. Owner Calendar information-architecture and mobile reorganization.',
      '3. Full guest booking-page visual acceptance.',
      '',
      'Not yet built or complete:',
      '- Pricing file import and preview-before-save.',
      '- Base-rate fallback, active midweek/extended offers, and date-override precedence.',
      '- Operating cost, host-site fee, discount floor, and margin engine.',
      '- Outbound OTA rates/inventory and unified messaging.',
      '- Signed-document index and end-to-end cancellation/refund flow.',
      '- Multi-property permissions/invitations and centralized monitoring.',
      '- Explicit Production cutover acceptance.'
    ].join('\n');
  }

  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    if (!copied) throw new Error('copy_failed');
  }

  copy?.addEventListener('click', async () => {
    if (copyStatus) copyStatus.textContent = 'Copying…';
    try {
      await writeClipboard(mapReviewSummary());
      if (copyStatus) copyStatus.textContent = 'Review summary copied.';
    } catch {
      if (copyStatus) copyStatus.textContent = 'Could not copy automatically. Select the ledger text instead.';
    }
  });

  function openHashTarget(shouldScroll = false) {
    const hash = String(location.hash || '');
    if (!hash) return;
    const target = document.getElementById(hash.slice(1));
    clearFiltersForTarget(target);
    if (target?.matches('details')) target.open = true;
    if (shouldScroll && target) schedule(() => target.scrollIntoView?.({ behavior: 'auto', block: 'start' }));
  }

  backToTop?.addEventListener('click', () => {
    window.scrollTo?.({ top: 0, left: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  });

  function syncBackToTop() {
    if (backToTop) backToTop.hidden = Number(window.scrollY || 0) < 480;
  }

  if (window.history && 'scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  window.addEventListener('pageshow', () => {
    if (!location.hash) window.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
  });
  window.addEventListener('scroll', syncBackToTop, { passive: true });

  if ('IntersectionObserver' in window) {
    const byTarget = new Map(indexLinks.map(link => [link.getAttribute('href')?.slice(1), link]));
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting && !entry.target.hidden)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      indexLinks.forEach(link => link.classList.remove('active'));
      const active = byTarget.get(visible.target.id);
      active?.classList.add('active');
    }, { rootMargin: '-22% 0px -65% 0px', threshold: [0, .15, .5] });
    [...domainCards, deliveryLedger].filter(Boolean).forEach(section => observer.observe(section));
  }

  window.addEventListener('hashchange', () => openHashTarget(true));
  applyFilters();
  openHashTarget(true);
  syncBackToTop();
})();
