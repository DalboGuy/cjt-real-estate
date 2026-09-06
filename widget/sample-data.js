/* Explicitly non-live demo data from the original Seasonal Pricing screenshot. */
(function (root) {
  'use strict';
  root.CJTSeasonalPricingSample = {
    /* badge is read by seasonal-pricing.js when sampleData is true */
    badge: 'Sample data — not live pricing', baseRate: 249,
    seasons: [
      { id: 'sample-november-value', name: 'November Value', nights: 2, start: '2025-11-01', end: '2025-11-30', price: 199, note: 'Illustrative screenshot period' },
      { id: 'sample-holiday-glow', name: 'Holiday Glow', nights: 3, start: '2025-12-01', end: '2025-12-22', price: 279, note: 'Illustrative screenshot period' },
      { id: 'sample-holiday-peak', name: 'Holiday Peak', nights: 4, start: '2025-12-23', end: '2026-01-03', price: 329, note: 'Illustrative screenshot period' },
      { id: 'sample-winter-value', name: 'Winter Value', nights: 2, start: '2026-01-04', end: '2026-02-28', price: 219, note: 'Illustrative screenshot period' }
    ]
  };
}(window));
