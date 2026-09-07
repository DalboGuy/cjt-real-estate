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

function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));}
function round2(v){return Math.round((Number(v)+Number.EPSILON)*100)/100;}
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
  if(!validDate(checkin))return {mode:'full',dueAtBooking:amount,remainingBalance:0,reason:'missing_checkin'};
  const todayUtc=Date.UTC(asOf.getUTCFullYear(),asOf.getUTCMonth(),asOf.getUTCDate());
  const arrivalUtc=Date.parse(`${checkin}T00:00:00Z`);
  const daysUntilCheckin=Math.ceil((arrivalUtc-todayUtc)/86400000);
  if(daysUntilCheckin>threshold){
    const dueAtBooking=round2(amount*advancePct);
    const remainingBalance=round2(amount-dueAtBooking);
    const dueDate=new Date(arrivalUtc-threshold*86400000).toISOString().slice(0,10);
    return {
      mode:'split',depositPct:advancePct,dueAtBooking,remainingBalance,
      balanceDueDate:dueDate,balanceDueDateLabel:dateLabel(dueDate),daysUntilCheckin,
      reason:threshold===30?'more_than_30_days':'more_than_threshold_days'
    };
  }
  return {
    mode:'full',depositPct:1,dueAtBooking:amount,remainingBalance:0,balanceDueDate:null,balanceDueDateLabel:null,
    daysUntilCheckin,reason:threshold===30?'within_30_days':'within_threshold_days'
  };
}

function quoteStayWithCatalog(catalog,checkin,checkout,guests=1){
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
  const minimumStay=Math.max(...nightLines.map(n=>n.minNights));
  if(nights.length<minimumStay)throw pricingError('minimum_stay',`These dates require a minimum stay of ${minimumStay} nights.`);
  const lodgingSubtotal=round2(nightLines.reduce((sum,n)=>sum+n.rate,0));
  const taxes=round2((lodgingSubtotal+cleaningFee)*taxRate);
  const total=round2(lodgingSubtotal+cleaningFee+taxes);
  const groups=[];
  for(const line of nightLines){
    const key=`${line.season}|${line.rate}`;
    let g=groups.find(x=>x.key===key);
    if(!g){g={key,season:line.season,nightlyRate:line.rate,nights:0,subtotal:0};groups.push(g);}
    g.nights+=1;g.subtotal=round2(g.subtotal+line.rate);
  }
  return {
    currency:'USD',checkin,checkout,guests:guestCount,nights:nights.length,minimumStay,
    lodgingSubtotal,cleaningFee,taxRate,taxes,total,
    averageNightly:round2(lodgingSubtotal/nights.length),
    priceLines:groups.map(({key,...g})=>g),pricingThrough,
    paymentSchedule:paymentScheduleFor(total,checkin,new Date(),settings),
    quoteVersion:'seasonal-v2',quotedAt:new Date().toISOString()
  };
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
/** Normalize stored Direct Booking quotes for owner UI (legacy → seasonal-v2 field names). Pass-through when already modern. Returns null for missing quote. */
function normalizeOwnerQuote(quote){
  if(quote==null)return null;
  const q=typeof quote==='object'?quote:null;
  if(!q)return null;
  if(isModernQuote(q) && q.lodgingSubtotal!=null){
    return {
      ...q,
      taxRate:q.taxRate!=null?Number(q.taxRate):(q.taxPct!=null?Number(q.taxPct)/100:TAX_RATE),
      cleaningFee:Number(q.cleaningFee??CLEANING_FEE),
      taxes:Number(q.taxes??0),
      total:Number(q.total??0),
      lodgingSubtotal:Number(q.lodgingSubtotal),
      priceLines:Array.isArray(q.priceLines)?q.priceLines:[],
      averageNightly:q.averageNightly!=null?Number(q.averageNightly):round2(Number(q.lodgingSubtotal)/Math.max(Number(q.nights||1),1))
    };
  }
  // Legacy shape: nightlySubtotal / lodgingAfterDiscount / taxPct / nightly[]
  if(q.nightlySubtotal==null && q.lodgingAfterDiscount==null && !Array.isArray(q.nightly) && q.taxPct==null){
    // Unknown / empty object — leave as-is so UI can still show "No stored quote" only when null
    return q;
  }
  const lodgingSubtotal=round2(Number(q.lodgingAfterDiscount??q.nightlySubtotal??0));
  const cleaningFee=round2(Number(q.cleaningFee??CLEANING_FEE));
  const taxRate=q.taxRate!=null?Number(q.taxRate):(q.taxPct!=null?Number(q.taxPct)/100:TAX_RATE);
  const taxes=q.taxes!=null?round2(Number(q.taxes)):round2((lodgingSubtotal+cleaningFee)*taxRate);
  const total=q.total!=null?round2(Number(q.total)):round2(lodgingSubtotal+cleaningFee+taxes);
  const nights=Number(q.nights||(Array.isArray(q.nightly)?q.nightly.length:0)||0);
  const priceLines=legacyPriceLines(q);
  let paymentSchedule=q.paymentSchedule||null;
  if(!paymentSchedule && q.depositDue!=null){
    const dueAtBooking=round2(Number(q.depositDue));
    const remainingBalance=round2(Math.max(total-dueAtBooking,0));
    paymentSchedule={
      mode:remainingBalance>0?'split':'full',
      depositPct:q.depositPct!=null?Number(q.depositPct)/100:null,
      dueAtBooking,
      remainingBalance,
      reason:'legacy_deposit'
    };
  }else if(!paymentSchedule && q.checkin){
    paymentSchedule=paymentScheduleFor(total,q.checkin);
  }
  return {
    ...q,
    currency:q.currency||'USD',
    nights:nights||undefined,
    minimumStay:q.minimumStay??q.minNights??undefined,
    lodgingSubtotal,
    cleaningFee,
    taxRate,
    taxes,
    total,
    averageNightly:nights?round2(lodgingSubtotal/nights):round2(lodgingSubtotal),
    priceLines,
    paymentSchedule,
    quoteVersion:q.quoteVersion||'legacy-normalized-v1',
    legacy:true,
    normalizedFrom:'legacy-direct-quote'
  };
}

async function ownerAdjustedQuote(existing,lodgingSubtotal){
  const base=normalizeOwnerQuote(existing)||{};
  const amount=Number(lodgingSubtotal);
  if(!Number.isFinite(amount)||amount<=0)throw pricingError('invalid_quote','Enter a valid lodging subtotal.',400);
  const cleaningFee=Number(base.cleaningFee??CLEANING_FEE);
  const taxRate=Number(base.taxRate??TAX_RATE);
  const taxes=round2((amount+cleaningFee)*taxRate);
  const total=round2(amount+cleaningFee+taxes);
  let settings;
  try{
    const {loadPricingCatalog}=require('./pricing-store');
    settings=await loadPricingCatalog();
  }catch(_){
    settings=undefined;
  }
  return {
    ...base,
    baseLodgingSubtotal:Number(base.baseLodgingSubtotal??base.lodgingSubtotal??amount),
    lodgingSubtotal:round2(amount),cleaningFee:round2(cleaningFee),taxRate,
    taxes,total,paymentSchedule:paymentScheduleFor(total,base.checkin,new Date(),settings),
    ownerAdjusted:true,quoteVersion:'owner-adjusted-v2',quotedAt:new Date().toISOString(),
    legacy:false
  };
}

module.exports={WEEKEND_DAYS,SEASONS,CLEANING_FEE,TAX_RATE,PRICING_THROUGH,MAX_GUESTS,SPLIT_PAYMENT_THRESHOLD_DAYS,ADVANCE_PAYMENT_PCT,eachDate,quoteStay,quoteStayWithCatalog,ownerAdjustedQuote,paymentScheduleFor,normalizeOwnerQuote};
