/* Zero-dependency, production Seasonal Pricing accordion. */
(function (root) {
  'use strict';
  var DEFAULTS = { baseRate: null, seasons: [], dataSource: null, sampleData: false };
  var currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var dates = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  function money(value) { return value === null || value === undefined || value === '' || isNaN(Number(value)) ? '—' : currency.format(Number(value)); }
  function date(value) { var d = new Date(String(value || '') + 'T00:00:00Z'); return isNaN(d) ? String(value || '—') : dates.format(d); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function payload(value) { return Array.isArray(value) ? { seasons: value } : (value && typeof value === 'object' ? value : {}); }
  function load(source) {
    if (!source) return Promise.resolve(null);
    if (typeof source === 'function') return Promise.resolve(source());
    if (Array.isArray(source) || typeof source === 'object') return Promise.resolve(source);
    if (typeof source === 'string') return fetch(source).then(function (r) { if (!r.ok) throw Error('Seasonal rates request failed (' + r.status + ')'); return r.json(); });
    return Promise.resolve(null);
  }
  function mount(target, options) {
    var node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!node) return null;
    var opts = Object.assign({}, DEFAULTS, options || {});
    node.classList.add('cjt-seasonal-pricing', 'is-loading'); node.setAttribute('data-cjt-seasonal-pricing-mounted', 'true'); node.innerHTML = '';
    var header = el('div', 'cjt-seasonal-pricing__header'); header.appendChild(el('h2', 'cjt-seasonal-pricing__title', 'Seasonal Pricing')); header.appendChild(el('p', 'cjt-seasonal-pricing__intro', 'Nightly rates by season and stay requirements.'));
    if (opts.sampleData) header.appendChild(el('span', 'cjt-seasonal-pricing__sample-badge', opts.badge || 'Sample data — not live pricing'));
    node.appendChild(header);
    var base = el('div', 'cjt-seasonal-pricing__base'); base.appendChild(el('span', 'cjt-seasonal-pricing__base-label', 'Base Rate')); var baseValue = el('strong', 'cjt-seasonal-pricing__base-value', money(opts.baseRate)); base.appendChild(baseValue); node.appendChild(base);
    var list = el('ul', 'cjt-seasonal-pricing__list'); node.appendChild(list); var status = null;
    function statusMessage(text, error) { if (status) status.remove(); status = el('p', error ? 'cjt-seasonal-pricing__error' : 'cjt-seasonal-pricing__empty', text); node.appendChild(status); }
    function render(raw) {
      var data = payload(raw), seasons = Array.isArray(data.seasons) ? data.seasons : [];
      if (data.baseRate !== undefined && data.baseRate !== null) baseValue.textContent = money(data.baseRate);
      list.innerHTML = '';
      if (!seasons.length) { statusMessage('Seasonal rates are not available yet. Check the quote for a live stay-specific price.', false); return; }
      if (status) { status.remove(); status = null; }
      seasons.forEach(function (season, index) {
        var item = el('li', 'cjt-seasonal-pricing__item'), panelId = 'cjt-seasonal-pricing-panel-' + Math.random().toString(36).slice(2) + '-' + index;
        var button = el('button', 'cjt-seasonal-pricing__trigger'); button.type = 'button'; button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', panelId);
        var name = el('span', 'cjt-seasonal-pricing__season-name', season.name || 'Seasonal rate'); var meta = el('span', 'cjt-seasonal-pricing__meta', (season.nights ? season.nights + ' night minimum' : 'Minimum stay varies') + ' · ' + date(season.start) + '–' + date(season.end)); var price = el('span', 'cjt-seasonal-pricing__price', money(season.price)); var chevron = el('span', 'cjt-seasonal-pricing__chevron'); chevron.setAttribute('aria-hidden', 'true');
        button.appendChild(name); button.appendChild(meta); button.appendChild(price); button.appendChild(chevron);
        var panel = el('div', 'cjt-seasonal-pricing__panel'); panel.id = panelId; panel.hidden = true; panel.inert = true; panel.setAttribute('role', 'region');
        var inner = el('div', 'cjt-seasonal-pricing__panel-inner'), details = el('dl', 'cjt-seasonal-pricing__details');
        function detail(label, value) { var wrap = el('div', 'cjt-seasonal-pricing__detail'); wrap.appendChild(el('dt', '', label)); wrap.appendChild(el('dd', '', value)); details.appendChild(wrap); }
        detail('Date range', date(season.start) + ' – ' + date(season.end)); detail('Minimum stay', season.nights ? season.nights + ' nights' : 'Varies');
        if (season.note) { var note = el('div', 'cjt-seasonal-pricing__note cjt-seasonal-pricing__detail'); note.appendChild(el('dt', 'cjt-seasonal-pricing__sr-only', 'Note')); note.appendChild(el('dd', '', season.note)); details.appendChild(note); }
        inner.appendChild(details); panel.appendChild(inner); item.appendChild(button); item.appendChild(panel); list.appendChild(item);
        var titleId = panelId + '-title'; name.id = titleId; panel.setAttribute('aria-labelledby', titleId);
        var closeTimer;
        function setOpen(next) {
          clearTimeout(closeTimer); button.setAttribute('aria-expanded', String(next));
          if (next) { panel.hidden = false; panel.inert = false; panel.removeAttribute('aria-hidden'); item.classList.add('is-open'); }
          else { item.classList.remove('is-open'); panel.setAttribute('aria-hidden', 'true'); panel.inert = true; closeTimer = setTimeout(function () { if (button.getAttribute('aria-expanded') === 'false') panel.hidden = true; }, ((window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 0 : (parseFloat(getComputedStyle(node).getPropertyValue('--cjt-seasonal-duration')) || 0))); }
        }
        button.addEventListener('click', function () {
          var next = button.getAttribute('aria-expanded') !== 'true';
          Array.prototype.forEach.call(list.children, function (other, otherIndex) { if (otherIndex !== index) { var b = other.querySelector('.cjt-seasonal-pricing__trigger'); if (b && b.getAttribute('aria-expanded') === 'true') b.click(); } });
          setOpen(next);
        });
        button.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); button.click(); } });
      });
    }
    if (opts.dataSource) {
      load(opts.dataSource).then(function (raw) {
        node.classList.remove('is-loading'); var source = payload(raw || {}); render(Object.assign({}, opts, source, { seasons: source.seasons || opts.seasons }));
      }).catch(function () { node.classList.remove('is-loading'); list.innerHTML = ''; statusMessage('Seasonal rates could not be loaded. Check the quote for a live stay-specific price.', true); });
    } else {
      node.classList.remove('is-loading'); render(opts);
    }
    return { container: node, refresh: function (next) { return mount(node, Object.assign({}, opts, next || {})); } };
  }
  function autoMount() { var n = document.querySelector('#cjt-seasonal-pricing, [data-cjt-seasonal-pricing]'); if (!n || n.getAttribute('data-cjt-seasonal-pricing-mounted')) return; var opts = n.cjtSeasonalPricingOptions || {}; if (n.getAttribute('data-sample-data') === '1' && root.CJTSeasonalPricingSample) opts = Object.assign({}, root.CJTSeasonalPricingSample, opts, { sampleData: true }); mount(n, opts); }
  root.CJTSeasonalPricing = { mount: mount, autoMount: autoMount };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount); else autoMount();
}(window));
