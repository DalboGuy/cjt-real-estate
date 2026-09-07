const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const PATHS = {
  db: require.resolve('./db'),
  preview: require.resolve('./preview-access'),
  calendarView: require.resolve('./calendar-view'),
  availability: require.resolve('./availability'),
  owner: require.resolve('../api/owner')
};

const realCalendarView = require('./calendar-view');
const savedModules = new Map();

function snapshotModule(path) {
  if (!savedModules.has(path) && require.cache[path]) {
    savedModules.set(path, require.cache[path]);
  }
}

function restoreModules() {
  for (const path of Object.values(PATHS)) {
    delete require.cache[path];
    if (savedModules.has(path)) require.cache[path] = savedModules.get(path);
  }
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return res; },
    json(body) { res.body = body; return res; }
  };
  return res;
}

function loadOwner({ captured = [], getOtaBlockedDates, listOwnerConnections }) {
  for (const p of Object.values(PATHS)) {
    snapshotModule(p);
    delete require.cache[p];
  }

  require.cache[PATHS.db] = {
    id: PATHS.db,
    filename: PATHS.db,
    loaded: true,
    exports: {
      db() { return async () => []; },
      ensureSchema: async () => {}
    }
  };
  require.cache[PATHS.preview] = {
    id: PATHS.preview,
    filename: PATHS.preview,
    loaded: true,
    exports: { previewPasswordFreeActive: () => true }
  };
  require.cache[PATHS.calendarView] = {
    id: PATHS.calendarView,
    filename: PATHS.calendarView,
    loaded: true,
    exports: {
      validIsoDate: realCalendarView.validIsoDate,
      buildOwnerSyncPayload: realCalendarView.buildOwnerSyncPayload,
      otaFromCaughtError: realCalendarView.otaFromCaughtError,
      async buildOwnerCalendarView(opts) {
        captured.push(opts);
        return {
          view: opts.view,
          range: { year: opts.year, month: opts.month },
          events: [],
          nights: {},
          sync: { mode: opts.syncMode, ok: true, sources: [], configError: null }
        };
      }
    }
  };
  require.cache[PATHS.availability] = {
    id: PATHS.availability,
    filename: PATHS.availability,
    loaded: true,
    exports: {
      getOtaBlockedDates: getOtaBlockedDates || (async () => ({ sources: [] })),
      listOwnerConnections: listOwnerConnections || (async () => []),
      FEED_ENV_BY_SOURCE: { airbnb: 'AIRBNB_ICAL_URL', vrbo: 'VRBO_ICAL_URL', 'booking.com': 'BOOKING_COM_ICAL_URL' },
      MAX_OWNER_CALENDARS: 10,
      urlHostHint() { return 'example.test'; },
      eachDate() { return []; }
    }
  };

  return require('../api/owner');
}

afterEach(() => {
  restoreModules();
});

describe('owner calendar_sync / calendar_view / calendar_feeds_status', () => {
  it('calendar_sync passes the same view params as calendar_view plus syncMode full_refresh', async () => {
    const captured = [];
    const handler = loadOwner({ captured });
    const body = { view: 'week', year: 2026, month: 9, focusDate: '2026-09-10' };
    const viewRes = mockRes();
    await handler({ method: 'POST', headers: {}, body: { action: 'calendar_view', ...body } }, viewRes);
    const syncRes = mockRes();
    await handler({ method: 'POST', headers: {}, body: { action: 'calendar_sync', ...body } }, syncRes);
    assert.equal(viewRes.statusCode, 200);
    assert.equal(syncRes.statusCode, 200);
    assert.deepEqual(captured[0], { view: 'week', year: 2026, month: 9, focusDate: '2026-09-10', syncMode: 'view' });
    assert.deepEqual(captured[1], { view: 'week', year: 2026, month: 9, focusDate: '2026-09-10', syncMode: 'full_refresh' });
    assert.equal(viewRes.body.sync.mode, 'view');
    assert.equal(syncRes.body.sync.mode, 'full_refresh');
    assert.equal(viewRes.body.sourceHealth, undefined);
    assert.equal(syncRes.body.sourceHealth, undefined);
  });

  it('calendar_feeds_status is probe and is not a Sync Calendars success signal', async () => {
    const handler = loadOwner({
      getOtaBlockedDates: async () => {
        const error = new Error('One or more calendar feeds could not be verified.');
        error.code = 'OTA_FEED_UNHEALTHY';
        error.sources = [
          { kind: 'ical', name: 'airbnb', label: 'airbnb', channel: 'airbnb', origin: 'env', ok: false, error: 'http_500', count: 0, hostHint: 'example.test', duplicateOf: null }
        ];
        throw error;
      }
    });
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { action: 'calendar_feeds_status' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.sync.mode, 'probe');
    assert.equal(res.body.sync.ok, false);
    assert.equal(res.body.sync.configError.code, 'OTA_FEED_UNHEALTHY');
    assert.equal(res.body.liveSources[0].ok, false);
    assert.equal('lastSuccessfulAt' in res.body.liveSources[0], false);
    assert.equal(res.body.sourceHealth, undefined);
    assert.notEqual(res.body.sync.mode, 'full_refresh');
  });
});
