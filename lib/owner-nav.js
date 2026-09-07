'use strict';

const PROPERTY_ID = 'sand-sea-manor';

const PRIMARY_NAV = Object.freeze([
  { id: 'overview', label: 'Overview', href: '/owner-v1', match: ['/owner-v1', '/owner-v1.html'] },
  { id: 'calendar', label: 'Calendar', href: '/owner-v1/calendar', match: ['/owner-v1/calendar'] },
  { id: 'bookings', label: 'Bookings', href: '/owner-v1/reservations', match: ['/owner-v1/reservations'] },
  { id: 'messages', label: 'Messages', href: '/owner-v1/communications', match: ['/owner-v1/communications'] },
  { id: 'pricing', label: 'Pricing', href: '/owner-v1/pricing', match: ['/owner-v1/pricing'] },
  { id: 'financials', label: 'Financials', href: '/owner-v1/financials', match: ['/owner-v1/financials'] },
  { id: 'tasks', label: 'Tasks', href: '/owner-v1/tasks', match: ['/owner-v1/tasks'] }
]);

const SECONDARY_NAV = Object.freeze([
  { id: 'documents', label: 'Documents', href: '/owner-v1/documents', match: ['/owner-v1/documents'] },
  { id: 'property', label: 'Property', href: '/owner-v1/property', match: ['/owner-v1/property'] },
  { id: 'team', label: 'Team', href: '/owner-v1/team', match: ['/owner-v1/team'] },
  { id: 'settings', label: 'Settings', href: '/owner-v1/settings', match: ['/owner-v1/settings'] },
  { id: 'admin', label: 'Admin', href: '/admin-v1', match: ['/admin-v1'], permission: 'admin' }
]);

const MOBILE_BOTTOM_NAV = Object.freeze(['overview', 'calendar', 'bookings', 'financials', 'more']);

const FOOTER_LINKS = Object.freeze([
  { id: 'booking-page', label: 'View Booking Page', href: '/', target: '_blank' }
]);

function normalizePath(pathname = '') {
  const raw = String(pathname || '').split('?')[0].split('#')[0];
  if (!raw || raw === '/') return '/';
  return raw.replace(/\/+$/, '') || '/';
}

function isOwnerPortalPath(pathname = '') {
  const path = normalizePath(pathname);
  return path === '/owner-v1' || path.startsWith('/owner-v1/');
}

function navItemMatches(item, pathname = '') {
  const path = normalizePath(pathname);
  return (item.match || [item.href]).some((candidate) => normalizePath(candidate) === path);
}

function activeNavId(pathname = '') {
  const path = normalizePath(pathname);
  const all = [...PRIMARY_NAV, ...SECONDARY_NAV];
  const hit = all.find((item) => navItemMatches(item, path));
  return hit ? hit.id : '';
}

function withQuery(href, params = {}) {
  const url = new URL(href, 'https://cjt.local');
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '' || value === false) return;
    url.searchParams.set(key, String(value));
  });
  url.searchParams.set('property', PROPERTY_ID);
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ''}`;
}

const KPI_DESTINATIONS = Object.freeze({
  bookingsPending: () => withQuery('/owner-v1/reservations', { status: 'pending' }),
  bookingsAction: () => withQuery('/owner-v1/reservations', { status: 'action' }),
  bookingsRecord: (id) => withQuery('/owner-v1/reservations', { booking: id || '' }),
  calendarAgenda: () => withQuery('/owner-v1/calendar', { view: 'week', focus: 'agenda' }),
  calendarConflicts: () => withQuery('/owner-v1/calendar', { focus: 'conflicts' }),
  calendarDate: (date) => withQuery('/owner-v1/calendar', { date, view: 'month' }),
  calendarSources: () => withQuery('/owner-v1/calendar', { focus: 'connections' }),
  messagesUnread: () => withQuery('/owner-v1/communications', { unread: '1' }),
  messagesRecord: (id) => withQuery('/owner-v1/communications', { message: id || '', unread: '1' }),
  tasksOverdue: () => withQuery('/owner-v1/tasks', { due: 'overdue', status: 'open' }),
  tasksOpen: () => withQuery('/owner-v1/tasks', { status: 'open' }),
  financialsPeriod: (period = 'month') => withQuery('/owner-v1/financials', { period }),
  financialsYtd: () => withQuery('/owner-v1/financials', { period: 'ytd' }),
  financialsChannel: (channel) => withQuery('/owner-v1/financials', { channel, period: 'month' }),
  financialsStays: (period = 'month') => withQuery('/owner-v1/financials', { period, tab: 'all' }),
  financialsUpcoming: () => withQuery('/owner-v1/financials', { tab: 'upcoming', period: 'ytd' }),
  pricingSeason: (season) => withQuery('/owner-v1/pricing', { season }),
  pricingDate: (date) => withQuery('/owner-v1/pricing', { date })
});

module.exports = {
  PROPERTY_ID,
  PRIMARY_NAV,
  SECONDARY_NAV,
  MOBILE_BOTTOM_NAV,
  FOOTER_LINKS,
  normalizePath,
  isOwnerPortalPath,
  navItemMatches,
  activeNavId,
  withQuery,
  KPI_DESTINATIONS
};
