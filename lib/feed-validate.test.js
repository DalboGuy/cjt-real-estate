const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateIcalText, contentTypeIsHtml, MAX_ICAL_CHARS } = require('./feed-validate');

const EMPTY_CAL = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//CJT//Test//EN\nEND:VCALENDAR\n';
const WITH_EVENT = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20260910',
  'DTEND;VALUE=DATE:20260913',
  'SUMMARY:Reserved',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\n');

describe('validateIcalText', () => {
  it('accepts a valid empty calendar and a calendar with events', () => {
    assert.equal(validateIcalText(EMPTY_CAL).ok, true);
    assert.equal(validateIcalText(WITH_EVENT).ok, true);
    assert.equal(validateIcalText(WITH_EVENT).code, 'ICAL_OK');
  });

  it('rejects empty, HTML, JSON, and truncated bodies', () => {
    assert.equal(validateIcalText('').code, 'ICAL_EMPTY');
    assert.equal(validateIcalText('   \n').code, 'ICAL_EMPTY');
    assert.equal(validateIcalText('<!DOCTYPE html><html><body>login</body></html>').code, 'ICAL_HTML');
    assert.equal(validateIcalText(EMPTY_CAL, { contentType: 'text/html; charset=utf-8' }).code, 'ICAL_HTML');
    assert.equal(validateIcalText('{"error":"not found"}').code, 'ICAL_NOT_CALENDAR');
    assert.equal(validateIcalText('BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:x').code, 'ICAL_TRUNCATED');
  });

  it('rejects oversized payloads', () => {
    const huge = `BEGIN:VCALENDAR\n${'X'.repeat(MAX_ICAL_CHARS)}\nEND:VCALENDAR`;
    assert.equal(validateIcalText(huge).code, 'ICAL_TOO_LARGE');
  });
});

describe('contentTypeIsHtml', () => {
  it('detects HTML content types only', () => {
    assert.equal(contentTypeIsHtml('text/html'), true);
    assert.equal(contentTypeIsHtml('text/calendar; charset=utf-8'), false);
    assert.equal(contentTypeIsHtml('text/plain'), false);
  });
});
