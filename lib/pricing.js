const {
  WEEKEND_DAYS,
  CLEANING_FEE,
  TAX_RATE,
  PRICING_THROUGH,
  MAX_GUESTS,
  SPLIT_PAYMENT_THRESHOLD_DAYS,
  ADVANCE_PAYMENT_PCT,
  SEASONS
} = require('./pricing-defaults');
const {
  round2,
  computeQuoteBreakdown,
  withConsistentQuoteMoney,
  quoteMoneyIsConsistent
} = require('./quote-breakdown');
const { applyPricingPolicy, normalizeChannel } = require('./pricing-engine');

function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));}
function eachDate(checkin,checkout){
  const out=[];
  const start=new Date(`${checkin}T00:00:00Z`),end=new Date(`${checkout}T00:00:00Z`);
  for(let d=start;d<end;d=new Date(d.getTime()+86400000))out.push(d.toISOString().slice(0,10));
  return out;
}
function seasonFor(date,seasons){
  const list=Array.isArray(seasons)?seasons:SEASONS;
  return list.find(s=>date>=s.start&&date<=s.end)||null;
}
function nightlyRate(date,catalog){
  const seasons=catalog?.seasons||SEASONS;
  const weekendDays=catalog?.weekendDays instanceof Set
    ?catalog.weekendDays
    :new Set(catalog?.weekendDays||WEEKEND_DAYS);
  const season=seasonFor(date,seasons);
  if(!season)return null;
  const dow=new Date(`${date}T12:00:00Z`).getUTCDay();
  const weekend=weekendDays.has(dow);
  return {date,season:season.name,rate:weekend?season.weekend:season.weekday,weekend,minNights:season.minNights};
}
function pricingError(code,message,status=422){const e=new Error(message);e.code=code;e.status=status;return e;}
function dateLabel(date){return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});}
function paymentScheduleFor(total,checkin,asOf=new Date(),settings){
  const amount=round2(total);
  const threshold=Number(settings?.splitPaymentThresholdDays??SPLIT_PAYMENT_THRESHOLD_DAYS);
  const advancePct=Number(settings?.advancePaymentPct??ADVANCE_PAYMENT_PCT);
  if(!validDate(checkin))return {mode:'full',depositPct:1,dueAtBooking:amount,remainingBalance:0,splitPaymentThresholdDays:threshold,reason:'missing_checkin'};
  const todayUtc=Date.UTC(asOf.getUTCFullYear(),asOf.getUTCMonth(),asOf.getUTCDate());
  const arrivalUtc=Date.parse(`${checkin}T00:00:00Z`);
  const daysUntilCheckin=Math.ceil((arrivalUtc-todayUtc)/86400000);
  if(daysUntilCheckin>threshold){
    const dueAtBooking=round2(amount*advancePct);
    const remainingBalance=round2(amount-dueAtBooking);
    const dueDate=new Date(arrivalUtc-threshold*86400000).toISOString().slice(0,10);
    return {
      mode:'split',depositPct:advancePct,dueAtBooking,remainingBalance,splitPaymentThresholdDays:threshold,
      balanceDueDate:dueDate,balanceDueDateLabel:dateLabel(dueDate),daysUntilCheckin,
      reason:threshold===30?'more_than_30_days':'more_than_threshold_days'
    };
  }
  return {
    mode:'full',depositPct:1,dueAtBooking:amount,remainingBalance:0,splitPaymentThresholdDays:threshold,
    balanceDueDate:null,balanceDueDateLabel:null,
    daysUntilCheckin,reason:threshold===30?'within_30_days':'within_threshold_days'
  };
}

function quoteStayWithCatalog(catalog,checkin,checkout,guests=1,options={}){
  const settings=catalog||{};
  const cleaningFee=Number(settings.cleaningFee??CLEANING_FEE);
  const taxRate=Number(settings.taxRate??TAX_RATE);
  const maxGuests=Number(settings.maxGuests??MAX_GUESTS);
  const pricingThrough=settings.pricingThrough||PRICING_THROUGH;
  if(!validDate(checkin)||!validDate(checkout)||checkout<=checkin)throw pricingError('invalid_dates','Choose a valid check-in and check-out date.',400);
  const guestCount=Number(guests);
  if(!Number.isInteger(guestCount)||guestCount<1||guestCount>maxGuests)throw pricingError('invalid_guests',`Sand & Sea Manor allows up to ${maxGuests} overnight guests.`,400);
  const nights=eachDate(checkin,checkout);
  if(!nights.length)throw pricingError('invalid_dates','Choose at least one night.',400);
  if(nights.length>90)throw pricingError('stay_too_long','Direct-booking quotes are limited to 90 nights.',400);
  const nightLines=nights.map((date)=>nightlyRate(date,settings));
  if(nightLines.some(v=>!v))throw pricingError('pricing_not_published',`Online pricing is currently published through ${pricingThrough}. Please contact CJT for dates outside the published window.`);
  const channel=normalizeChannel(options.channel||'direct');
  const costPolicy=(settings.costPolicies||[]).find(policy=>normalizeChannel(policy.channel)===channel)||{channel,mode:'off'};
  const policy=applyPricingPolicy({
    nightLines,checkin,checkout,cleaningFee,channel,
    overrides:settings.overrides||[],discounts:settings.discounts||[],costPolicy
  });
  const minimumStayAfterRules=Math.max(...policy.nightLines.map(n=>n.minNights));
  if(nights.length<minimumStayAfterRules)throw pricingError('minimum_stay',`These dates require a minimum stay of ${minimumStayAfterRules} nights.`);
  const beforeAdjustments=computeQuoteBreakdown({nightLines:policy.nightLines,cleaningFee,taxRate});
  const breakdown=computeQuoteBreakdown({
    lodgingSubtotal:policy.lodgingSubtotal,cleaningFee,taxRate,nights:nights.length,
    priceLines:beforeAdjustments.priceLines,scaleToLodging:true
  });
  const quote={
    currency:'USD',checkin,checkout,guests:guestCount,minimumStay:minimumStayAfterRules,pricingThrough,channel,
    ...breakdown,
    pricingAdjustments:{
      overrides:policy.overrides,
      discount:policy.discount,
      baseLodging:policy.baseLodging,
      overriddenLodging:policy.overriddenLodging,
      discountedLodging:policy.discountedLodging
    },
    paymentSchedule:paymentScheduleFor(breakdown.total,checkin,new Date(),settings),
    quoteVersion:'pricing-engine-v1',quotedAt:new Date().toISOString()
  };
  if(options.includeInternal)quote.costGuard=policy.costGuard;
  return quote;
}

async function quoteStay(checkin,checkout,guests=1,catalog){
  const {loadPricingCatalog}=require('./pricing-store');
  const pricing=catalog||await loadPricingCatalog();
  return quoteStayWithCatalog(pricing,checkin,checkout,guests);
}


function isModernQuote(q){
  return q && (q.lodgingSubtotal!=null || q.quoteVersion==='seasonal-v2' || q.quoteVersion==='owner-adjusted-v2' || Array.isArray(q.priceLines));
}
function legacyPriceLines(q){
  const nights=Array.isArray(q.nightly)?q.nightly:[];
  if(nights.length){
    const groups=[];
    for(const n of nights){
      const rate=Number(n.rate||0);
      const season=n.label||(n.source==='weekend'?'Weekend':'Weekday');
      const key=`${season}|${rate}`;
      let g=groups.find(x=>x.key===key);
      if(!g){g={key,season,nightlyRate:rate,nights:0,subtotal:0};groups.push(g);}
      g.nights+=1;g.subtotal=round2(g.subtotal+rate);
    }
    return groups.map(({key,...g})=>g);
  }
  const lodging=Number(q.lodgingAfterDiscount??q.nightlySubtotal??0);
  const count=Number(q.nights||1)||1;
  return [{season:q.discountName||'Legacy rate',nightlyRate:round2(lodging/count),nights:count,subtotal:round2(lodging)}];
}
/** Normalize stored Direct Booking quotes onto the seasonal-v2 money fields. Derived tax, total, ANR, and priceLines come from the shared breakdown helper. Returns null for missing quote. */
function normalizeOwnerQuote(quote){
  if(quote==null)return null;
  const q=typeof quote==='object'?quote:null;
  if(!q)return null;
  if(isModernQuote(q) && q.lodgingSubtotal!=null){
    const taxRate=q.taxRate!=null?Number(q.taxRate):(q.taxPct!=null?Number(q.taxPct)/100:TAX_RATE);
    const cleaningFee=Number(q.cleaningFee??CLEANING_FEE);
    return withConsistentQuoteMoney({
      ...q,
      taxRate,
      cleaningFee,
      lodgingSubtotal:Number(q.lodgingSubtotal),
      nights:Number(q.nights||0) || undefined,
      priceLines:Array.isArray(q.priceLines)?q.priceLines:[]
    });
  }
  // Legacy shape: nightlySubtotal / lodgingAfterDiscount / taxPct / nightly[]
  if(q.nightlySubtotal==null && q.lodgingAfterDiscount==null && !Array.isArray(q.nightly) && q.taxPct==null){
    // Unknown / empty object — leave as-is so UI can still show "No stored quote" only when null
    return q;
  }
  const lodgingSubtotal=round2(Number(q.lodgingAfterDiscount??q.nightlySubtotal??0));
  const cleaningFee=round2(Number(q.cleaningFee??CLEANING_FEE));
  const taxRate=q.taxRate!=null?Number(q.taxRate):(q.taxPct!=null?Number(q.taxPct)/100:TAX_RATE);
  const nights=Number(q.nights||(Array.isArray(q.nightly)?q.nightly.length:0)||0);
  const priceLines=legacyPriceLines(q);
  const breakdown=computeQuoteBreakdown({lodgingSubtotal,cleaningFee,taxRate,nights,priceLines,scaleToLodging:true});
  let paymentSchedule=q.paymentSchedule||null;
  if(!paymentSchedule && q.depositDue!=null){
    const dueAtBooking=round2(Number(q.depositDue));
    const remainingBalance=round2(Math.max(breakdown.total-dueAtBooking,0));
    paymentSchedule={
      mode:remainingBalance>0?'split':'full',
      depositPct:q.depositPct!=null?Number(q.depositPct)/100:null,
      dueAtBooking,
      remainingBalance,
      reason:'legacy_deposit'
    };
  }else if(!paymentSchedule && q.checkin){
    paymentSchedule=paymentScheduleFor(breakdown.total,q.checkin);
  }
  return {
    ...q,
    currency:q.currency||'USD',
    minimumStay:q.minimumStay??q.minNights??undefined,
    ...breakdown,
    nights:breakdown.nights||undefined,
    paymentSchedule,
    quoteVersion:q.quoteVersion||'legacy-normalized-v1',
    legacy:true,
    normalizedFrom:'legacy-direct-quote'
  };
}

function stayNightCount(base,stay={}){
  const fromQuote=Number(base.nights||0);
  if(fromQuote>0) return fromQuote;
  const checkin=stay.checkin||base.checkin;
  const checkout=stay.checkout||base.checkout;
  if(validDate(checkin)&&validDate(checkout)&&checkout>checkin) return eachDate(checkin,checkout).length;
  const fromLines=(Array.isArray(base.priceLines)?base.priceLines:[]).reduce((sum,line)=>sum+Number(line.nights||0),0);
  return fromLines||0;
}

async function ownerAdjustedQuote(existing,lodgingSubtotal,stay={}){
  const base=normalizeOwnerQuote(existing)||{};
  const amount=Number(lodgingSubtotal);
  if(!Number.isFinite(amount)||amount<=0)throw pricingError('invalid_quote','Enter a valid lodging subtotal.',400);
  const nights=stayNightCount(base,stay);
  if(!nights)throw pricingError('invalid_quote','Cannot adjust a quote without a night count.',400);
  const cleaningFee=Number(base.cleaningFee??CLEANING_FEE);
  const taxRate=Number(base.taxRate??TAX_RATE);
  const breakdown=computeQuoteBreakdown({
    lodgingSubtotal:amount,cleaningFee,taxRate,nights,
    priceLines:base.priceLines,scaleToLodging:true
  });
  let settings;
  try{
    const {loadPricingCatalog}=require('./pricing-store');
    settings=await loadPricingCatalog();
  }catch(_){
    settings=undefined;
  }
  return {
    ...base,
    checkin:base.checkin||stay.checkin,
    checkout:base.checkout||stay.checkout,
    guests:base.guests??stay.guests,
    baseLodgingSubtotal:Number(base.baseLodgingSubtotal??base.lodgingSubtotal??amount),
    ...breakdown,
    paymentSchedule:paymentScheduleFor(breakdown.total,base.checkin||stay.checkin,new Date(),settings),
    ownerAdjusted:true,quoteVersion:'owner-adjusted-v2',quotedAt:new Date().toISOString(),
    legacy:false
  };
}

module.exports={WEEKEND_DAYS,SEASONS,CLEANING_FEE,TAX_RATE,PRICING_THROUGH,MAX_GUESTS,SPLIT_PAYMENT_THRESHOLD_DAYS,ADVANCE_PAYMENT_PCT,eachDate,quoteStay,quoteStayWithCatalog,ownerAdjustedQuote,paymentScheduleFor,normalizeOwnerQuote,computeQuoteBreakdown,withConsistentQuoteMoney,quoteMoneyIsConsistent};
