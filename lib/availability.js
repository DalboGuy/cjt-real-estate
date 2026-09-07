const AIRBNB_URL='https://www.airbnb.com/calendar/ical/1425420098199502774.ics?t=378f3883204a450791888d1c46c4a249';
const VRBO_URL='https://www.vrbo.com/icalendar/2c7b58fa16c7421f8c2d90340597c65c.ics?nonTentative&includeTentative=true';
const BOOKING_COM_URL=process.env.BOOKING_COM_ICAL_URL||'';
const OTA_TTL_MS=60_000;

let otaCache={at:0,value:null};

function unfold(text){return text.replace(/\r?\n[ \t]/g,'');}
function parseDate(v){const m=String(v||'').match(/(\d{4})(\d{2})(\d{2})/);if(!m)return null;return new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));}
function iso(d){return d.toISOString().slice(0,10);}

function toYmd(v){
  if(!v) return '';
  if(v instanceof Date && !Number.isNaN(v.getTime())) return iso(v);
  const m=String(v).match(/(\d{4}-\d{2}-\d{2})/);
  return m?m[1]:'';
}

async function readFeed(url){
  const r=await fetch(url,{headers:{'user-agent':'CJT-Availability/2.1'}});
  if(!r.ok)throw new Error(String(r.status));
  const text=unfold(await r.text());
  const events=[...text.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].map(x=>x[1]);
  const dates=new Set();
  for(const ev of events){
    const s=(ev.match(/DTSTART[^:]*:([^\r\n]+)/)||[])[1];
    const e=(ev.match(/DTEND[^:]*:([^\r\n]+)/)||[])[1];
    const start=parseDate(s),end=parseDate(e);
    if(!start||!end)continue;
    for(let d=new Date(start);d<end;d.setUTCDate(d.getUTCDate()+1))dates.add(iso(d));
  }
  return dates;
}

async function getOtaBlockedDates({fresh=false}={}){
  if(!fresh && otaCache.value && (Date.now()-otaCache.at)<OTA_TTL_MS) return otaCache.value;
  const all=new Set();
  const sources=[];
  const feeds=[['airbnb',AIRBNB_URL],['vrbo',VRBO_URL]];
  if(BOOKING_COM_URL) feeds.push(['booking.com',BOOKING_COM_URL]);
  else sources.push({name:'booking.com',ok:false,error:'not_configured'});
  for(const [name,url] of feeds){
    try{
      const dates=await readFeed(url);
      dates.forEach(d=>all.add(d));
      sources.push({name,ok:true,count:dates.size});
    }catch(e){sources.push({name,ok:false,error:e.message});}
  }
  const value={dates:all,sources};
  otaCache={at:Date.now(),value};
  return value;
}

function eachDate(checkin,checkout){
  const out=[];
  const start=new Date(`${toYmd(checkin)}T00:00:00Z`);
  const end=new Date(`${toYmd(checkout)}T00:00:00Z`);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start) return out;
  for(let d=start;d<end && out.length<400;d=new Date(d.getTime()+86400000))out.push(iso(d));
  return out;
}

module.exports={getOtaBlockedDates,eachDate,toYmd};
