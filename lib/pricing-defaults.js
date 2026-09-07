// Seed / fallback values only. After the first successful Neon seed, the
// Owner Portal (/owner-v1/pricing) is the write path. Do not treat this file
// as the live rate card.

const WEEKEND_DAYS = new Set([5, 6]); // Friday/Saturday
const CLEANING_FEE = 240;
const TAX_RATE = 0.15;
const PRICING_THROUGH = '2027-08-15';
const MAX_GUESTS = 14;
const SPLIT_PAYMENT_THRESHOLD_DAYS = 30;
const ADVANCE_PAYMENT_PCT = 0.50;
const DEFAULT_PROPERTY = 'Sand & Sea Manor';
const SETTINGS_ID = 'default';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SEASONS = [
  ['Non-Peak 1', '2026-09-05', '2026-10-16', 529, 655, 2],
  ['ARToberFEST', '2026-10-17', '2026-10-18', 655, 655, 2],
  ['Non-Peak 2', '2026-10-19', '2026-10-22', 529, 655, 2],
  ['Island Oktoberfest', '2026-10-23', '2026-10-24', 680, 680, 2],
  ['Non-Peak 3', '2026-10-25', '2026-11-04', 529, 655, 2],
  ['Lone Star Rally', '2026-11-05', '2026-11-08', 865, 865, 3],
  ['Non-Peak 4', '2026-11-09', '2026-11-24', 529, 655, 2],
  ['Thanksgiving Holiday', '2026-11-25', '2026-11-29', 685, 685, 3],
  ['Non-Peak 5', '2026-11-30', '2026-12-03', 529, 655, 2],
  ['Dickens on The Strand', '2026-12-04', '2026-12-06', 810, 810, 2],
  ['Non-Peak 6', '2026-12-07', '2026-12-22', 529, 655, 2],
  ['Christmas / New Year', '2026-12-23', '2027-01-03', 635, 635, 3],
  ['Non-Peak 7', '2027-01-04', '2027-01-14', 529, 655, 2],
  ["Art Week + Yaga's Chili Quest", '2027-01-15', '2027-01-16', 680, 680, 2],
  ['Non-Peak 8', '2027-01-17', '2027-01-28', 529, 655, 2],
  ['Mardi Gras - First Weekend', '2027-01-29', '2027-01-31', 815, 815, 3],
  ['Non-Peak 9', '2027-02-01', '2027-02-04', 529, 655, 2],
  ['Mardi Gras - Second Weekend', '2027-02-05', '2027-02-07', 920, 920, 3],
  ['Non-Peak 10', '2027-02-08', '2027-02-08', 529, 655, 2],
  ['Mardi Gras - Fat Tuesday', '2027-02-09', '2027-02-09', 705, 705, 2],
  ['Non-Peak 11', '2027-02-10', '2027-03-05', 529, 655, 2],
  ['Texas Spring Break', '2027-03-06', '2027-03-21', 610, 740, 3],
  ['Non-Peak 12', '2027-03-22', '2027-03-25', 529, 655, 2],
  ['Easter / Spring Holiday', '2027-03-26', '2027-03-29', 740, 740, 3],
  ['Non-Peak 13', '2027-03-30', '2027-04-14', 529, 655, 2],
  ['Galveston FeatherFest', '2027-04-15', '2027-04-18', 660, 660, 3],
  ['Non-Peak 14', '2027-04-19', '2027-04-30', 529, 655, 2],
  ['Historic Homes Tour - Weekend 1', '2027-05-01', '2027-05-02', 810, 810, 2],
  ['Non-Peak 15', '2027-05-03', '2027-05-07', 529, 655, 2],
  ['Historic Homes Tour - Weekend 2', '2027-05-08', '2027-05-09', 810, 810, 2],
  ['Non-Peak 16', '2027-05-10', '2027-05-27', 529, 655, 2],
  ['Memorial Day Weekend', '2027-05-28', '2027-05-31', 865, 865, 3],
  ['Early Summer Peak 1', '2027-06-01', '2027-06-03', 635, 765, 3],
  ['Galveston Island Revue Weekend', '2027-06-04', '2027-06-05', 860, 860, 2],
  ['Early Summer Peak 2', '2027-06-06', '2027-06-17', 635, 765, 3],
  ['Juneteenth Peak Weekend', '2027-06-18', '2027-06-20', 840, 840, 3],
  ['Core Summer Peak 1', '2027-06-21', '2027-07-01', 660, 815, 3],
  ['July 4th Festivities', '2027-07-02', '2027-07-05', 975, 975, 4],
  ['Core Summer Peak 2', '2027-07-06', '2027-07-31', 660, 815, 3],
  ['Late Summer Peak', '2027-08-01', '2027-08-15', 610, 740, 3]
].map(([name, start, end, weekday, weekend, minNights], index) => ({
  name, start, end, weekday, weekend, minNights, sortOrder: index
}));

function defaultSettings() {
  return {
    id: SETTINGS_ID,
    property: DEFAULT_PROPERTY,
    cleaningFee: CLEANING_FEE,
    taxRate: TAX_RATE,
    maxGuests: MAX_GUESTS,
    pricingThrough: PRICING_THROUGH,
    weekendDays: [5, 6],
    advancePaymentPct: ADVANCE_PAYMENT_PCT,
    splitPaymentThresholdDays: SPLIT_PAYMENT_THRESHOLD_DAYS
  };
}

function defaultCatalog() {
  return {
    ...defaultSettings(),
    seasons: SEASONS.map((season) => ({ ...season })),
    source: 'fallback'
  };
}

module.exports = {
  WEEKEND_DAYS,
  CLEANING_FEE,
  TAX_RATE,
  PRICING_THROUGH,
  MAX_GUESTS,
  SPLIT_PAYMENT_THRESHOLD_DAYS,
  ADVANCE_PAYMENT_PCT,
  DEFAULT_PROPERTY,
  SETTINGS_ID,
  WEEKDAY_NAMES,
  SEASONS,
  defaultSettings,
  defaultCatalog
};
