const { db, ensureSchema } = require('./db');
const { eachDate } = require('./availability');

const CONFIRMED_BOOKING_FEES={configured:true,cleaning_fee:240,tax_pct:15,taxable_cleaning:true,deposit_pct:35};

function round2(v){return Math.round((Number(v)+Number.EPSILON)*100)/100;}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));}
function pct(v){const n=Number(v);return Number.isFinite(n)?Math.min(100,Math.max(0,n)):0;}
function num(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback;}
function bookingFees(value){
  const f=value||{};
  const legacyPlaceholder=f.saved_by_owner!==true&&f.configured!==true&&num(f.cleaning_fee,0)===0&&num(f.deposit_pct,0)===0;
  return legacyPlaceholder?{...f,...CONFIRMED_BOOKING_FEES}:f;
}

function bestDiscount(nights,dates,config){
  const candidates=[];
  const mid=config.midweek_offer||{};
  const long=config.long_stay_offer||{};
  const allMidweek=dates.every(d=>{const day=new Date(`${d}T00:00:00Z`).getUTCDay();return day!==5&&day!==6;});
  if(mid.enabled&&allMidweek&&nights>=num(mid.min_nights,2)&&pct(mid.discount_pct)>0){
    candidates.push({name:'Sunday–Thursday direct-booking offer',pct:pct(mid.discount_pct)});
  }
  if(long.enabled){
    if(nights>=28&&pct(long.twentyeight_night_pct)>0)candidates.push({name:'28+ night direct-booking offer',pct:pct(long.twentyeight_night_pct)});
    else if(nights>=14&&pct(long.fourteen_night_pct)>0)candidates.push({name:'14+ night direct-booking offer',pct:pct(long.fourteen_night_pct)});
    else if(nights>=7&&pct(long.seven_night_pct)>0)candidates.push({name:'7+ night direct-booking offer',pct:pct(long.seven_night_pct)});
  }
  return candidates.sort((a,b)=>b.pct-a.pct)[0]||{name:null,pct:0};
}

async function calculateQuote(checkin,checkout){
  if(!validDate(checkin)||!validDate(checkout)||checkout<=checkin){
    const e=new Error('invalid_dates');e.code='invalid_dates';throw e;
  }
  await ensureSchema();
  const dates=eachDate(checkin,checkout);
  if(!dates.length||dates.length>60){const e=new Error('invalid_stay_length');e.code='invalid_stay_length';throw e;}
  const sql=db();
  const [configRows,overrideRows]=await Promise.all([
    sql`SELECT key,value FROM site_config WHERE key IN ('pricing_rules','midweek_offer','long_stay_offer','booking_fees')`,
    sql`SELECT stay_date::text,nightly_rate::float8,min_nights,label FROM pricing_overrides WHERE stay_date>=${checkin}::date AND stay_date<${checkout}::date ORDER BY stay_date`
  ]);
  const config=Object.fromEntries(configRows.map(r=>[r.key,r.value||{}]));
  const rules=config.pricing_rules||{};
  const overrides=new Map(overrideRows.map(r=>[r.stay_date,r]));
  const weekendDays=Array.isArray(rules.weekend_days)?rules.weekend_days.map(Number):[5,6];
  const weekdayRate=num(rules.weekday_rate,0),weekendRate=num(rules.weekend_rate,0),referenceAdr=num(rules.reference_adr,0);
  const defaultMin=Math.max(1,Math.round(num(rules.default_min_nights,2)));
  let pricingConfigured=true,minNights=defaultMin;
  const nightly=dates.map(date=>{
    const ov=overrides.get(date);
    const day=new Date(`${date}T00:00:00Z`).getUTCDay();
    let rate,source,label=null;
    if(ov){rate=num(ov.nightly_rate,0);source='override';label=ov.label||null;if(ov.min_nights)minNights=Math.max(minNights,Number(ov.min_nights));}
    else{
      const base=weekendDays.includes(day)?weekendRate:weekdayRate;
      if(base>0){rate=base;source=weekendDays.includes(day)?'weekend':'weekday';}
      else{rate=referenceAdr;source='reference';pricingConfigured=false;}
    }
    if(rate<=0)pricingConfigured=false;
    return {date,rate:round2(rate),source,label};
  });
  if(dates.length<minNights){const e=new Error(`This stay requires at least ${minNights} nights.`);e.code='minimum_nights';e.minNights=minNights;throw e;}
  const nightlySubtotal=round2(nightly.reduce((a,x)=>a+x.rate,0));
  const discount=bestDiscount(dates.length,dates,config);
  const discountAmount=round2(nightlySubtotal*(discount.pct/100));
  const lodgingAfterDiscount=round2(nightlySubtotal-discountAmount);
  const fees=bookingFees(config.booking_fees);
  const feesConfigured=fees.configured===true;
  const cleaningFee=feesConfigured?round2(Math.max(0,num(fees.cleaning_fee,0))):null;
  const taxPct=feesConfigured?pct(fees.tax_pct):null;
  const taxableCleaning=feesConfigured&&fees.taxable_cleaning===true;
  const taxBase=feesConfigured?lodgingAfterDiscount+(taxableCleaning?cleaningFee:0):null;
  const taxes=feesConfigured?round2(taxBase*(taxPct/100)):null;
  const total=(pricingConfigured&&feesConfigured)?round2(lodgingAfterDiscount+cleaningFee+taxes):null;
  const depositPct=feesConfigured?pct(fees.deposit_pct):null;
  const depositDue=total!==null&&depositPct>0?round2(total*(depositPct/100)):null;
  return {
    currency:'USD',checkin,checkout,nights:dates.length,minNights,nightly,
    nightlySubtotal,discountName:discount.name,discountPct:discount.pct,discountAmount,lodgingAfterDiscount,
    cleaningFee,taxPct,taxes,total,depositPct,depositDue,
    pricingReady:pricingConfigured&&feesConfigured,
    rateStatus:pricingConfigured?'configured':'reference_rate_used',
    feeStatus:feesConfigured?'configured':'needs_configuration'
  };
}

module.exports={calculateQuote};
