const { getOtaBlockedDates, eachDate } = require('../lib/availability');
const { getActiveReservations } = require('../lib/db');

function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

module.exports = async function (req, res) {
  const all = new Set();
  const sources = [];
  try {
    const ota = await getOtaBlockedDates();
    ota.dates.forEach((d) => all.add(d));
    sources.push(...ota.sources);
  } catch (e) {
    sources.push({ name: 'ota', ok: false, error: e.message });
  }
  try {
    const reservations = await getActiveReservations();
    for (const r of reservations) {
      eachDate(r.checkin, r.checkout).forEach((d) => all.add(d));
    }
    sources.push({
      name: 'direct',
      ok: true,
      count: reservations.length,
      ids: reservations.map((r) => r.id)
    });
  } catch (e) {
    sources.push({ name: 'direct', ok: false, error: e.message });
  }
  noStore(res);
  res.status(200).json({
    blockedDates: [...all].sort(),
    sources,
    checkedAt: new Date().toISOString()
  });
};
