const crypto=require('crypto');
const AIRBNB_URL='https://www.airbnb.com/calendar/ical/1425420098199502774.ics?t=378f3883204a450791888d1c46c4a249';
const VRBO_URL='https://www.vrbo.com/icalendar/2c7b58fa16c7421f8c2d90340597c65c.ics?nonTentative&includeTentative=true';
const BOOKING_COM_URL=process.env.BOOKING_COM_ICAL_URL||'';
const HOUFY_URL=process.env.HOUFY_ICAL_URL||'';

function unfold(text){return text.replace(/\r?\n[ \t]/g,'');}
function parseDate(v){const m=String(v||'').match(/(\d{4})(\d{2})(\d{2})/);if(!m)return null;return new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));}
function iso(d){return d.toISOString().slice(0,10);}
function value(ev,key){return (ev.match(new RegExp(`${key}[^:]*:([^\\r\\n]+)`,'i'))||[])[1]||'';}
function cleanText(v,max=500){return String(v||'').replace(/\\n/g,' ').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\').replace(/\s+/g,' ').trim().slice(0,max);}
function eventKind(summary){const s=String(summary||'').toLowerCase();return /reserved|booked|confirmed/.test(s)?'reservation_like':'block';}
function eventKey(source,start,end,uid,summary){return crypto.createHash('sha256').update([source,start,end,uid,summary].join('|')).digest('hex').slice(0,24);}
function externalReference(source,description,summary){
  const text=`${description||''} ${summary||''}`;
  if(source==='airbnb'){
    const m=text.match(/reservations\/details\/([A-Z0-9]+)/i);return m?m[1].toUpperCase():null;
  }
  if(source==='vrbo'){
    const m=text.match(/(?:Reservation ID|reservation)[:\s]+([A-Z0-9-]+)/i);return m?m[1].toUpperCase():null;
  }
  return null;
}

async function readFeed(url,source){
  const r=await fetch(url,{headers:{'user-agent':'CJT-Availability/2.4'}});
  if(!r.ok)throw new Error(String(r.status));
  const text=unfold(await r.text());
  const chunks=[...text.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].map(x=>x[1]);
  const dates=new Set(),events=[];
  for(const ev of chunks){
    const startDate=parseDate(value(ev,'DTSTART')),endDate=parseDate(value(ev,'DTEND'));
    if(!startDate||!endDate||endDate<=startDate)continue;
    const start=iso(startDate),end=iso(endDate),summary=cleanText(value(ev,'SUMMARY'),120)||'Unavailable',uid=value(ev,'UID');
    const description=cleanText(value(ev,'DESCRIPTION'),1000),ref=externalReference(source,description,summary);
    for(let d=new Date(startDate);d<endDate;d.setUTCDate(d.getUTCDate()+1))dates.add(iso(d));
    events.push({key:eventKey(source,start,end,uid,summary),source,start,end,summary,kind:eventKind(summary),externalReference:ref});
  }
  return {dates,events};
}

async function getOtaBlockedDates(){
  const all=new Set();
  const sources=[];
  const sourceDates={};
  const events=[];
  const feeds=[['airbnb',AIRBNB_URL],['vrbo',VRBO_URL]];
  if(BOOKING_COM_URL) feeds.push(['booking.com',BOOKING_COM_URL]);
  else sources.push({name:'booking.com',ok:false,error:'not_configured'});
  if(HOUFY_URL) feeds.push(['houfy',HOUFY_URL]);
  else sources.push({name:'houfy',ok:false,error:'not_configured'});
  for(const [name,url] of feeds){
    try{
      const feed=await readFeed(url,name);
      feed.dates.forEach(d=>all.add(d));
      sourceDates[name]=[...feed.dates].sort();
      events.push(...feed.events);
      sources.push({name,ok:true,count:feed.dates.size,eventCount:feed.events.length});
    }catch(e){
      sourceDates[name]=[];
      sources.push({name,ok:false,error:e.message});
    }
  }
  return {dates:all,sources,sourceDates,events};
}

async function getOtaCalendarEvents(){
  const ota=await getOtaBlockedDates();
  return {events:ota.events,sources:ota.sources};
}

function eachDate(checkin,checkout){
  const out=[];
  const start=new Date(`${checkin}T00:00:00Z`),end=new Date(`${checkout}T00:00:00Z`);
  for(let d=start;d<end;d=new Date(d.getTime()+86400000))out.push(iso(d));
  return out;
}

module.exports={getOtaBlockedDates,getOtaCalendarEvents,eachDate};
