const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  snapshotFromInputs,
  buildSyncSources,
  buildOwnerSyncPayload,
  syncOkFromInputs,
  otaFromCaughtError,
  enrichSyncSource,
  yearBounds,
  dayBounds,
  viewRangeBounds,
  normalizeView,
  DEFAULT_SETTINGS
} = require('./calendar-view');

const reservations = [
  { id: 'DB-1', guest_name: 'Ada', guests: 4, checkin: '2026-09-10', checkout: '2026-09-13', status: 'confirmed' },
  { id: 'DB-2', guest_name: 'Cancelled', guests: 2, checkin: '2026-09-18', checkout: '2026-09-20', status: 'cancelled' }
];
const entries = [
  { id: 7, kind: 'owner_stay', start_date: '2026-09-01', end_date: '2026-09-03', notes: 'family' },
  { id: 8, kind: 'manual_block', start_date: '2026-09-12', end_date: '2026-09-14', notes: 'paint' }
];
const otaEvents = [
  { start: '2026-09-22', end: '2026-09-24', summary: 'Blocked', channel: 'vrbo', origin: 'env', uid: 'vrbo1' }
];
const healthyIcal = {
  kind: 'ical',
  name: 'airbnb',
  label: 'airbnb',
  channel: 'airbnb',
  ok: true,
  count: 3,
  error: null,
  origin: 'env',
  hostHint: 'example.test',
  duplicateOf: null
};

describe('owner sync payload', () => {
  it('sets lastSuccessfulAt only when this fetch succeeded', () => {
    const at = '2026-09-07T12:00:00.000Z';
    const sources = buildSyncSources({
      reservations,
      ota: {
        sources: [
          healthyIcal,
          { ...healthyIcal, name: 'vrbo', label: 'vrbo', channel: 'vrbo', ok: false, count: 0, error: 'http_500' }
        ]
      }
    }, at);
    const direct = sources.find((s) => s.name === 'direct');
    assert.equal(direct.origin, 'db');
    assert.equal(direct.count, 1);
    assert.equal('lastSuccessfulAt' in direct, false);
    assert.equal(sources.find((s) => s.name === 'airbnb').lastSuccessfulAt, at);
    assert.equal('lastSuccessfulAt' in sources.find((s) => s.name === 'vrbo'), false);
    assert.equal(sources.find((s) => s.name === 'vrbo').error, 'http_500');
  });

  it('sync.ok is false when a live inbound source fails or config is missing', () => {
    assert.equal(syncOkFromInputs({ ota: { sources: [healthyIcal] } }), true);
    assert.equal(syncOkFromInputs({
      ota: { sources: [{ ...healthyIcal, ok: false, error: 'feed_timeout' }] }
    }), false);
    assert.equal(syncOkFromInputs({
      otaConfigError: { code: 'OTA_FEED_CONFIG_MISSING', message: 'No calendar feeds configured' },
      ota: { sources: [] }
    }), false);
    assert.equal(syncOkFromInputs({
      ota: { sources: [{ ...healthyIcal, name: 'owner:1', origin: 'owner', duplicateOf: 'airbnb', ok: false }] }
    }), true);
  });

  it('year and day windows clip nights to the requested view', () => {
    assert.deepEqual(yearBounds(2026), { start: '2026-01-01', end: '2027-01-01' });
    assert.deepEqual(dayBounds('2026-09-10'), { start: '2026-09-10', end: '2026-09-11' });
    assert.equal(normalizeView('YEAR'), 'year');
    assert.equal(normalizeView('day'), 'day');
    assert.equal(normalizeView('agenda'), 'month');
    assert.deepEqual(viewRangeBounds('year', { year: 2026, month: 9, focusDate: '2026-09-10' }), {
      start: '2026-01-01',
      end: '2027-01-01'
    });
    assert.deepEqual(viewRangeBounds('day', { year: 2026, month: 9, focusDate: '2026-09-10' }), {
      start: '2026-09-10',
      end: '2026-09-11'
    });

    const inputs = {
      ota: { events: otaEvents, sources: [healthyIcal] },
      reservations,
      entries,
      settings: DEFAULT_SETTINGS
    };
    const yearSnap = snapshotFromInputs(inputs, {
      year: 2026, month: 9, view: 'year', focusDate: '2026-09-10', checkedAt: '2026-09-07T12:00:00.000Z'
    });
    assert.equal(yearSnap.view, 'year');
    assert.equal(yearSnap.range.yearStart, '2026-01-01');
    assert.equal(yearSnap.range.yearEnd, '2027-01-01');
    assert.equal(yearSnap.occupancy.viewedYear.total, 365);
    assert.equal(yearSnap.occupancy.viewedYear.start, '2026-01-01');
    assert.ok(yearSnap.nights['2026-09-01']);
    assert.ok(yearSnap.nights['2026-09-22']);
    assert.equal(yearSnap.nights['2025-12-31'], undefined);
    assert.equal(yearSnap.sourceHealth, undefined);
    assert.equal(yearSnap.sync.mode, 'view');

    const daySnap = snapshotFromInputs(inputs, {
      year: 2026, month: 9, view: 'day', focusDate: '2026-09-12', checkedAt: '2026-09-07T12:00:00.000Z'
    });
    assert.equal(daySnap.view, 'day');
    assert.equal(daySnap.range.day, '2026-09-12');
    assert.equal(daySnap.range.dayStart, '2026-09-12');
    assert.equal(daySnap.range.dayEnd, '2026-09-13');
    assert.equal(daySnap.occupancy.viewedDay.total, 1);
    assert.equal(daySnap.occupancy.viewedDay.booked, 1);
    assert.ok(daySnap.nights['2026-09-12']);
    assert.ok(daySnap.nights['2026-09-10'], 'day view keeps nearby nights inside the 7-day pad');
    assert.ok(daySnap.nights['2026-09-13'], 'day view includes checkout slot + pad');
    assert.equal(daySnap.nights['2026-09-01'], undefined, 'owner stay before the pad is clipped');
    assert.equal(daySnap.conflicts.some((row) => row.date === '2026-09-12'), true);
    assert.ok(!daySnap.conflicts.some((row) => row.date !== '2026-09-12'), 'day conflicts stay on the focus night');
    assert.equal(daySnap.sourceHealth, undefined);
  });

  it('calendar_sync snapshot matches calendar_view except sync.mode for year and day', () => {
    const inputs = {
      ota: { events: otaEvents, sources: [healthyIcal] },
      reservations,
      entries,
      settings: DEFAULT_SETTINGS
    };
    for (const view of ['year', 'day']) {
      const opts = { year: 2026, month: 9, view, focusDate: '2026-09-10', checkedAt: '2026-09-07T12:00:00.000Z' };
      const viewSnap = snapshotFromInputs(inputs, { ...opts, syncMode: 'view' });
      const syncSnap = snapshotFromInputs(inputs, { ...opts, syncMode: 'full_refresh' });
      assert.equal(viewSnap.view, view);
      assert.equal(syncSnap.view, view);
      assert.equal(viewSnap.sync.mode, 'view');
      assert.equal(syncSnap.sync.mode, 'full_refresh');
      assert.equal(viewSnap.sourceHealth, undefined);
      assert.equal(syncSnap.sourceHealth, undefined);
      assert.deepEqual(
        { ...viewSnap, sync: { ...viewSnap.sync, mode: null } },
        { ...syncSnap, sync: { ...syncSnap.sync, mode: null } }
      );
    }
  });

  it('calendar_sync snapshot matches calendar_view except sync.mode', () => {
    const inputs = {
      ota: { events: otaEvents, sources: [healthyIcal] },
      reservations,
      entries,
      settings: DEFAULT_SETTINGS
    };
    const opts = { year: 2026, month: 9, view: 'month', focusDate: '2026-09-10', checkedAt: '2026-09-07T12:00:00.000Z' };
    const viewSnap = snapshotFromInputs(inputs, { ...opts, syncMode: 'view' });
    const syncSnap = snapshotFromInputs(inputs, { ...opts, syncMode: 'full_refresh' });
    assert.equal(viewSnap.sync.mode, 'view');
    assert.equal(syncSnap.sync.mode, 'full_refresh');
    assert.equal(viewSnap.sync.ok, true);
    assert.equal(syncSnap.sourceHealth, undefined);
    assert.equal(viewSnap.sourceHealth, undefined);
    assert.ok(viewSnap.nights['2026-09-12'].conflict, 'direct + owner block remain separate conflicting facts');
    assert.deepEqual(
      { ...viewSnap, sync: { ...viewSnap.sync, mode: null } },
      { ...syncSnap, sync: { ...syncSnap.sync, mode: null } }
    );
    assert.ok(viewSnap.events.some((e) => e.channel === 'owner_stay'));
    assert.ok(viewSnap.events.some((e) => e.channel === 'manual_block'));
    assert.ok(!viewSnap.sync.sources.some((s) => s.channel === 'owner_stay' || s.channel === 'manual_block'));
  });

  it('keeps configError for missing feeds and omits lastSuccessfulAt on the synthetic source', () => {
    const payload = buildOwnerSyncPayload({
      reservations,
      ota: otaFromCaughtError({
        code: 'OTA_FEED_CONFIG_MISSING',
        message: 'No calendar feeds configured',
        sources: []
      }),
      otaConfigError: { code: 'OTA_FEED_CONFIG_MISSING', message: 'No calendar feeds configured' }
    }, { mode: 'full_refresh', checkedAt: '2026-09-07T12:00:00.000Z' });
    assert.equal(payload.ok, false);
    assert.equal(payload.mode, 'full_refresh');
    assert.equal(payload.configError.code, 'OTA_FEED_CONFIG_MISSING');
    const ota = payload.sources.find((s) => s.name === 'ota');
    assert.equal(ota.ok, false);
    assert.equal('lastSuccessfulAt' in ota, false);
  });

  it('preserves per-source ok/error from a fail-closed throw', () => {
    const caught = otaFromCaughtError({
      code: 'OTA_FEED_UNHEALTHY',
      message: 'One or more calendar feeds could not be verified.',
      sources: [
        { kind: 'ical', name: 'airbnb', origin: 'env', ok: false, error: 'http_500' },
        { kind: 'ical', name: 'vrbo', origin: 'env', ok: true, count: 2 }
      ]
    });
    assert.equal(caught.sources[0].name, 'airbnb');
    assert.equal(caught.sources[0].error, 'http_500');
    const enriched = enrichSyncSource(caught.sources[1], '2026-09-07T12:00:00.000Z');
    assert.equal(enriched.lastSuccessfulAt, '2026-09-07T12:00:00.000Z');
    const probe = buildOwnerSyncPayload({
      ota: caught,
      otaConfigError: { code: 'OTA_FEED_UNHEALTHY', message: 'paused' }
    }, { mode: 'probe', checkedAt: '2026-09-07T12:00:00.000Z' });
    assert.equal(probe.mode, 'probe');
    assert.equal(probe.ok, false);
    assert.ok(!probe.sources.some((s) => s.name === 'direct'));
  });
});
