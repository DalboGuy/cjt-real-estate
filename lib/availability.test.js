const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    db() { throw new Error('db disabled in availability unit tests'); },
    ensureSchema: async () => { throw new Error('db disabled in availability unit tests'); }
  }
};

const {
  getOtaBlockedDates,
  buildSourceHealth,
  isIcalFeedSource,
  parseIcalEvents,
  eachDate
} = require('./availability');

const FEED_ENVS = ['AIRBNB_ICAL_URL', 'VRBO_ICAL_URL', 'BOOKING_COM_ICAL_URL'];
const savedEnv = {};
const originalFetch = global.fetch;

function icsWith(start, end, summary = 'Reserved') {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CJT//Test//EN',
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${start.replace(/-/g, '')}`,
    `DTEND;VALUE=DATE:${end.replace(/-/g, '')}`,
    `SUMMARY:${summary}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\n');
}

const EMPTY_ICS = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//CJT//Test//EN\nEND:VCALENDAR\n';

function mockResponse(body, { status = 200, contentType = 'text/calendar' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return String(name).toLowerCase() === 'content-type' ? contentType : null; } },
    async text() { return body; }
  };
}

function setFeeds(map) {
  for (const key of FEED_ENVS) {
    if (map[key] == null) delete process.env[key];
    else process.env[key] = map[key];
  }
}

before(() => {
  for (const key of FEED_ENVS) savedEnv[key] = process.env[key];
});

beforeEach(() => {
  setFeeds({});
  global.fetch = originalFetch;
});

afterEach(() => {
  for (const key of FEED_ENVS) {
    if (savedEnv[key] == null) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  global.fetch = originalFetch;
});

describe('buildSourceHealth', () => {
  it('fails closed when a live iCal source is unhealthy', () => {
    const health = buildSourceHealth([
      { kind: 'ical', name: 'airbnb', origin: 'env', ok: true },
      { kind: 'ical', name: 'vrbo', origin: 'env', ok: false, error: 'http_500' },
      { name: 'direct', origin: 'db', channel: 'direct', ok: true }
    ]);
    assert.equal(health.ok, false);
    assert.equal(health.failClosed, true);
    assert.equal(health.liveCount, 2);
    assert.equal(health.unhealthyCount, 1);
    assert.deepEqual(health.unhealthy, ['vrbo']);
  });

  it('ignores duplicate feeds and non-iCal sources', () => {
    const health = buildSourceHealth([
      { kind: 'ical', name: 'airbnb', origin: 'env', ok: true },
      { kind: 'ical', name: 'owner:1', origin: 'owner', ok: true, duplicateOf: 'airbnb' },
      { name: 'owner_blocks', origin: 'owner', channel: 'manual_block', ok: true }
    ]);
    assert.equal(health.ok, true);
    assert.equal(health.failClosed, false);
    assert.equal(health.liveCount, 1);
    assert.equal(isIcalFeedSource({ name: 'owner_blocks', origin: 'owner', channel: 'manual_block' }), false);
  });

  it('fails closed when no live iCal sources are present', () => {
    const health = buildSourceHealth([{ name: 'direct', origin: 'db', channel: 'direct', ok: true }]);
    assert.equal(health.ok, false);
    assert.equal(health.failClosed, true);
    assert.equal(health.liveCount, 0);
  });
});

describe('getOtaBlockedDates', () => {
  it('returns blocked dates and healthy sourceHealth for valid feeds', async () => {
    setFeeds({
      AIRBNB_ICAL_URL: 'https://example.test/airbnb.ics',
      VRBO_ICAL_URL: 'https://example.test/vrbo.ics'
    });
    global.fetch = async (url) => {
      if (String(url).includes('airbnb')) return mockResponse(icsWith('2026-09-10', '2026-09-13'));
      return mockResponse(EMPTY_ICS);
    };
    const result = await getOtaBlockedDates();
    assert.equal(result.sourceHealth.ok, true);
    assert.equal(result.sourceHealth.failClosed, false);
    assert.deepEqual([...result.dates].sort(), ['2026-09-10', '2026-09-11', '2026-09-12']);
    assert.equal(result.sources.every((s) => s.ok === true), true);
    assert.equal(parseIcalEvents(icsWith('2026-09-10', '2026-09-13')).length, 1);
    assert.deepEqual(eachDate('2026-09-10', '2026-09-13'), ['2026-09-10', '2026-09-11', '2026-09-12']);
  });

  it('treats a valid empty calendar as healthy, not a silent failure', async () => {
    setFeeds({ AIRBNB_ICAL_URL: 'https://example.test/airbnb.ics' });
    global.fetch = async () => mockResponse(EMPTY_ICS);
    const result = await getOtaBlockedDates();
    assert.equal(result.sourceHealth.ok, true);
    assert.equal(result.dates.size, 0);
    assert.equal(result.sources[0].ok, true);
    assert.equal(result.sources[0].count, 0);
  });

  it('fails closed on HTML masquerading as a feed and does not return it as empty availability', async () => {
    setFeeds({
      AIRBNB_ICAL_URL: 'https://example.test/airbnb.ics',
      VRBO_ICAL_URL: 'https://example.test/vrbo.ics'
    });
    global.fetch = async (url) => {
      if (String(url).includes('airbnb')) return mockResponse('<!DOCTYPE html><html><body>login</body></html>');
      return mockResponse(icsWith('2026-09-10', '2026-09-12'));
    };
    await assert.rejects(
      () => getOtaBlockedDates(),
      (error) => {
        assert.equal(error.code, 'OTA_FEED_UNHEALTHY');
        assert.equal(error.status, 503);
        assert.equal(error.sourceHealth.ok, false);
        assert.equal(error.sourceHealth.failClosed, true);
        assert.ok(error.sourceHealth.unhealthy.includes('airbnb'));
        const airbnb = error.sources.find((s) => s.name === 'airbnb');
        assert.equal(airbnb.ok, false);
        assert.match(String(airbnb.error), /HTML instead of iCal/i);
        return true;
      }
    );
  });

  it('fails closed on HTTP errors instead of treating them as zero blocked nights', async () => {
    setFeeds({ AIRBNB_ICAL_URL: 'https://example.test/airbnb.ics' });
    global.fetch = async () => mockResponse('nope', { status: 500, contentType: 'text/plain' });
    await assert.rejects(
      () => getOtaBlockedDates(),
      (error) => {
        assert.equal(error.code, 'OTA_FEED_UNHEALTHY');
        assert.equal(error.sources[0].error, 'http_500');
        assert.equal(error.sourceHealth.unhealthyCount, 1);
        return true;
      }
    );
  });

  it('throws configuration missing when no feeds are set', async () => {
    setFeeds({});
    await assert.rejects(
      () => getOtaBlockedDates(),
      (error) => {
        assert.equal(error.code, 'OTA_FEED_CONFIG_MISSING');
        assert.equal(error.status, 503);
        assert.equal(error.sourceHealth.failClosed, true);
        return true;
      }
    );
  });
});

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

describe('api/calendar fail-closed', () => {
  const calendarViewPath = require.resolve('./calendar-view');
  const calendarApiPath = require.resolve('../api/calendar');

  function loadCalendarHandler(getGuestBlockedDates) {
    delete require.cache[calendarViewPath];
    delete require.cache[calendarApiPath];
    require.cache[calendarViewPath] = {
      id: calendarViewPath,
      filename: calendarViewPath,
      loaded: true,
      exports: { getGuestBlockedDates }
    };
    return require('../api/calendar');
  }

  it('returns 503 with empty blockedDates and sourceHealth when a feed is unhealthy', async () => {
    const handler = loadCalendarHandler(async () => {
      const error = new Error('One or more calendar feeds could not be verified. Availability is paused until feeds are healthy.');
      error.code = 'OTA_FEED_UNHEALTHY';
      error.status = 503;
      error.sources = [
        { kind: 'ical', name: 'airbnb', origin: 'env', ok: false, error: 'http_500' },
        { kind: 'ical', name: 'vrbo', origin: 'env', ok: true, count: 3 }
      ];
      error.sourceHealth = buildSourceHealth(error.sources);
      throw error;
    });
    const res = mockRes();
    await handler({}, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.deepEqual(res.body.blockedDates, []);
    assert.equal(res.body.error, 'ota_calendar_unhealthy');
    assert.equal(res.body.sourceHealth.failClosed, true);
    assert.equal(res.body.sourceHealth.ok, false);
    assert.ok(res.body.sources.some((s) => s.name === 'airbnb' && s.ok === false));
  });

  it('does not serve a silent empty 200 calendar when guest dates throw', async () => {
    const handler = loadCalendarHandler(async () => {
      throw new Error('network down');
    });
    const res = mockRes();
    await handler({}, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body.blockedDates, []);
    assert.equal(res.body.sourceHealth.failClosed, true);
    assert.notEqual(res.statusCode, 200);
  });

  it('includes sourceHealth on a healthy 200 response', async () => {
    const sources = [
      { kind: 'ical', name: 'airbnb', origin: 'env', ok: true, count: 2 },
      { name: 'direct', origin: 'db', channel: 'direct', ok: true, count: 1 }
    ];
    const handler = loadCalendarHandler(async () => ({
      dates: new Set(['2026-09-10']),
      sources,
      sourceHealth: buildSourceHealth(sources)
    }));
    const res = mockRes();
    await handler({}, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.blockedDates, ['2026-09-10']);
    assert.equal(res.body.sourceHealth.ok, true);
    assert.equal(res.body.sourceHealth.failClosed, false);
  });
});

describe('api/quote health', () => {
  const calendarViewPath = require.resolve('./calendar-view');
  const pricingPath = require.resolve('./pricing');
  const quoteApiPath = require.resolve('../api/quote');

  function loadQuoteHandler(getGuestBlockedDates, quoteStay) {
    delete require.cache[calendarViewPath];
    delete require.cache[pricingPath];
    delete require.cache[quoteApiPath];
    require.cache[calendarViewPath] = {
      id: calendarViewPath,
      filename: calendarViewPath,
      loaded: true,
      exports: { getGuestBlockedDates }
    };
    require.cache[pricingPath] = {
      id: pricingPath,
      filename: pricingPath,
      loaded: true,
      exports: {
        quoteStay: quoteStay || (async () => ({ total: 100, nights: 2, currency: 'USD' })),
        eachDate
      }
    };
    return require('../api/quote');
  }

  it('returns 503 with sourceHealth and no quote when feeds are unhealthy', async () => {
    const handler = loadQuoteHandler(async () => {
      const error = new Error('One or more calendar feeds could not be verified. Availability is paused until feeds are healthy.');
      error.code = 'OTA_FEED_UNHEALTHY';
      error.status = 503;
      error.sources = [{ kind: 'ical', name: 'vrbo', origin: 'env', ok: false, error: 'http_502' }];
      error.sourceHealth = buildSourceHealth(error.sources);
      throw error;
    });
    const res = mockRes();
    await handler({ method: 'GET', query: { checkin: '2026-11-10', checkout: '2026-11-12', guests: 2 } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'ota_calendar_unhealthy');
    assert.equal(res.body.sourceHealth.failClosed, true);
    assert.equal(res.body.available, undefined);
    assert.equal(res.body.quote, undefined);
  });

  it('includes sourceHealth on a healthy quote', async () => {
    const sources = [{ kind: 'ical', name: 'airbnb', origin: 'env', ok: true, count: 0 }];
    const handler = loadQuoteHandler(async () => ({
      dates: new Set(),
      sources,
      sourceHealth: buildSourceHealth(sources)
    }));
    const res = mockRes();
    await handler({ method: 'GET', query: { checkin: '2026-11-10', checkout: '2026-11-12', guests: 2 } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.available, true);
    assert.equal(res.body.sourceHealth.ok, true);
    assert.ok(res.body.quote);
  });

  it('does not remap pricing errors into feed-health 503', async () => {
    const handler = loadQuoteHandler(async () => ({ dates: new Set(), sources: [] }), async () => {
      const error = new Error('Check-in and check-out are required.');
      error.code = 'invalid_dates';
      error.status = 422;
      throw error;
    });
    const res = mockRes();
    await handler({ method: 'GET', query: { checkin: '', checkout: '', guests: 2 } }, res);
    assert.equal(res.statusCode, 422);
    assert.equal(res.body.error, 'invalid_dates');
    assert.equal(res.body.sourceHealth, undefined);
  });
});
