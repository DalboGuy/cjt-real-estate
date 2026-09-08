const CHANNELS = new Set(['all', 'direct', 'airbnb', 'vrbo', 'booking.com', 'houfy']);

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function ceil2(value) {
  return Math.ceil((Number(value) - Number.EPSILON) * 100) / 100;
}

function asRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return number > 1 && number <= 100 ? number / 100 : number;
}

function normalizeChannel(value) {
  const channel = String(value || 'direct').trim().toLowerCase();
  return CHANNELS.has(channel) ? channel : 'direct';
}

function dateSpanDays(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
}

function channelMatches(ruleChannel, requestedChannel) {
  const rule = normalizeChannel(ruleChannel || 'all');
  return rule === 'all' || rule === normalizeChannel(requestedChannel);
}

function inRange(date, start, end) {
  return (!start || date >= start) && (!end || date <= end);
}

function selectOverride(date, overrides = [], channel = 'direct') {
  return overrides
    .filter((rule) => rule && rule.active !== false && channelMatches(rule.channel, channel) && inRange(date, rule.start, rule.end))
    .sort((a, b) => {
      const channelSpecific = Number(normalizeChannel(b.channel) !== 'all') - Number(normalizeChannel(a.channel) !== 'all');
      if (channelSpecific) return channelSpecific;
      const priority = Number(b.priority || 0) - Number(a.priority || 0);
      if (priority) return priority;
      const width = dateSpanDays(a.start, a.end) - dateSpanDays(b.start, b.end);
      if (width) return width;
      return Number(b.id || 0) - Number(a.id || 0);
    })[0] || null;
}

function applyOverrides(nightLines, overrides = [], channel = 'direct') {
  return nightLines.map((line) => {
    const override = selectOverride(line.date, overrides, channel);
    if (!override) return { ...line };
    return {
      ...line,
      baseRate: Number(line.rate),
      rate: round2(override.nightlyRate),
      minNights: override.minNights == null ? line.minNights : Number(override.minNights),
      override: { id: override.id, name: override.name, channel: normalizeChannel(override.channel) }
    };
  });
}

function discountEligible(rule, context) {
  if (!rule || rule.active === false || !channelMatches(rule.channel, context.channel)) return false;
  const nights = context.nightLines.length;
  if (nights < Number(rule.minimumNights || 1)) return false;
  if (rule.maximumNights != null && nights > Number(rule.maximumNights)) return false;
  if (rule.start && context.checkin < rule.start) return false;
  if (rule.end && context.checkout > nextDate(rule.end)) return false;
  const eligible = Array.isArray(rule.eligibleWeekdays) ? rule.eligibleWeekdays.map(Number) : [];
  if (eligible.length && context.nightLines.some((line) => !eligible.includes(new Date(`${line.date}T12:00:00Z`).getUTCDay()))) return false;
  return true;
}

function nextDate(date) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

function discountAmount(rule, lodging) {
  const value = Number(rule.value || 0);
  if (rule.discountType === 'fixed') return round2(Math.min(Math.max(value, 0), lodging));
  // Discount values are stored and displayed as percentage points: 1 means 1%.
  const percentRate = Math.min(Math.max(value / 100, 0), 1);
  return round2(Math.min(lodging * percentRate, lodging));
}

function selectDiscount(discounts = [], context) {
  const lodging = round2(context.nightLines.reduce((sum, line) => sum + Number(line.rate || 0), 0));
  const eligible = discounts
    .filter((rule) => discountEligible(rule, context))
    .map((rule) => ({ rule, amount: discountAmount(rule, lodging) }))
    .sort((a, b) => b.amount - a.amount || Number(b.rule.priority || 0) - Number(a.rule.priority || 0) || Number(a.rule.id || 0) - Number(b.rule.id || 0));
  if (!eligible.length) return null;
  const winner = eligible[0];
  return {
    id: winner.rule.id,
    name: winner.rule.name,
    discountType: winner.rule.discountType,
    value: Number(winner.rule.value),
    amount: winner.amount,
    channel: normalizeChannel(winner.rule.channel),
    stackingPolicy: 'best'
  };
}

function normalizeCostPolicy(policy = {}, nights = 0) {
  const monthlyOperatingCost = Math.max(Number(policy.monthlyOperatingCost || 0), 0);
  const allocatedOperatingCost = round2(monthlyOperatingCost * 12 / 365 * nights);
  const cleaningCost = Math.max(Number(policy.cleaningCost || 0), 0);
  const channelFeeRate = Math.min(Math.max(asRate(policy.channelFeeRate || 0), 0), 0.95);
  const minimumContribution = Math.max(Number(policy.minimumContribution || 0), 0);
  const mode = ['off', 'monitor', 'enforce'].includes(policy.mode) ? policy.mode : 'off';
  return { mode, monthlyOperatingCost, allocatedOperatingCost, cleaningCost, channelFeeRate, minimumContribution };
}

function calculateCostFloor(policy, nights, cleaningFee) {
  const normalized = normalizeCostPolicy(policy, nights);
  const denominator = 1 - normalized.channelFeeRate;
  const requiredLodging = normalized.mode === 'off' ? 0 : ceil2(
    (normalized.allocatedOperatingCost + normalized.cleaningCost + normalized.minimumContribution) / denominator - Number(cleaningFee || 0)
  );
  return { ...normalized, requiredLodging: Math.max(requiredLodging, 0) };
}

function applyPricingPolicy({ nightLines, checkin, checkout, cleaningFee = 0, channel = 'direct', overrides = [], discounts = [], costPolicy = {} }) {
  const normalizedChannel = normalizeChannel(channel);
  const adjustedNightLines = applyOverrides(nightLines, overrides, normalizedChannel);
  const baseLodging = round2(nightLines.reduce((sum, line) => sum + Number(line.rate || 0), 0));
  const overriddenLodging = round2(adjustedNightLines.reduce((sum, line) => sum + Number(line.rate || 0), 0));
  const discount = selectDiscount(discounts, { nightLines: adjustedNightLines, checkin, checkout, channel: normalizedChannel });
  const discountedLodging = round2(Math.max(overriddenLodging - Number(discount?.amount || 0), 0));
  const floor = calculateCostFloor(costPolicy, adjustedNightLines.length, cleaningFee);
  const floorApplied = floor.mode === 'enforce' && discountedLodging < floor.requiredLodging;
  const lodgingSubtotal = floorApplied ? floor.requiredLodging : discountedLodging;
  const channelFee = round2((lodgingSubtotal + Number(cleaningFee || 0)) * floor.channelFeeRate);
  const projectedContribution = round2(lodgingSubtotal + Number(cleaningFee || 0) - channelFee - floor.cleaningCost - floor.allocatedOperatingCost);
  const overrideSummary = adjustedNightLines
    .filter((line) => line.override)
    .reduce((map, line) => {
      const key = String(line.override.id || line.override.name);
      const current = map.get(key) || { ...line.override, nights: 0 };
      current.nights += 1;
      map.set(key, current);
      return map;
    }, new Map());
  return {
    channel: normalizedChannel,
    nightLines: adjustedNightLines,
    baseLodging,
    overriddenLodging,
    discount,
    discountedLodging,
    lodgingSubtotal: round2(lodgingSubtotal),
    overrides: [...overrideSummary.values()],
    costGuard: {
      ...floor,
      atRisk: floor.mode !== 'off' && discountedLodging < floor.requiredLodging,
      applied: floorApplied,
      channelFee,
      projectedContribution
    }
  };
}

module.exports = {
  CHANNELS,
  round2,
  ceil2,
  asRate,
  normalizeChannel,
  channelMatches,
  selectOverride,
  applyOverrides,
  discountEligible,
  selectDiscount,
  normalizeCostPolicy,
  calculateCostFloor,
  applyPricingPolicy
};
