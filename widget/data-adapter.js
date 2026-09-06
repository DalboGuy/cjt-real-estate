/**
 * Map pricing_overrides rows into display seasons without mutating input.
 * Rows must contain stay_date (YYYY-MM-DD), nightly_rate, min_nights, label.
 * Contiguous dates group only when label, nightly_rate, and min_nights match.
 * This does not calculate discounts, taxes, fees, or booking totals.
 * @param {Array<Object>} overrides pricing_overrides-shaped rows
 * @param {number|string} baseRate fallback/base nightly rate
 * @returns {{baseRate: number|string, seasons: Array<Object>}}
 */
function groupOverridesToSeasons(overrides, baseRate) {
  var rows = Array.isArray(overrides) ? overrides.slice() : [];
  rows.sort(function (a, b) { return String(a.stay_date).localeCompare(String(b.stay_date)); });
  var seasons = [], current = null;
  rows.forEach(function (row) {
    var date = String(row.stay_date || ''), label = row.label == null || row.label === '' ? 'Seasonal rate' : String(row.label);
    var rate = Number(row.nightly_rate), nights = Number(row.min_nights);
    var prior = current && new Date(current.end + 'T00:00:00Z'), now = new Date(date + 'T00:00:00Z');
    var contiguous = prior && !isNaN(now) && now - prior === 86400000;
    var same = current && current.name === label && current.price === rate && current.nights === nights;
    if (!current || !contiguous || !same) {
      current = { id: 'override-' + seasons.length + '-' + date, name: label, nights: nights, start: date, end: date, price: rate };
      seasons.push(current);
    } else current.end = date;
  });
  return { baseRate: baseRate, seasons: seasons };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { groupOverridesToSeasons: groupOverridesToSeasons };
if (typeof window !== 'undefined') window.CJTSeasonalPricingData = { groupOverridesToSeasons: groupOverridesToSeasons };
