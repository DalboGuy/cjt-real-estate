const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'booking-v2.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/booking-v2.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets/js/booking-listing.js'), 'utf8');

function requireText(source, value, label) {
  if (!source.includes(value)) throw new Error(`Missing ${label}: ${value}`);
}

[
  ['data-progress="stay"', 'Stay progress stage'],
  ['data-progress="info"', 'Your info progress stage'],
  ['data-progress="review"', 'Review progress stage'],
  ['data-progress="done"', 'Received progress stage'],
  ['guest-step-section', 'guest information hierarchy'],
  ["Tawk_API.minimize", 'initial support-widget minimization']
].forEach(([value, label]) => requireText(html, value, label));

[
  ['grid-template-columns:repeat(4,minmax(0,1fr))', 'four-stage progress layout'],
  ['.v2-mosaic .gallery-item img{opacity:1;filter:none}', 'fully opaque opening photography'],
  ['scroll-margin-top:112px', 'sticky-header navigation offset']
].forEach(([value, label]) => requireText(css, value, label));

requireText(js, "const map={stay:hasDates,quote:hasQuote,request:false}", 'three-stage listing flow state');
requireText(js, "const order=['stay','info','review','done']", 'four-stage modal state');
requireText(js, "setAttribute('aria-current','step')", 'current-step accessibility state');

if (/data-progress="(dates|guests|quote)"/.test(html)) {
  throw new Error('Implementation-only progress stages are still visible in the guest modal.');
}

console.log('Booking page visual contract verified.');
