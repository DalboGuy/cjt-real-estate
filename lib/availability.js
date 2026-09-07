const { db, ensureSchema } = require('./db');

const FEED_ENV_BY_SOURCE = Object.freeze({
  airbnb: 'AIRBNB_ICAL_URL',
  vrbo: 'VRBO_ICAL_URL',
  'booking.com': 'BOOKING_COM_ICAL_URL'
});
const MAX_OWNER_CALENDARS = 10;

function runtimeEnvironment(){
  return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
}

async function listOwnerConnections(){
  try{
    await ensureSchema();
    const sql=db();
    return await sql`
      SELECT id, label, feed_url, updated_at
      FROM calendar_connections
      ORDER BY id ASC
      LIMIT ${MAX_OWNER_CALENDARS}
    `;
  }catch{
    return [];
  }
}

async function configuredFeeds(){
  const feeds=[];
  const origins={};

  for(const [name, envName] of Object.entries(FEED_ENV_BY_SOURCE)){
    const url=String(process.env[envName]||'').trim();
    if(!url) continue;
    feeds.push([name, url]);
    origins[name]='env';
  }

  const connections=await listOwnerConnections();
  for(const row of connections){
    const url=String(row.feed_url||'').trim();
    if(!url) continue;
    const key=`owner:${row.id}`;
    feeds.push([key, url]);
    origins[key]='owner';
  }

  if(!feeds.length){
    const error=new Error('No calendar feeds configured. Add up to 10 in Owner Calendar, or set AIRBNB_ICAL_URL / VRBO_ICAL_URL / BOOKING_COM_ICAL_URL.');
    error.code='OTA_FEED_CONFIG_MISSING';
    error.missingEnv=['AIRBNB_ICAL_URL','VRBO_ICAL_URL'];
    error.environment=runtimeEnvironment();
    throw error;
  }

  return {feeds, origins, ownerCount:connections.length, maxOwnerCalendars:MAX_OWNER_CALENDARS};
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
  const {feeds,origins}=await configuredFeeds();
  const all=new Set();
  const sources=[];
  for(const [name,url] of feeds){
    try{
      const dates=await readFeed(url);
      dates.forEach(d=>all.add(d));
      sources.push({name,ok:true,count:dates.size,origin:origins[name]||null});
    }catch(e){
      sources.push({name,ok:false,error:e.message,origin:origins[name]||null});
    }
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

module.exports={
  getOtaBlockedDates,
  eachDate,
  listOwnerConnections,
  FEED_ENV_BY_SOURCE,
  MAX_OWNER_CALENDARS,
  urlHostHint
};
