const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appU6sJPe1iFFOIFR';
const GUESTS_TABLE = process.env.AIRTABLE_GUESTS_TABLE_ID || 'tbl2HgcB6bBk08uhM';
const RESERVATIONS_TABLE = process.env.AIRTABLE_RESERVATIONS_TABLE_ID || 'tbl21JOSzsLK3m94K';

function token(){ return String(process.env.AIRTABLE_ACCESS_TOKEN || '').trim(); }
function apiUrl(table, query=''){ return `https://api.airtable.com/v0/${BASE_ID}/${table}${query}`; }
function headers(){ return { Authorization:`Bearer ${token()}`,'Content-Type':'application/json' }; }
function formulaString(v){ return String(v||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"'); }
function statusName(v){
  const map={
    inquiry_hold:'Inquiry Hold',hold_verified:'Hold Verified',contract_sent:'Contract Sent',
    contract_signed:'Contract Signed',confirmed:'Confirmed',released:'Released',expired:'Expired',cancelled:'Cancelled'
  };
  return map[v] || 'Inquiry Hold';
}
function absoluteStatusUrl(relative){
  if(!relative) return null;
  if(/^https?:\/\//i.test(relative)) return relative;
  const base=String(process.env.PUBLIC_BASE_URL || (process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:'')).replace(/\/$/,'');
  return base ? `${base}${relative.startsWith('/')?'':'/'}${relative}` : null;
}
async function airtableFetch(url,options={}){
  const r=await fetch(url,{...options,headers:{...headers(),...(options.headers||{})}});
  const text=await r.text();
  let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
  if(!r.ok){const e=new Error(`Airtable ${r.status}: ${data.error?.message||data.error?.type||text||'request failed'}`);e.status=r.status;throw e;}
  return data;
}
async function findOne(table,formula){
  const q=`?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
  const d=await airtableFetch(apiUrl(table,q));
  return d.records?.[0]||null;
}
async function upsertGuest({name,email,phone}){
  const safe=formulaString(String(email||'').toLowerCase());
  let rec=await findOne(GUESTS_TABLE,`LOWER({Email})="${safe}"`);
  const fields={'Guest Name':name,'Email':email,'Phone':phone};
  if(rec){
    const d=await airtableFetch(apiUrl(GUESTS_TABLE),{method:'PATCH',body:JSON.stringify({records:[{id:rec.id,fields}]})});
    return d.records?.[0]||rec;
  }
  fields['First Seen']=new Date().toISOString();
  fields['Total Stays']=0;
  fields['Lifetime Revenue']=0;
  const d=await airtableFetch(apiUrl(GUESTS_TABLE),{method:'POST',body:JSON.stringify({records:[{fields}]})});
  return d.records?.[0]||null;
}
async function upsertReservation({reservation,quote,tripType,statusUrl,guestRecordId,notes}){
  const safe=formulaString(reservation.id);
  const existing=await findOne(RESERVATIONS_TABLE,`{Reservation ID}="${safe}"`);
  const fields={
    'Reservation ID':reservation.id,
    'Guest Name':reservation.guest_name,
    'Guest Email':reservation.guest_email,
    'Guest Phone':reservation.guest_phone,
    'Channel':'Direct',
    'Status':statusName(reservation.status),
    'Check-in':reservation.checkin,
    'Check-out':reservation.checkout,
    'Guests':reservation.guests,
    'Trip Type':tripType,
    'Nightly Subtotal':quote?.nightlySubtotal ?? null,
    'Cleaning Fee':quote?.cleaningFee ?? null,
    'Taxes':quote?.taxes ?? null,
    'Total Stay':quote?.total ?? null,
    'Deposit Due':quote?.depositDue ?? null,
    'Deposit Received':0,
    'Contract Status':'Not Sent',
    'Payment Status':'Not Requested',
    'Hold Expires':reservation.hold_expires_at ? new Date(reservation.hold_expires_at).toISOString() : null,
    'Guest Status Link':absoluteStatusUrl(statusUrl),
    'Notes':notes||'',
    'Guest Record':guestRecordId?[guestRecordId]:undefined
  };
  Object.keys(fields).forEach(k=>fields[k]===undefined&&delete fields[k]);
  if(existing){
    const d=await airtableFetch(apiUrl(RESERVATIONS_TABLE),{method:'PATCH',body:JSON.stringify({records:[{id:existing.id,fields}]})});
    return d.records?.[0]||existing;
  }
  fields['Created']=new Date().toISOString();
  const d=await airtableFetch(apiUrl(RESERVATIONS_TABLE),{method:'POST',body:JSON.stringify({records:[{fields}]})});
  return d.records?.[0]||null;
}
async function syncDirectReservation(payload){
  if(!token()) return {skipped:true,reason:'AIRTABLE_ACCESS_TOKEN not configured'};
  const guest=await upsertGuest(payload);
  const reservation=await upsertReservation({...payload,guestRecordId:guest?.id});
  return {skipped:false,guestRecordId:guest?.id||null,reservationRecordId:reservation?.id||null};
}

module.exports={syncDirectReservation};
