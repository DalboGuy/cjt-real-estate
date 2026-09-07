const MAX_ICAL_CHARS = 2 * 1024 * 1024;
const HTML_RE = /<!DOCTYPE\s+html|<html[\s>]|<body[\s>]/i;
const ICAL_BEGIN_RE = /BEGIN:VCALENDAR/i;
const ICAL_END_RE = /END:VCALENDAR/i;

function contentTypeIsHtml(contentType) {
  return /text\/html|application\/xhtml/i.test(String(contentType || ''));
}

function validateIcalText(text, { contentType } = {}) {
  const raw = String(text ?? '');
  if (!raw.trim()) {
    return { ok: false, code: 'ICAL_EMPTY', message: 'Calendar feed was empty.' };
  }
  if (raw.length > MAX_ICAL_CHARS) {
    return { ok: false, code: 'ICAL_TOO_LARGE', message: 'Calendar feed exceeded the size limit.' };
  }
  if (contentTypeIsHtml(contentType) || HTML_RE.test(raw.slice(0, 4000))) {
    return { ok: false, code: 'ICAL_HTML', message: 'Calendar feed returned HTML instead of iCal.' };
  }
  if (!ICAL_BEGIN_RE.test(raw)) {
    return { ok: false, code: 'ICAL_NOT_CALENDAR', message: 'Calendar feed was not a valid iCalendar document.' };
  }
  if (!ICAL_END_RE.test(raw)) {
    return { ok: false, code: 'ICAL_TRUNCATED', message: 'Calendar feed was truncated or incomplete.' };
  }
  return { ok: true, code: 'ICAL_OK', message: 'ok' };
}

module.exports = {
  MAX_ICAL_CHARS,
  contentTypeIsHtml,
  validateIcalText
};
