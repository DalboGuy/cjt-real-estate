function money(text,label){
  const re=new RegExp(`${label}[\\s\\S]{0,80}?\\$([0-9,]+(?:\\.[0-9]{1,2})?)`,'i');
  const m=String(text||'').match(re);return m?Number(m[1].replace(/,/g,'')):null;
}
function firstMoneyAfter(text,label){return money(text,label)}
function parseAirbnbConfirmation(text,otaEvents=[]){
  const raw=String(text||'');
  const ref=(raw.match(/(?:Confirmation code\s*|reservations\/details\/)([A-Z0-9]{8,})/i)||[])[1];
  if(!ref)throw new Error('airbnb_confirmation_code_not_found');
  const event=(otaEvents||[]).find(e=>e.source==='airbnb'&&String(e.externalReference||'').toUpperCase()===ref.toUpperCase());
  if(!event)throw new Error('airbnb_calendar_match_not_found');
  const guest=(raw.match(/New booking confirmed!\s+(.+?)\s+arrives/i)||raw.match(/\[([^\]]+)\]\([^\)]*reservations\/details\//i)||[])[1]||null;
  const gross=firstMoneyAfter(raw,'Total \\(USD\\)');
  const taxes=firstMoneyAfter(raw,'Occupancy taxes');
  const cleaning=firstMoneyAfter(raw,'Cleaning fee');
  const payout=firstMoneyAfter(raw,'You earn');
  return {
    booking_key:`airbnb:${ref.toUpperCase()}`,
    channel:'airbnb',checkin:event.start,checkout:event.end,status:'confirmed',
    gross_revenue:gross,taxes,cleaning_fee:cleaning,expected_payout:payout,collected_amount:null,
    currency:'USD',source:'airbnb_email',external_reference:ref.toUpperCase(),
    notes:guest?`Guest: ${guest.trim()}`:null
  };
}
function parseCsvLine(line){
  const out=[];let cur='',quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){
      if(quoted&&line[i+1]==='"'){cur+='"';i++;}else quoted=!quoted;
    }else if(c===','&&!quoted){out.push(cur);cur='';}else cur+=c;
  }
  out.push(cur);return out;
}
function parseBookingPayoutCsv(text){
  const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
  if(lines.length<2)throw new Error('booking_csv_empty');
  const headers=parseCsvLine(lines[0]).map(x=>x.trim());
  const idx=name=>headers.findIndex(h=>h.toLowerCase()===name.toLowerCase());
  const required=['Payout date','Reservation number','Check in date','Total amount (gross)','Currency'];
  if(required.some(h=>idx(h)<0))throw new Error('booking_csv_headers_not_recognized');
  return lines.slice(1).map(line=>{
    const row=parseCsvLine(line),ref=row[idx('Reservation number')]?.trim(),date=row[idx('Payout date')]?.trim();
    const amount=Number(String(row[idx('Total amount (gross)')]||'').replace(/,/g,''));
    if(!ref||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(amount))return null;
    return {
      payout_key:`booking.com:${ref}:${date}:${amount.toFixed(2)}`,
      channel:'booking.com',reservation_reference:ref,checkin:row[idx('Check in date')]?.trim()||null,
      payout_date:date,amount,currency:row[idx('Currency')]?.trim()||'USD',source:'booking_payout_csv',
      descriptor:idx('Statement Descriptor')>=0?(row[idx('Statement Descriptor')]?.trim()||null):null
    };
  }).filter(Boolean);
}
module.exports={parseAirbnbConfirmation,parseBookingPayoutCsv};
