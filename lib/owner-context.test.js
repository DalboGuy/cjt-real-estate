'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readContext, writeContext, contextChips, cannotApplyMessage } = require('./owner-context');

test('readContext maps aliases and drops empty values', () => {
  const context = readContext('?status=pending&channel=all&q=&range=month&property=sand-sea-manor');
  assert.equal(context.status, 'pending');
  assert.equal(context.period, 'month');
  assert.equal(context.range, 'month');
  assert.equal(context.property, 'sand-sea-manor');
  assert.equal(context.channel, undefined);
  assert.equal(context.q, undefined);
});

test('writeContext updates shareable params and clear all keeps property', () => {
  const next = writeContext('?status=pending&q=lee', { q: 'manor', unread: '1' });
  assert.equal(next.context.q, 'manor');
  assert.equal(next.context.unread, '1');
  assert.equal(next.search.includes('status=pending'), true);
  const cleared = writeContext(next.search, {}, { clear: true });
  assert.equal(cleared.search, '');
  const clearedKeep = writeContext('?status=pending&property=sand-sea-manor', {}, { clear: true });
  assert.equal(clearedKeep.context.property, 'sand-sea-manor');
  assert.equal(clearedKeep.context.status, undefined);
});

test('context chips omit property and cannot-apply copy is honest', () => {
  const chips = contextChips({ property: 'sand-sea-manor', status: 'pending', unread: '1' }, { status: 'Status', unread: 'Unread' });
  assert.deepEqual(chips.map((chip) => chip.display), ['Status: pending', 'Unread: 1']);
  assert.match(cannotApplyMessage('the selected booking', 'Messages'), /could not apply the selected booking/);
});
