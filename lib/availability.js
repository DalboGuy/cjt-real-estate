const { validateIcalText } = require('./feed-validate');

const FEED_ENV_BY_SOURCE = Object.freeze({
  airbnb: 'AIRBNB_ICAL_URL',
  vrbo: 'VRBO_ICAL_URL',
  'booking.com': 'BOOKING_COM_ICAL_URL'
});
const MAX_OWNER_CALENDARS = 10;
const FEED_FETCH_TIMEOUT_MS = 12000;
const NON_ICAL_SOURCE_NAMES = new Set(['direct', 'owner_blocks', 'ota']);
const NON_ICAL_CHANNELS = new Set(['direct', 'manual_block', 'owner_stay']);

function runtimeEnvironment(){
  return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
}

async function listOwnerConnections(){
  try{
    const { db, ensureSchema } = require('./db');
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

function unfold(text){return String(text||'').replace(/\r?\n[ \t]/g,'');}
function parseDate(v){const m=String(v||'').match(/(\d{4})(\d{2})(\d{2})/);if(!m)return null;return new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));}
function iso(d){return d.toISOString().slice(0,10);}

function unescapeIcal(value){
  return String(value||'').replace(/\\n/gi,' ').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\').trim();
}

function sanitizePublicText(value, max=160){
  return String(value||'')
    .replace(/https?:\/\/\S+/gi,'')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'')
    .replace(/\b[a-f0-9]{24,}\b/gi,'')
    .replace(/[\u0000-\u001f]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,max);
}

function classifyChannel({name,label,host,summary}={}){
  const s=[name,label,host,summary].filter(Boolean).join(' ').toLowerCase();
  if(/\bairbnb\b/.test(s)) return 'airbnb';
  if(/\bvrbo\b|\bhomeaway\b/.test(s)) return 'vrbo';
  if(/booking\.com|\bbooking\b/.test(s)) return 'booking.com';
  return 'other';
}

function normalizeFeedUrl(url){
  try{
    const u=new URL(String(url||'').trim());
    u.hash='';
    u.searchParams.sort();
    u.pathname=(u.pathname.replace(/\/+$/,'')||'/');
    return u.toString().toLowerCase();
  }catch{
    return String(url||'').trim().toLowerCase();
  }
}

function icalField(block, key){
  const re=new RegExp(`${key}[^:]*:([^\\r\\n]+)`);
  return unescapeIcal((block.match(re)||[])[1]||'');
}

function parseIcalEvents(text){
  const unfolded=unfold(text);
  const blocks=[...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].map(x=>x[1]);
  const events=[];
  for(const ev of blocks){
    const start=parseDate(icalField(ev,'DTSTART'));
    let end=parseDate(icalField(ev,'DTEND'));
    if(!start) continue;
    if(!end || iso(end)<=iso(start)) end=new Date(start.getTime()+86400000);
    const status=sanitizePublicText(icalField(ev,'STATUS'),40);
    events.push({
      start:iso(start),
      end:iso(end),
      summary:sanitizePublicText(icalField(ev,'SUMMARY'),120) || 'Blocked',
      uid:sanitizePublicText(icalField(ev,'UID'),120),
      status,
      notes:sanitizePublicText(icalField(ev,'DESCRIPTION'),400)
    });
  }
  return events;
}

function eachDate(checkin,checkout){
  const out=[];
  const start=new Date(`${checkin}T00:00:00Z`),end=new Date(`${checkout}T00:00:00Z`);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())) return out;
  for(let d=start;d<end;d=new Date(d.getTime()+86400000)) out.push(iso(d));
  return out;
}

function urlHostHint(url){
  try{return new URL(String(url)).host||'saved';}catch{return 'saved';}
}

async function configuredFeedList(){
  const feeds=[];
  const seenUrls=new Map();

  for(const [name, envName] of Object.entries(FEED_ENV_BY_SOURCE)){
    const url=String(process.env[envName]||'').trim();
    if(!url) continue;
    feeds.push({
      key:name,
      label:name,
      url,
      origin:'env',
      channel:name,
      hostHint:urlHostHint(url),
      duplicateOf:null
    });
    seenUrls.set(normalizeFeedUrl(url), name);
  }

  const connections=await listOwnerConnections();
  for(const row of connections){
    const url=String(row.feed_url||'').trim();
    if(!url) continue;
    const key=`owner:${row.id}`;
    const hostHint=urlHostHint(url);
    const channel=classifyChannel({label:row.label, host:hostHint, name:row.label});
    const norm=normalizeFeedUrl(url);
    const duplicateOf=seenUrls.has(norm) ? seenUrls.get(norm) : null;
    if(!duplicateOf) seenUrls.set(norm, key);
    feeds.push({
      key,
      id:Number(row.id),
      label:row.label,
      url,
      origin:'owner',
      channel,
      hostHint,
      duplicateOf,
      updatedAt:row.updated_at
    });
  }

  if(!feeds.length){
    const error=new Error('No calendar feeds configured. Add up to 10 in Owner Calendar, or set AIRBNB_ICAL_URL / VRBO_ICAL_URL / BOOKING_COM_ICAL_URL.');
    error.code='OTA_FEED_CONFIG_MISSING';
    error.status=503;
    error.missingEnv=['AIRBNB_ICAL_URL','VRBO_ICAL_URL'];
    error.environment=runtimeEnvironment();
    error.sources=[];
    error.sourceHealth=buildSourceHealth([]);
    throw error;
  }

  return {feeds, ownerCount:connections.length, maxOwnerCalendars:MAX_OWNER_CALENDARS};
}

async function configuredFeeds(){
  const listed=await configuredFeedList();
  return {
    feeds:listed.feeds.filter(f=>!f.duplicateOf).map(f=>[f.key, f.url]),
    origins:Object.fromEntries(listed.feeds.map(f=>[f.key, f.origin])),
    ownerCount:listed.ownerCount,
    maxOwnerCalendars:listed.maxOwnerCalendars
  };
}

function otaFeedError(code, message, extras={}){
  const error=new Error(message);
  error.code=code;
  error.status=503;
  Object.assign(error, extras);
  return error;
}

function publicFeedError(error){
  const code=error && error.code;
  if(code && String(code).startsWith('ICAL_')) return error.message;
  const status=Number(error && error.status);
  if(Number.isInteger(status) && status>=400) return `http_${status}`;
  const raw=String((error && error.message) || error || 'feed_unhealthy');
  if(/^\d{3}$/.test(raw)) return `http_${raw}`;
  if(/^http_\d{3}$/i.test(raw)) return raw.toLowerCase();
  if(/aborted|timeout|timed out/i.test(raw)) return 'feed_timeout';
  return 'feed_unhealthy';
}

function isIcalFeedSource(source){
  if(!source || source.duplicateOf) return false;
  if(source.kind==='ical') return true;
  if(NON_ICAL_SOURCE_NAMES.has(source.name)) return false;
  if(source.origin==='db' || NON_ICAL_CHANNELS.has(source.channel)) return false;
  return source.origin==='env' || source.origin==='owner';
}

function buildSourceHealth(sources=[], {checkedAt}={}){
  const live=sources.filter(isIcalFeedSource);
  const unhealthy=live.filter(s=>s.ok===false);
  const ok=live.length>0 && unhealthy.length===0;
  return {
    ok,
    failClosed:!ok,
    liveCount:live.length,
    unhealthyCount:unhealthy.length,
    unhealthy:unhealthy.map(s=>s.name),
    checkedAt:checkedAt || new Date().toISOString()
  };
}

function assertFeedsHealthy(sources, extras={}){
  const sourceHealth=buildSourceHealth(sources);
  if(sourceHealth.ok) return sourceHealth;
  const missing=sourceHealth.liveCount===0;
  throw otaFeedError(
    missing ? 'OTA_FEED_CONFIG_MISSING' : 'OTA_FEED_UNHEALTHY',
    missing
      ? 'No calendar feeds configured. Add up to 10 in Owner Calendar, or set AIRBNB_ICAL_URL / VRBO_ICAL_URL / BOOKING_COM_ICAL_URL.'
      : 'One or more calendar feeds could not be verified. Availability is paused until feeds are healthy.',
    {sources, sourceHealth, ...extras}
  );
}

async function readFeedDetail(url){
  const ac=typeof AbortSignal!=='undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS)
    : undefined;
  const r=await fetch(url,{
    headers:{'user-agent':'CJT-Availability/2.3','accept':'text/calendar, text/plain, */*'},
    signal:ac
  });
  if(!r.ok){
    const err=new Error(`http_${r.status}`);
    err.status=r.status;
    throw err;
  }
  const contentType=r.headers && typeof r.headers.get==='function' ? (r.headers.get('content-type')||'') : '';
  const text=await r.text();
  const check=validateIcalText(text,{contentType});
  if(!check.ok){
    throw otaFeedError(check.code, check.message);
  }
  const events=parseIcalEvents(text);
  const dates=new Set();
  for(const ev of events){
    if(String(ev.status||'').toUpperCase()==='CANCELLED') continue;
    eachDate(ev.start, ev.end).forEach(d=>dates.add(d));
  }
  return {dates, events};
}

async function readFeed(url){
  const detail=await readFeedDetail(url);
  return detail.dates;
}

async function getOtaBlockedDates(){
  const {feeds}=await configuredFeedList();
  const all=new Set();
  const sources=[];
  const events=[];
  const byKey=new Map();

  const toFetch=feeds.filter(f=>!f.duplicateOf);
  const results=await Promise.all(toFetch.map(async feed=>{
    try{
      const detail=await readFeedDetail(feed.url);
      return {feed, ok:true, dates:detail.dates, events:detail.events, error:null};
    }catch(e){
      return {feed, ok:false, dates:new Set(), events:[], error:publicFeedError(e)};
    }
  }));

  for(const result of results){
    byKey.set(result.feed.key, result);
    if(result.ok) result.dates.forEach(d=>all.add(d));
    sources.push({
      kind:'ical',
      name:result.feed.key,
      label:result.feed.label,
      channel:result.feed.channel,
      ok:result.ok,
      count:result.dates.size,
      error:result.error,
      origin:result.feed.origin,
      hostHint:result.feed.hostHint,
      duplicateOf:null
    });
    if(result.ok){
      for(const ev of result.events){
        events.push({
          ...ev,
          feedName:result.feed.key,
          label:result.feed.label,
          origin:result.feed.origin,
          channel:result.feed.channel,
          hostHint:result.feed.hostHint
        });
      }
    }
  }

  for(const feed of feeds){
    if(!feed.duplicateOf) continue;
    const primary=byKey.get(feed.duplicateOf);
    sources.push({
      kind:'ical',
      name:feed.key,
      label:feed.label,
      channel:feed.channel,
      ok:primary ? primary.ok : false,
      count:primary && primary.ok ? primary.dates.size : 0,
      error:primary && !primary.ok ? primary.error : null,
      origin:feed.origin,
      hostHint:feed.hostHint,
      duplicateOf:feed.duplicateOf,
      skipped:'duplicate_url'
    });
  }

  const sourceHealth=assertFeedsHealthy(sources);
  return {dates:all, sources, events, sourceHealth};
}

module.exports={
  getOtaBlockedDates,
  eachDate,
  listOwnerConnections,
  FEED_ENV_BY_SOURCE,
  MAX_OWNER_CALENDARS,
  FEED_FETCH_TIMEOUT_MS,
  urlHostHint,
  classifyChannel,
  normalizeFeedUrl,
  parseIcalEvents,
  sanitizePublicText,
  configuredFeedList,
  configuredFeeds,
  buildSourceHealth,
  assertFeedsHealthy,
  isIcalFeedSource,
  otaFeedError,
  publicFeedError
};
