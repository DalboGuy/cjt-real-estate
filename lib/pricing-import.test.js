const test = require('node:test');
const assert = require('node:assert/strict');
const { splitCsvLine, previewPricingImport } = require('./pricing-import');

test('CSV parser supports quoted commas', () => {
  assert.deepEqual(splitCsvLine('discount,"Midweek, direct",direct'), ['discount', 'Midweek, direct', 'direct']);
});

test('pricing import previews a discount and override without writing', () => {
  const csv = [
    'record_type,name,channel,start_date,end_date,discount_type,value,minimum_nights,eligible_weekdays,nightly_rate',
    'discount,Midweek,direct,2026-09-01,2026-12-31,percent,15,2,Mon|Tue|Wed|Thu,',
    'override,Holiday,all,2026-11-25,2026-11-29,,,,,850'
  ].join('\n');
  const result = previewPricingImport(csv, 'rates.csv');
  assert.equal(result.ok, true);
  assert.equal(result.rowCount, 2);
  assert.equal(result.rows[0].data.value, 15);
  assert.deepEqual(result.rows[0].data.eligibleWeekdays, [1, 2, 3, 4]);
  assert.equal(result.rows[1].data.nightlyRate, 850);
  assert.match(result.hash, /^[a-f0-9]{64}$/);
});

test('pricing import rejects duplicate and overlapping overrides', () => {
  const csv = [
    'record_type,name,channel,start_date,end_date,nightly_rate',
    'override,One,direct,2026-10-01,2026-10-05,600',
    'override,Two,direct,2026-10-04,2026-10-06,700',
    'override,One,direct,2026-10-01,2026-10-05,600'
  ].join('\n');
  const result = previewPricingImport(csv);
  assert.equal(result.ok, false);
  assert.equal(result.validCount, 1);
  assert.match(result.errors.flatMap((entry) => entry.errors).join(' '), /overlaps|duplicates/);
});

test('pricing import returns row-level validation errors', () => {
  const result = previewPricingImport('record_type,name,channel,value\ndiscount,,somewhere,900');
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].rowNumber, 2);
  assert.match(result.errors[0].errors.join(' '), /name is required/);
  assert.match(result.errors[0].errors.join(' '), /channel must be/);
});
