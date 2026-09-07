'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PRIMARY_NAV,
  SECONDARY_NAV,
  MOBILE_BOTTOM_NAV,
  FOOTER_LINKS,
  normalizePath,
  isOwnerPortalPath,
  activeNavId,
  KPI_DESTINATIONS
} = require('./owner-nav');

test('primary nav labels and order are locked', () => {
  assert.deepEqual(PRIMARY_NAV.map((item) => item.label), [
    'Overview', 'Calendar', 'Bookings', 'Messages', 'Pricing', 'Financials', 'Tasks'
  ]);
});

test('secondary nav labels and order are locked', () => {
  assert.deepEqual(SECONDARY_NAV.map((item) => item.label), [
    'Documents', 'Property', 'Team', 'Settings', 'Admin'
  ]);
});

test('mobile bottom nav is Overview Calendar Bookings Financials More', () => {
  assert.deepEqual([...MOBILE_BOTTOM_NAV], ['overview', 'calendar', 'bookings', 'financials', 'more']);
});

test('shell footer has one booking-page link and does not duplicate Guest site', () => {
  assert.deepEqual(FOOTER_LINKS.map((item) => item.label), ['View Booking Page']);
  assert.equal(FOOTER_LINKS.some((item) => /guest site/i.test(item.label)), false);
});

test('active nav matches owner-v1 aliases', () => {
  assert.equal(activeNavId('/owner-v1'), 'overview');
  assert.equal(activeNavId('/owner-v1/'), 'overview');
  assert.equal(activeNavId('/owner-v1/reservations'), 'bookings');
  assert.equal(activeNavId('/owner-v1/communications'), 'messages');
  assert.equal(activeNavId('/owner-v1/tasks'), 'tasks');
  assert.equal(isOwnerPortalPath('/owner-v1/calendar'), true);
  assert.equal(isOwnerPortalPath('/admin-v1'), false);
  assert.equal(normalizePath('/owner-v1/financials/'), '/owner-v1/financials');
});

test('KPI destinations carry shareable query params', () => {
  assert.equal(KPI_DESTINATIONS.bookingsPending().includes('/owner-v1/reservations'), true);
  assert.equal(KPI_DESTINATIONS.bookingsPending().includes('status=pending'), true);
  assert.equal(KPI_DESTINATIONS.calendarConflicts().includes('focus=conflicts'), true);
  assert.equal(KPI_DESTINATIONS.messagesUnread().includes('unread=1'), true);
  assert.equal(KPI_DESTINATIONS.tasksOverdue().includes('due=overdue'), true);
  assert.equal(KPI_DESTINATIONS.financialsChannel('airbnb').includes('channel=airbnb'), true);
  assert.equal(KPI_DESTINATIONS.financialsPeriod('month').includes('period=month'), true);
  assert.equal(KPI_DESTINATIONS.financialsPeriod('month').includes('section='), false);
  assert.equal(KPI_DESTINATIONS.financialsYtd().includes('period=ytd'), true);
  assert.equal(KPI_DESTINATIONS.financialsStays().includes('tab=all'), true);
  assert.equal(KPI_DESTINATIONS.financialsUpcoming().includes('tab=upcoming'), true);
  assert.equal(KPI_DESTINATIONS.bookingsRecord('abc').includes('booking=abc'), true);
  assert.equal(KPI_DESTINATIONS.calendarSources().includes('focus=connections'), true);
  assert.equal(KPI_DESTINATIONS.bookingsPending().includes('property=sand-sea-manor'), true);
});
