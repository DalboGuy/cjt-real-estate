const FEED_ENV_BY_SOURCE = Object.freeze({
  airbnb: 'AIRBNB_ICAL_URL',
  vrbo: 'VRBO_ICAL_URL',
  'booking.com': 'BOOKING_COM_ICAL_URL'
});
const REQUIRED_FEEDS = ['airbnb', 'vrbo'];

function runtimeEnvironment(){
  return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
}

function configuredFeeds(){
  const feeds=[];
  const missing=[];
  for(const name of REQUIRED_FEEDS){
    const envName=FEED_ENV_BY_SOURCE[name];
    const url=String(process.env[envName]||'').trim();
    if(url)feeds.push([name,url]);
    else missing.push(envName);
  }
  const bookingEnv=FEED_ENV_BY_SOURCE['booking.com'];
  const bookingUrl=String(process.env[bookingEnv]||'').trim();
  if(bookingUrl)feeds.push(['booking.com',bookingUrl]);
  if(missing.length){
    const error=new Error(`Missing required OTA calendar feed environment variable(s): ${missing.join(', ')}`);
    error.code='OTA_FEED_CONFIG_MISSING';
    error.missingEnv=missing;
    error.environment=runtimeEnvironment();
    throw error;
  }
  return {feeds,bookingConfigured:Boolean(bookingUrl)};
}

function unfold(text){return text.replace(/\r?\n[ \t]/g,'');}
function parseDate(v){const m=String(v||'').match(/(\d{4})(\d{2})(\d{2})/);if(!m)return null;return new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));}
function iso(d){return d.toISOString().slice(0,10);}

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

async function getOtaBlockedDates(){
  const {feeds,bookingConfigured}=configuredFeeds();
  const all=new Set();
  const sources=[];
  if(!bookingConfigured)sources.push({name:'booking.com',ok:false,error:'not_configured'});
  for(const [name,url] of feeds){
    try{
      const dates=await readFeed(url);
      dates.forEach(d=>all.add(d));
      sources.push({name,ok:true,count:dates.size});
    }catch(e){sources.push({name,ok:false,error:e.message});}
  }
  return {dates:all,sources};
}

function eachDate(checkin,checkout){
  const out=[];
  const start=new Date(`${checkin}T00:00:00Z`),end=new Date(`${checkout}T00:00:00Z`);
  for(let d=start;d<end;d=new Date(d.getTime()+86400000))out.push(iso(d));
  return out;
}

module.exports={getOtaBlockedDates,eachDate};
