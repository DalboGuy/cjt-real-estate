const WEEKEND_DAYS=new Set([5,6]); // Friday/Saturday
const CLEANING_FEE=240;
const TAX_RATE=0.15;
const PRICING_THROUGH='2027-08-15';
const MAX_GUESTS=14;
const SPLIT_PAYMENT_THRESHOLD_DAYS=30;
const ADVANCE_PAYMENT_PCT=0.50;

const SEASONS=[
  ['Non-Peak 1','2026-09-05','2026-10-16',529,655,2],
  ['ARToberFEST','2026-10-17','2026-10-18',655,655,2],
  ['Non-Peak 2','2026-10-19','2026-10-22',529,655,2],
  ['Island Oktoberfest','2026-10-23','2026-10-24',680,680,2],
  ['Non-Peak 3','2026-10-25','2026-11-04',529,655,2],
  ['Lone Star Rally','2026-11-05','2026-11-08',865,865,3],
  ['Non-Peak 4','2026-11-09','2026-11-24',529,655,2],
  ['Thanksgiving Holiday','2026-11-25','2026-11-29',685,685,3],
  ['Non-Peak 5','2026-11-30','2026-12-03',529,655,2],
  ['Dickens on The Strand','2026-12-04','2026-12-06',810,810,2],
  ['Non-Peak 6','2026-12-07','2026-12-22',529,655,2],
  ['Christmas / New Year','2026-12-23','2027-01-03',635,635,3],
  ['Non-Peak 7','2027-01-04','2027-01-14',529,655,2],
  ["Art Week + Yaga's Chili Quest",'2027-01-15','2027-01-16',680,680,2],
  ['Non-Peak 8','2027-01-17','2027-01-28',529,655,2],
  ['Mardi Gras - First Weekend','2027-01-29','2027-01-31',815,815,3],
  ['Non-Peak 9','2027-02-01','2027-02-04',529,655,2],
  ['Mardi Gras - Second Weekend','2027-02-05','2027-02-07',920,920,3],
  ['Non-Peak 10','2027-02-08','2027-02-08',529,655,2],
  ['Mardi Gras - Fat Tuesday','2027-02-09','2027-02-09',705,705,2],
  ['Non-Peak 11','2027-02-10','2027-03-05',529,655,2],
  ['Texas Spring Break','2027-03-06','2027-03-21',610,740,3],
  ['Non-Peak 12','2027-03-22','2027-03-25',529,655,2],
  ['Easter / Spring Holiday','2027-03-26','2027-03-29',740,740,3],
  ['Non-Peak 13','2027-03-30','2027-04-14',529,655,2],
  ['Galveston FeatherFest','2027-04-15','2027-04-18',660,660,3],
  ['Non-Peak 14','2027-04-19','2027-04-30',529,655,2],
  ['Historic Homes Tour - Weekend 1','2027-05-01','2027-05-02',810,810,2],
  ['Non-Peak 15','2027-05-03','2027-05-07',529,655,2],
  ['Historic Homes Tour - Weekend 2','2027-05-08','2027-05-09',810,810,2],
  ['Non-Peak 16','2027-05-10','2027-05-27',529,655,2],
  ['Memorial Day Weekend','2027-05-28','2027-05-31',865,865,3],
  ['Early Summer Peak 1','2027-06-01','2027-06-03',635,765,3],
  ['Galveston Island Revue Weekend','2027-06-04','2027-06-05',860,860,2],
  ['Early Summer Peak 2','2027-06-06','2027-06-17',635,765,3],
  ['Juneteenth Peak Weekend','2027-06-18','2027-06-20',840,840,3],
  ['Core Summer Peak 1','2027-06-21','2027-07-01',660,815,3],
  ['July 4th Festivities','2027-07-02','2027-07-05',975,975,4],
  ['Core Summer Peak 2','2027-07-06','2027-07-31',660,815,3],
  ['Late Summer Peak','2027-08-01','2027-08-15',610,740,3]
].map(([name,start,end,weekday,weekend,minNights])=>({name,start,end,weekday,weekend,minNights}));

function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));}
function round2(v){return Math.round((Number(v)+Number.EPSILON)*100)/100;}
function eachDate(checkin,checkout){
  const out=[];
  const start=new Date(`${checkin}T00:00:00Z`),end=new Date(`${checkout}T00:00:00Z`);
  for(let d=start;d<end;d=new Date(d.getTime()+86400000))out.push(d.toISOString().slice(0,10));
  return out;
}
function seasonFor(date){return SEASONS.find(s=>date>=s.start&&date<=s.end)||null;}
function nightlyRate(date){
  const season=seasonFor(date);
  if(!season)return null;
  const dow=new Date(`${date}T12:00:00Z`).getUTCDay();
  const weekend=WEEKEND_DAYS.has(dow);
  return {date,season:season.name,rate:weekend?season.weekend:season.weekday,weekend,minNights:season.minNights};
}
function pricingError(code,message,status=422){const e=new Error(message);e.code=code;e.status=status;return e;}
function dateLabel(date){return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});}
function paymentScheduleFor(total,checkin,asOf=new Date()){
  const amount=round2(total);
  if(!validDate(checkin))return {mode:'full',dueAtBooking:amount,remainingBalance:0,reason:'missing_checkin'};
  const todayUtc=Date.UTC(asOf.getUTCFullYear(),asOf.getUTCMonth(),asOf.getUTCDate());
  const arrivalUtc=Date.parse(`${checkin}T00:00:00Z`);
  const daysUntilCheckin=Math.ceil((arrivalUtc-todayUtc)/86400000);
  if(daysUntilCheckin>SPLIT_PAYMENT_THRESHOLD_DAYS){
    const dueAtBooking=round2(amount*ADVANCE_PAYMENT_PCT);
    const remainingBalance=round2(amount-dueAtBooking);
    const dueDate=new Date(arrivalUtc-SPLIT_PAYMENT_THRESHOLD_DAYS*86400000).toISOString().slice(0,10);
    return {
      mode:'split',depositPct:ADVANCE_PAYMENT_PCT,dueAtBooking,remainingBalance,
      balanceDueDate:dueDate,balanceDueDateLabel:dateLabel(dueDate),daysUntilCheckin,
      reason:'more_than_30_days'
    };
  }
  return {
    mode:'full',depositPct:1,dueAtBooking:amount,remainingBalance:0,balanceDueDate:null,balanceDueDateLabel:null,
    daysUntilCheckin,reason:'within_30_days'
  };
}

function quoteStay(checkin,checkout,guests=1){
  if(!validDate(checkin)||!validDate(checkout)||checkout<=checkin)throw pricingError('invalid_dates','Choose a valid check-in and check-out date.',400);
  const guestCount=Number(guests);
  if(!Number.isInteger(guestCount)||guestCount<1||guestCount>MAX_GUESTS)throw pricingError('invalid_guests',`Sand & Sea Manor allows up to ${MAX_GUESTS} overnight guests.`,400);
  const nights=eachDate(checkin,checkout);
  if(!nights.length)throw pricingError('invalid_dates','Choose at least one night.',400);
  if(nights.length>90)throw pricingError('stay_too_long','Direct-booking quotes are limited to 90 nights.',400);
  const nightLines=nights.map(nightlyRate);
  if(nightLines.some(v=>!v))throw pricingError('pricing_not_published',`Online pricing is currently published through ${PRICING_THROUGH}. Please contact CJT for dates outside the published window.`);
  const minimumStay=Math.max(...nightLines.map(n=>n.minNights));
  if(nights.length<minimumStay)throw pricingError('minimum_stay',`These dates require a minimum stay of ${minimumStay} nights.`);
  const lodgingSubtotal=round2(nightLines.reduce((sum,n)=>sum+n.rate,0));
  const taxes=round2((lodgingSubtotal+CLEANING_FEE)*TAX_RATE);
  const total=round2(lodgingSubtotal+CLEANING_FEE+taxes);
  const groups=[];
  for(const line of nightLines){
    const key=`${line.season}|${line.rate}`;
    let g=groups.find(x=>x.key===key);
    if(!g){g={key,season:line.season,nightlyRate:line.rate,nights:0,subtotal:0};groups.push(g);}
    g.nights+=1;g.subtotal=round2(g.subtotal+line.rate);
  }
  return {
    currency:'USD',checkin,checkout,guests:guestCount,nights:nights.length,minimumStay,
    lodgingSubtotal,cleaningFee:CLEANING_FEE,taxRate:TAX_RATE,taxes,total,
    averageNightly:round2(lodgingSubtotal/nights.length),
    priceLines:groups.map(({key,...g})=>g),pricingThrough:PRICING_THROUGH,
    paymentSchedule:paymentScheduleFor(total,checkin),
    quoteVersion:'seasonal-v2',quotedAt:new Date().toISOString()
  };
}

function ownerAdjustedQuote(existing,lodgingSubtotal){
  const amount=Number(lodgingSubtotal);
  if(!Number.isFinite(amount)||amount<=0)throw pricingError('invalid_quote','Enter a valid lodging subtotal.',400);
  const cleaningFee=Number(existing?.cleaningFee??CLEANING_FEE);
  const taxRate=Number(existing?.taxRate??TAX_RATE);
  const taxes=round2((amount+cleaningFee)*taxRate);
  const total=round2(amount+cleaningFee+taxes);
  return {
    ...(existing||{}),
    baseLodgingSubtotal:Number(existing?.baseLodgingSubtotal??existing?.lodgingSubtotal??amount),
    lodgingSubtotal:round2(amount),cleaningFee:round2(cleaningFee),taxRate,
    taxes,total,paymentSchedule:paymentScheduleFor(total,existing?.checkin),
    ownerAdjusted:true,quoteVersion:'owner-adjusted-v2',quotedAt:new Date().toISOString()
  };
}

module.exports={WEEKEND_DAYS,SEASONS,CLEANING_FEE,TAX_RATE,PRICING_THROUGH,MAX_GUESTS,SPLIT_PAYMENT_THRESHOLD_DAYS,ADVANCE_PAYMENT_PCT,eachDate,quoteStay,ownerAdjustedQuote,paymentScheduleFor};
