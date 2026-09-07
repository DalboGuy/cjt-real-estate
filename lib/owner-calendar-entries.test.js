const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEntryNotes, updateOwnerEntryNotes } = require('./owner-calendar-entries');

function sqlText(strings) {
  return strings.join('?');
}

function makeSql({ rows = [] } = {}) {
  const calls = [];
  function sql(strings, ...values) {
    const text = sqlText(strings);
    calls.push({ text, values });
    if (/UPDATE owner_calendar_entries/i.test(text)) {
      return Promise.resolve(rows);
    }
    return Promise.reject(new Error(`unexpected sql: ${text}`));
  }
  return { sql, calls };
}

describe('normalizeEntryNotes', () => {
  it('trims, caps at 500 chars, and treats blank as null', () => {
    assert.equal(normalizeEntryNotes('  paint  '), 'paint');
    assert.equal(normalizeEntryNotes('a'.repeat(600)), 'a'.repeat(500));
    assert.equal(normalizeEntryNotes('   '), null);
    assert.equal(normalizeEntryNotes(''), null);
    assert.equal(normalizeEntryNotes(null), null);
    assert.equal(normalizeEntryNotes(undefined), null);
  });
});

describe('updateOwnerEntryNotes', () => {
  it('updates notes only and returns the saved entry', async () => {
    const entry = {
      id: 12,
      kind: 'owner_stay',
      start_date: '2026-11-10',
      end_date: '2026-11-14',
      notes: 'paint'
    };
    const { sql, calls } = makeSql({ rows: [entry] });
    const result = await updateOwnerEntryNotes(sql, { id: 12, notes: '  paint  ' });
    assert.deepEqual(result, { ok: true, entry });
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /UPDATE owner_calendar_entries/i);
    assert.match(calls[0].text, /updated_at=now\(\)/);
    assert.match(calls[0].text, /RETURNING id, kind, start_date::text, end_date::text, notes/);
    assert.deepEqual(calls[0].values, ['paint', 12]);
    assert.doesNotMatch(calls[0].text, /kind=/);
    assert.doesNotMatch(calls[0].text, /start_date=/);
    assert.doesNotMatch(calls[0].text, /end_date=/);
  });

  it('returns not_found when no row matches', async () => {
    const { sql } = makeSql({ rows: [] });
    const result = await updateOwnerEntryNotes(sql, { id: 99, notes: 'x' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.equal(result.error, 'not_found');
    assert.match(result.message, /not found/i);
  });

  it('trims and caps notes at 500 chars before write', async () => {
    const capped = 'a'.repeat(500);
    const { sql, calls } = makeSql({
      rows: [{
        id: 1,
        kind: 'manual_block',
        start_date: '2026-11-10',
        end_date: '2026-11-11',
        notes: capped
      }]
    });
    const result = await updateOwnerEntryNotes(sql, { id: 1, notes: `  ${'a'.repeat(600)}  ` });
    assert.equal(result.ok, true);
    assert.equal(calls[0].values[0], capped);
    assert.equal(calls[0].values[0].length, 500);
  });
});
