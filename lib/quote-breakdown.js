function round2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

function countPriceLineNights(priceLines) {
  return (Array.isArray(priceLines) ? priceLines : []).reduce((sum, line) => sum + Number(line?.nights || 0), 0);
}

function sumPriceLines(priceLines) {
  return round2((Array.isArray(priceLines) ? priceLines : []).reduce((sum, line) => sum + Number(line?.subtotal || 0), 0));
}

function moneyParts({ lodgingSubtotal, cleaningFee, taxRate }) {
  const lodging = round2(lodgingSubtotal);
  const cleaning = round2(cleaningFee);
  const rate = Number(taxRate);
  const taxes = round2((lodging + cleaning) * rate);
  const total = round2(lodging + cleaning + taxes);
  return { lodgingSubtotal: lodging, cleaningFee: cleaning, taxRate: rate, taxes, total };
}

function averageNightlyRate(lodgingSubtotal, nights) {
  const count = Number(nights) || 0;
  if (count <= 0) return round2(lodgingSubtotal);
  return round2(Number(lodgingSubtotal) / count);
}

function groupNightLines(nightLines) {
  const groups = [];
  for (const line of nightLines || []) {
    const rate = round2(line.rate);
    const season = line.season || 'Nightly';
    const key = `${season}|${rate}`;
    let group = groups.find((row) => row.key === key);
    if (!group) {
      group = { key, season, nightlyRate: rate, nights: 0, subtotal: 0 };
      groups.push(group);
    }
    group.nights += 1;
    group.subtotal = round2(group.subtotal + rate);
  }
  return groups.map(({ key, ...group }) => group);
}

function ownerAdjustedLine(lodgingSubtotal, nights, season = 'Owner adjusted') {
  const lodging = round2(lodgingSubtotal);
  const count = Number(nights) || 0;
  if (count <= 0) return [];
  return [{
    season,
    nightlyRate: averageNightlyRate(lodging, count),
    nights: count,
    subtotal: lodging
  }];
}

function scalePriceLines(priceLines, lodgingSubtotal, nights) {
  const lodging = round2(lodgingSubtotal);
  const nightCount = Number(nights) || countPriceLineNights(priceLines);
  const source = (Array.isArray(priceLines) ? priceLines : [])
    .map((line) => ({
      season: line.season || 'Owner adjusted',
      nights: Number(line.nights) || 0,
      subtotal: round2(Number(line.subtotal != null
        ? line.subtotal
        : Number(line.nightlyRate || 0) * Number(line.nights || 0)))
    }))
    .filter((line) => line.nights > 0);
  const sourceNights = source.reduce((sum, line) => sum + line.nights, 0);
  const oldSum = sumPriceLines(source);

  if (nightCount <= 0) return [];
  if (!source.length || oldSum <= 0 || (sourceNights && sourceNights !== nightCount)) {
    return ownerAdjustedLine(lodging, nightCount);
  }

  const scaled = [];
  let allocated = 0;
  for (let i = 0; i < source.length; i += 1) {
    const last = i === source.length - 1;
    const subtotal = last ? round2(lodging - allocated) : round2(lodging * (source[i].subtotal / oldSum));
    scaled.push({
      season: source[i].season,
      nights: source[i].nights,
      nightlyRate: round2(subtotal / source[i].nights),
      subtotal
    });
    allocated = round2(allocated + subtotal);
  }
  return scaled;
}

function reconcilePriceLines(priceLines, lodgingSubtotal, nights) {
  const lodging = round2(lodgingSubtotal);
  const lines = Array.isArray(priceLines) ? priceLines : [];
  if (lines.length && Math.abs(sumPriceLines(lines) - lodging) < 0.005) {
    return lines.map((line) => {
      const nightsN = Number(line.nights) || 0;
      const subtotal = round2(Number(line.subtotal));
      return {
        season: line.season || 'Nightly',
        nights: nightsN,
        nightlyRate: nightsN ? round2(Number(line.nightlyRate != null ? line.nightlyRate : subtotal / nightsN)) : round2(Number(line.nightlyRate || 0)),
        subtotal
      };
    });
  }
  return scalePriceLines(lines, lodging, nights);
}

function computeQuoteBreakdown(input = {}) {
  const nightLines = Array.isArray(input.nightLines) ? input.nightLines : null;
  const groupedFromNights = nightLines && nightLines.length && !input.scaleToLodging
    ? groupNightLines(nightLines)
    : null;
  const nights = Number(input.nights)
    || (nightLines && nightLines.length)
    || countPriceLineNights(input.priceLines)
    || 0;
  const lodgingSubtotal = input.lodgingSubtotal != null
    ? input.lodgingSubtotal
    : (groupedFromNights ? sumPriceLines(groupedFromNights) : 0);
  const money = moneyParts({
    lodgingSubtotal,
    cleaningFee: input.cleaningFee,
    taxRate: input.taxRate
  });
  const priceLines = groupedFromNights
    ? groupedFromNights
    : reconcilePriceLines(input.priceLines, money.lodgingSubtotal, nights);
  return {
    ...money,
    nights,
    averageNightly: averageNightlyRate(money.lodgingSubtotal, nights),
    priceLines
  };
}

function withConsistentQuoteMoney(quote, extras = {}) {
  if (!quote || typeof quote !== 'object') return quote;
  const input = { ...quote, ...extras };
  const hasLodging = input.lodgingSubtotal != null
    || (Array.isArray(input.nightLines) && input.nightLines.length)
    || (Array.isArray(input.priceLines) && input.priceLines.length);
  if (!hasLodging && input.scaleToLodging !== true) return quote;
  const breakdown = computeQuoteBreakdown(input);
  return { ...quote, ...breakdown };
}

function quoteMoneyIsConsistent(quote) {
  if (!quote || typeof quote !== 'object') return false;
  const expected = computeQuoteBreakdown(quote);
  return expected.lodgingSubtotal === round2(quote.lodgingSubtotal)
    && expected.cleaningFee === round2(quote.cleaningFee)
    && expected.taxes === round2(quote.taxes)
    && expected.total === round2(quote.total)
    && expected.averageNightly === round2(quote.averageNightly)
    && expected.nights === Number(quote.nights)
    && sumPriceLines(quote.priceLines) === expected.lodgingSubtotal;
}

module.exports = {
  round2,
  moneyParts,
  averageNightlyRate,
  groupNightLines,
  scalePriceLines,
  reconcilePriceLines,
  computeQuoteBreakdown,
  withConsistentQuoteMoney,
  quoteMoneyIsConsistent,
  sumPriceLines,
  countPriceLineNights
};
