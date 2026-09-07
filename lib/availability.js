const { db, ensureSchema } = require('./db');

const FEED_ENV_BY_SOURCE = Object.freeze({
  airbnb: 'AIRBNB_ICAL_URL',
  vrbo: 'VRBO_ICAL_URL',
  'booking.com': 'BOOKING_COM_ICAL_URL'
});
const REQUIRED_FEEDS = ['airbnb', 'vrbo'];
const OPTIONAL_FEEDS = ['booking.com'];

function runtimeEnvironment(){
  return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
}

async function feedUrlFromDb(source){
  try{
    await ensureSchema();
    const sql=db();
    const rows=await sql`SELECT feed_url FROM calendar_feeds WHERE source=${source} LIMIT 1`;
    return String(rows[0]?.feed_url||'').trim();
  }catch{
    return '';
  }
}

async function resolveFeedUrl(source){
  const envName=FEED_ENV_BY_SOURCE[source];
  const fromEnv=String(process.env[envName]||'').trim();
  if(fromEnv) return {url:fromEnv, origin:'env'};
  const fromDb=await feedUrlFromDb(source);
  if(fromDb) return {url:fromDb, origin:'owner'};
  return {url:'', origin:null};
}

async function configuredFeeds(){
  const feeds=[];
  const missing=[];
  const origins={};
  for(const name of REQUIRED_FEEDS){
    const resolved=await resolveFeedUrl(name);
    origins[name]=resolved.origin;
    if(resolved.url) feeds.push([name,resolved.url]);
    else missing.push(FEED_ENV_BY_SOURCE[name]);
  }
  for(const name of OPTIONAL_FEEDS){
    const resolved=await resolveFeedUrl(name);
    origins[name]=resolved.origin;
    if(resolved.url) feeds.push([name,resolved.url]);
  }
  if(missing.length){
    const error=new Error(`Missing required OTA calendar feed(s): ${missing.join(', ')} (set in Owner Calendar connections or Vercel env)`);
    error.code='OTA_FEED_CONFIG_MISSING';
    error.missingEnv=missing;
    error.environment=runtimeEnvironment();
    throw error;
  }
  return {feeds, bookingConfigured:Boolean(origins['booking.com']), origins};
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
  const {feeds,bookingConfigured,origins}=await configuredFeeds();
  const all=new Set();
  const sources=[];
  if(!bookingConfigured)sources.push({name:'booking.com',ok:false,error:'not_configured',origin:null});
  for(const [name,url] of feeds){
    try{
      const dates=await readFeed(url);
      dates.forEach(d=>all.add(d));
      sources.push({name,ok:true,count:dates.size,origin:origins[name]||null});
    }catch(e){sources.push({name,ok:false,error:e.message,origin:origins[name]||null});}
  }
  return {dates:all,sources};
}

function eachDate(checkin,checkout){
  const out=[];
  const start=new Date(`${checkin}T00:00:00Z`),end=new Date(`${checkout}T00:00:00Z`);
  for(let d=start;d<end;d=new Date(d.getTime()+86400000))out.push(iso(d));
  return out;
}

function urlHostHint(url){
  try{return new URL(String(url)).host||'saved';}catch{return 'saved';}
}

module.exports={getOtaBlockedDates,eachDate,resolveFeedUrl,FEED_ENV_BY_SOURCE,REQUIRED_FEEDS,urlHostHint};
