const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'owner-v1/pricing.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'assets/js/pricing-v1.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api/pricing.js'), 'utf8');
const quote = fs.readFileSync(path.join(root, 'lib/pricing.js'), 'utf8');

function includes(source, value, label) {
  if (!source.includes(value)) throw new Error(`Missing ${label}: ${value}`);
}

[
  ['id="discountForm"', 'discount editor'],
  ['id="overrideForm"', 'override editor'],
  ['id="costPolicyForm"', 'cost-floor editor'],
  ['id="pricingCsv"', 'CSV file input'],
  ['id="confirmImport"', 'explicit import confirmation'],
  ['id="quoteChannel"', 'host-site quote selector']
].forEach(([value, label]) => includes(html, value, label));

[
  ["action:'save_discount'", 'discount save action'],
  ["action:'save_override'", 'override save action'],
  ["action:'save_cost_policy'", 'cost policy save action'],
  ["action:'preview_import'", 'import preview action'],
  ["action:'commit_import'", 'import commit action'],
  ["'Discount saved and verified.'", 'save verification feedback']
].forEach(([value, label]) => includes(client, value, label));

['save_discount', 'save_override', 'save_cost_policy', 'preview_import', 'commit_import', 'preview_quote']
  .forEach((action) => includes(api, `action==='${action}'`, `${action} API route`));

includes(quote, 'if(options.includeInternal)quote.costGuard=policy.costGuard', 'protected internal floor diagnostics');
if (/quote\.costGuard\s*=/.test(quote.replace('if(options.includeInternal)quote.costGuard=policy.costGuard', ''))) {
  throw new Error('Cost guard appears to be exposed outside the protected includeInternal path.');
}

console.log('Pricing engine UI/API protection contract verified.');
