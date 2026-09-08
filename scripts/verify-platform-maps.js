const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'admin-v1', 'maps.html');
const scriptPath = path.join(root, 'assets', 'js', 'platform-maps.js');
const stylePath = path.join(root, 'assets', 'css', 'maps.css');
const docsPath = path.join(root, 'docs', 'PLATFORM-MAPS.md');

const page = fs.readFileSync(pagePath, 'utf8');
const script = fs.readFileSync(scriptPath, 'utf8');
const style = fs.readFileSync(stylePath, 'utf8');
const docs = fs.readFileSync(docsPath, 'utf8');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
check(duplicateIds.length === 0, `duplicate HTML ids: ${[...new Set(duplicateIds)].join(', ')}`);

const domainCards = [...page.matchAll(/<details\s+id="(domain-[^"]+)"\s+class="domain-card"\s+data-domain\s+data-state="([^"]+)"\s+data-priority="([^"]+)"/g)];
check(domainCards.length === 12, `expected 12 domain cards, found ${domainCards.length}`);

const domainIds = new Set(domainCards.map((match) => match[1]));
const expectedDomainIds = [
  'domain-booking',
  'domain-calendar',
  'domain-lifecycle',
  'domain-pricing',
  'domain-financials',
  'domain-communications',
  'domain-contracts',
  'domain-documents',
  'domain-identity',
  'domain-navigation',
  'domain-deployment',
  'domain-listing'
];
for (const id of expectedDomainIds) check(domainIds.has(id), `missing domain card: ${id}`);

const validStates = new Set(['built', 'partial', 'planned', 'parked']);
for (const [, id, stateList] of domainCards) {
  for (const state of stateList.split(/\s+/)) {
    check(validStates.has(state), `${id} has unknown state: ${state}`);
  }
}

const validPriorities = new Set(['p0', 'p1', 'p2']);
for (const [, id, , priorityList] of domainCards) {
  for (const priority of priorityList.split(/\s+/)) {
    check(validPriorities.has(priority), `${id} has unknown priority: ${priority}`);
  }
}

const hashTargets = [...page.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
for (const target of hashTargets) check(ids.includes(target), `broken in-page link: #${target}`);

for (const requiredPath of [
  '/assets/css/tokens.css',
  '/assets/css/owner-shell.css',
  '/assets/css/modules.css',
  '/assets/css/maps.css',
  '/assets/js/static-auth.js',
  '/assets/js/owner-shell.js',
  '/assets/js/platform-maps.js'
]) {
  const localPath = path.join(root, requiredPath.slice(1));
  check(fs.existsSync(localPath), `missing local asset: ${requiredPath}`);
  check(page.includes(requiredPath), `page does not load required asset: ${requiredPath}`);
}

const combinedCopy = `${page}\n${docs}`.toLowerCase();
for (const requiredText of [
  'a request blocks inventory until an owner explicitly releases it',
  'Availability fails closed',
  'Stripe is parked',
  'Protect first. Convert second. Operate third.',
  'Every in-map jump opens the selected domain and top-aligns its heading',
  'Pricing file import',
  'midweek_offer',
  'long_stay_offer',
  'pricing_overrides',
  'discount floor',
  'CJT_DATABASE_URL',
  'booking_events',
  'api/inquiries.js',
  'api/owner.js',
  'owner booking presentation for trip/pet/event fields are now in code'
]) {
  check(combinedCopy.includes(requiredText.toLowerCase()), `missing required map fact: ${requiredText}`);
}

const secretPatterns = [
  /postgres(?:ql)?:\/\//i,
  /\bsk_(?:live|test)_[A-Za-z0-9]+/,
  /\bwhsec_[A-Za-z0-9]+/,
  /DATABASE_URL\s*=\s*[^<\s`]+/
];
for (const pattern of secretPatterns) {
  check(!pattern.test(`${page}\n${script}\n${style}\n${docs}`), `possible secret or connection string matched ${pattern}`);
}

for (const staleClaim of [/24-hour inquiry hold/i, /temporary hold expires/i]) {
  check(!staleClaim.test(`${page}\n${docs}`), `stale workflow claim matched ${staleClaim}`);
}

check(script.includes("addEventListener('input', applyFilters)"), 'search input is not wired');
check(script.includes("addEventListener('change', applyFilters)"), 'state filter is not wired');
check(script.includes("document.getElementById('mapPriorityFilter')"), 'priority filter is not wired');
check(script.includes("document.getElementById('clearMapFilters')"), 'filter reset is not wired');
check(script.includes("document.getElementById('mapBackToTop')"), 'back-to-top control is not wired');
check(script.includes("scrollIntoView?.({ behavior:"), 'top-aligned section navigation is not wired');
check(script.includes('navigator.clipboard.writeText'), 'review-summary copy action is not wired');
check(/@media\s*\(max-width:\s*(?:760|780)px\)/.test(style), 'mobile breakpoint is missing');
check(style.includes(':focus-visible'), 'visible keyboard focus styling is missing');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const enabled = force == null ? !this.values.has(value) : Boolean(force);
    if (enabled) this.values.add(value);
    else this.values.delete(value);
    return enabled;
  }
}

class FakeElement {
  constructor({ id = '', tag = 'div', text = '', state = '', priority = '', href = '', domain = false } = {}) {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.textContent = text;
    this.dataset = {};
    if (state) this.dataset.state = state;
    if (priority) this.dataset.priority = priority;
    this.hidden = false;
    this.open = false;
    this.value = '';
    this.isDomain = domain;
    this.attributes = href ? { href } : {};
    this.listeners = {};
    this.classList = new FakeClassList();
    this.style = {};
    this.scrollCalls = [];
    this.summary = { focus() {} };
  }
  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }
  async fire(type) {
    for (const listener of this.listeners[type] || []) await listener({ type, target: this, preventDefault() { this.defaultPrevented = true; } });
  }
  matches(selector) {
    if (selector === 'details') return this.tagName === 'DETAILS';
    if (selector === 'details[data-domain]') return this.tagName === 'DETAILS' && this.isDomain;
    return false;
  }
  querySelector(selector) { return selector === 'summary' ? this.summary : null; }
  getAttribute(name) { return this.attributes[name] || null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  focus() {}
  scrollIntoView(options) { this.scrollCalls.push(options); }
  after(element) { this.afterElement = element; }
  appendChild() {}
  select() {}
  remove() {}
}

async function runInteractionChecks() {
  const search = new FakeElement({ id: 'mapSearch', tag: 'input' });
  const status = new FakeElement({ id: 'mapStatusFilter', tag: 'select' });
  const priority = new FakeElement({ id: 'mapPriorityFilter', tag: 'select' });
  status.value = 'all';
  priority.value = 'all';
  const results = new FakeElement({ id: 'mapResults' });
  const reset = new FakeElement({ id: 'clearMapFilters', tag: 'button' });
  const expand = new FakeElement({ id: 'expandAllMaps', tag: 'button' });
  const collapse = new FakeElement({ id: 'collapseAllMaps', tag: 'button' });
  const copy = new FakeElement({ id: 'copyMapSummary', tag: 'button' });
  const copyStatus = new FakeElement({ id: 'copyMapStatus' });
  const backToTop = new FakeElement({ id: 'mapBackToTop', tag: 'button' });
  backToTop.hidden = true;
  const domainAtlas = new FakeElement({ id: 'domainAtlas', tag: 'section' });
  const domains = domainCards.map(([, id, state, priorityValue]) => new FakeElement({
    id,
    tag: 'details',
    state,
    priority: priorityValue,
    domain: true,
    text: `${id} ${id === 'domain-pricing' ? 'pricing quote seasonal rate' : ''}`
  }));
  domains[0].open = true;
  const ledger = new FakeElement({
    id: 'delivery-ledger',
    state: 'partial planned parked',
    priority: 'p0 p1 p2',
    text: 'delivery ledger missing pricing import operating cost owner profile'
  });
  const indexLinks = [...domains, ledger].map((target) => new FakeElement({ tag: 'a', href: `#${target.id}` }));
  const systemLinks = [new FakeElement({ tag: 'a', href: '#domain-booking' })];
  const priorityButtons = ['p0', 'p1', 'p2'].map((value) => {
    const button = new FakeElement({ tag: 'button' });
    button.dataset.priorityFilter = value;
    button.dataset.scrollTarget = '#domainAtlas';
    return button;
  });
  const stack = new FakeElement();
  const body = new FakeElement({ tag: 'body' });
  const byId = new Map([
    [search.id, search],
    [status.id, status],
    [priority.id, priority],
    [results.id, results],
    [reset.id, reset],
    [expand.id, expand],
    [collapse.id, collapse],
    [copy.id, copy],
    [copyStatus.id, copyStatus],
    [backToTop.id, backToTop],
    [domainAtlas.id, domainAtlas],
    [ledger.id, ledger],
    ...domains.map((domain) => [domain.id, domain])
  ]);
  const windowListeners = {};
  let clipboard = '';

  const document = {
    body,
    getElementById(id) { return byId.get(id) || null; },
    createElement() { return new FakeElement(); },
    querySelector(selector) {
      if (selector === '.domain-stack') return stack;
      if (selector.startsWith('#')) return byId.get(selector.slice(1)) || null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'details[data-domain]') return domains;
      if (selector === '.domain-index a') return indexLinks;
      if (selector === '.domain-index a, .system-node') return [...indexLinks, ...systemLinks];
      if (selector === '[data-priority-filter]') return priorityButtons;
      return [];
    },
    execCommand() { return true; }
  };
  const location = { hash: '' };
  const window = {
    scrollY: 0,
    history: {
      scrollRestoration: 'auto',
      pushState(_state, _title, hash) { location.hash = hash; }
    },
    matchMedia() { return { matches: true }; },
    requestAnimationFrame(callback) { callback(); },
    scrollTo(options) { this.lastScroll = options; },
    addEventListener(type, listener) { (windowListeners[type] ||= []).push(listener); }
  };
  const navigator = { clipboard: { async writeText(value) { clipboard = value; } } };

  vm.runInNewContext(script, { document, location, navigator, window, console, String });

  check(results.textContent === '12 domains + delivery ledger · all priorities · all states', 'initial map result count is incorrect');

  search.value = 'pricing';
  await search.fire('input');
  check(domains.filter((domain) => !domain.hidden).map((domain) => domain.id).join(',') === 'domain-pricing', 'search does not isolate the pricing domain');
  check(!ledger.hidden, 'search should retain the delivery ledger when it also matches');
  check(domains.find((domain) => domain.id === 'domain-pricing').open, 'search result does not expand its domain');

  search.value = '';
  await search.fire('input');
  priority.value = 'p0';
  await priority.fire('change');
  const p0 = domains.filter((domain) => !domain.hidden).map((domain) => domain.id).sort();
  check(p0.join(',') === 'domain-booking,domain-calendar,domain-deployment,domain-identity', `priority filter returned: ${p0.join(',')}`);

  priority.value = 'all';
  await priority.fire('change');
  status.value = 'parked';
  await status.fire('change');
  const parked = domains.filter((domain) => !domain.hidden).map((domain) => domain.id).sort();
  check(parked.join(',') === 'domain-communications,domain-contracts', `parked filter returned: ${parked.join(',')}`);

  status.value = 'all';
  await status.fire('change');
  await collapse.fire('click');
  check(domains.every((domain) => !domain.open), 'collapse-all did not close every domain');
  await expand.fire('click');
  check(domains.every((domain) => domain.open), 'expand-all did not open every domain');

  search.value = 'communications';
  await search.fire('input');
  priority.value = 'p2';
  await priority.fire('change');
  const pricingLink = indexLinks.find((link) => link.getAttribute('href') === '#domain-pricing');
  await pricingLink.fire('click');
  check(search.value === '' && status.value === 'all' && priority.value === 'all', 'deep link did not clear filters hiding its target');
  check(domains.find((domain) => domain.id === 'domain-pricing').open, 'deep link did not open its target');
  check(domains.find((domain) => domain.id === 'domain-pricing').scrollCalls.length === 1, 'deep link did not top-align its target');

  await priorityButtons[1].fire('click');
  check(priority.value === 'p1', 'priority quick filter did not set P1');
  check(domains.filter((domain) => !domain.hidden).length === 4, 'priority quick filter did not narrow to four P1 domains');
  check(domainAtlas.scrollCalls.length === 1, 'priority quick filter did not top-align the domain atlas');

  await reset.fire('click');
  check(search.value === '' && status.value === 'all' && priority.value === 'all', 'reset did not clear every filter');

  search.value = 'no-such-capability';
  await search.fire('input');
  check(stack.afterElement?.classList.contains('visible'), 'empty-result message is not shown');

  location.hash = '#domain-financials';
  for (const listener of windowListeners.hashchange || []) listener();
  check(domains.find((domain) => domain.id === 'domain-financials').open, 'hash navigation did not open its target');
  check(search.value === '', 'hash navigation did not clear a hiding search');

  location.hash = '#not%a%valid%selector';
  for (const listener of windowListeners.hashchange || []) listener();

  window.scrollY = 900;
  for (const listener of windowListeners.scroll || []) listener();
  check(!backToTop.hidden, 'back-to-top control did not appear after scrolling');
  await backToTop.fire('click');
  check(window.lastScroll?.top === 0, 'back-to-top control did not scroll to the page top');

  await copy.fire('click');
  check(clipboard.includes('CJT PLATFORM MAPS V2'), 'copy-review action did not copy the review summary');
  check(copyStatus.textContent === 'Review summary copied.', 'copy-review action did not confirm success');
}

runInteractionChecks().then(() => {
  if (failures.length) {
    console.error(`verify-platform-maps: ${failures.length} failure(s)`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('verify-platform-maps: ok');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
