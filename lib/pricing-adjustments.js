const {randomUUID}=require('crypto');
function fail(message,code=400){const e=new Error(message);e.status=code;throw e;}
function date(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;}
function selection(b){
 if(!Array.isArray(b.channels)||b.channels.length!==1||b.channels[0]!=='direct')fail('Only Direct Booking is connected.');
 if(!date(b.start_date)||!date(b.end_date)||b.end_date<b.start_date)fail('Choose a valid date range.');
 if(!Array.isArray(b.weekdays)||!b.weekdays.length||b.weekdays.some(x=>!Number.isInteger(x)||x<0||x>6))fail('Select days of the week.');
 const dates=[];let count=0;
 for(let d=new Date(b.start_date);d<=new Date(b.end_date);d.setUTCDate(d.getUTCDate()+1)){
  if(++count>180)fail('Select at most 180 calendar days.');
  if(b.weekdays.includes(d.getUTCDay()))dates.push(d.toISOString().slice(0,10));
 }
 if(!dates.length)fail('No dates match the selected weekdays.');return dates;
}
function snapshotQuery(sql,start,end){return sql`SELECT jsonb_build_object(
 'rules',COALESCE((SELECT jsonb_build_object('value',value,'version',updated_at::text) FROM site_config WHERE key='pricing_rules'),'{}'::jsonb),
 'overrides',COALESCE((SELECT jsonb_agg(jsonb_build_object('stay_date',stay_date::text,'nightly_rate',nightly_rate,'min_nights',min_nights,'label',label,'version',updated_at::text) ORDER BY stay_date) FROM pricing_overrides WHERE stay_date BETWEEN ${start}::date AND ${end}::date),'[]'::jsonb)) AS snapshot`;}
function changes(b,snap,dates){
 if(!['fixed','percent','delta'].includes(b.mode)||typeof b.amount!=='number'||!Number.isFinite(b.amount))fail('Enter a valid adjustment.');
 if(b.mode==='percent'&&(b.amount<=-100||b.amount>1000))fail('Percentage must be greater than -100 and at most 1000.');
 const rules=snap.rules.value||{},overrides=new Map(snap.overrides.map(o=>[o.stay_date,o]));
 return dates.map(stay_date=>{
  const old=overrides.get(stay_date)||null,weekend=(rules.weekend_days||[5,6]).map(Number).includes(new Date(stay_date).getUTCDay());
  const before=old?Number(old.nightly_rate):Number(rules[weekend?'weekend_rate':'weekday_rate']||0);
  if(b.mode!=='fixed'&&before<=0)fail('Set base rates or use a fixed price before adjusting unpriced dates.');
  const raw=b.mode==='fixed'?b.amount:b.mode==='delta'?before+b.amount:before*(1+b.amount/100);
  const nightly_rate=Math.round((raw+Number.EPSILON)*100)/100;
  if(nightly_rate<1||nightly_rate>5000)fail('Every resulting nightly rate must be between $1 and $5,000.');
  return {stay_date,before_rate:before,old,new:{nightly_rate,min_nights:old?.min_nights??null,label:old?.label??null}};
 });
}
async function preview(sql,b){
 const dates=selection(b),[row]=await snapshotQuery(sql,b.start_date,b.end_date),snap=row.snapshot;let entries;
 if(b.mode==='restore'){
  const [batch]=await sql`SELECT entries FROM pricing_changes WHERE id=${String(b.restore_id||'')}`;
  if(!batch)fail('Pricing change not found.',404);
  entries=batch.entries.map(e=>({stay_date:e.stay_date,old:snap.overrides.find(o=>o.stay_date===e.stay_date)||null,new:e.old?{nightly_rate:e.old.nightly_rate,min_nights:e.old.min_nights,label:e.old.label}:null}));
  if(entries.some(e=>!dates.includes(e.stay_date)))fail('Restore must include the original changed dates.');
 }else entries=changes(b,snap,dates);
 return {snapshot:snap,entries,channels:['direct']};
}
async function publish(sql,b,user){
 const p=await preview(sql,b);if(!b.expected_snapshot)fail('Preview the rates before publishing.');const id=randomUUID();
 // Lock coordinates with legacy editors too. Compare after locking, then save and audit atomically.
 const results=await sql.transaction([
  sql`SET LOCAL lock_timeout='3s'`,sql`LOCK TABLE site_config, pricing_overrides IN SHARE ROW EXCLUSIVE MODE`,
  sql`WITH current AS (SELECT jsonb_build_object(
   'rules',COALESCE((SELECT jsonb_build_object('value',value,'version',updated_at::text) FROM site_config WHERE key='pricing_rules'),'{}'::jsonb),
   'overrides',COALESCE((SELECT jsonb_agg(jsonb_build_object('stay_date',stay_date::text,'nightly_rate',nightly_rate,'min_nights',min_nights,'label',label,'version',updated_at::text) ORDER BY stay_date) FROM pricing_overrides WHERE stay_date BETWEEN ${b.start_date}::date AND ${b.end_date}::date),'[]'::jsonb)) AS s),
  gate AS (SELECT 1 FROM current WHERE s=${JSON.stringify(b.expected_snapshot)}::jsonb AND s=${JSON.stringify(p.snapshot)}::jsonb),
  input AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(p.entries)}::jsonb) AS x(stay_date date,new jsonb)),
  removed AS (DELETE FROM pricing_overrides WHERE stay_date IN (SELECT stay_date FROM input WHERE new='null'::jsonb OR new IS NULL) AND EXISTS(SELECT 1 FROM gate) RETURNING stay_date),
  saved AS (INSERT INTO pricing_overrides(stay_date,nightly_rate,min_nights,label,updated_by_user_id,updated_at)
   SELECT stay_date,(new->>'nightly_rate')::numeric,(new->>'min_nights')::int,new->>'label',${user.id},now() FROM input WHERE new<>'null'::jsonb AND EXISTS(SELECT 1 FROM gate)
   ON CONFLICT(stay_date) DO UPDATE SET nightly_rate=EXCLUDED.nightly_rate,min_nights=EXCLUDED.min_nights,label=EXCLUDED.label,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now() RETURNING stay_date)
  INSERT INTO pricing_changes(id,user_id,actor,mode,note,start_date,end_date,entries)
   SELECT ${id},${user.id},${user.name},${b.mode},${String(b.note||'').trim().slice(0,300)},${b.start_date}::date,${b.end_date}::date,${JSON.stringify(p.entries)}::jsonb FROM gate RETURNING id`
 ],{isolationMode:'ReadCommitted'});
 if(!results[2].length)fail('Pricing changed since your preview. Preview again before publishing.',409);
 return {ok:true,id,count:p.entries.length,channels:{direct:'published'}};
}
async function handle(sql,b,user){
 if(user.role!=='admin')fail('Administrator access is required to change pricing.',403);
 if(b.action==='pricing_preview')return preview(sql,b);
 if(b.action==='pricing_publish')return publish(sql,b,user);
 if(b.action==='pricing_history')return {history:await sql`SELECT id,actor,mode,note,start_date::text,end_date::text,entries,created_at FROM pricing_changes ORDER BY created_at DESC LIMIT 30`};
 fail('Unknown pricing action.');
}
module.exports={selection,changes,preview,publish,handle};
