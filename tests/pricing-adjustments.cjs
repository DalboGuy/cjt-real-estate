// Disposable branch only. CJT_PRICING_TEST_ISOLATED=1 CJT_DATABASE_URL=... node tests/pricing-adjustments.cjs
const assert=require('node:assert/strict');
const {db,ensureSchema}=require('../lib/db');
const {selection,changes,preview,publish,handle}=require('../lib/pricing-adjustments');
const {calculateQuote}=require('../lib/pricing');
(async()=>{
 assert.equal(process.env.CJT_PRICING_TEST_ISOLATED,'1');
 const body={start_date:'2091-04-02',end_date:'2091-04-05',weekdays:[0,1,2,3,4,5,6],channels:['direct'],mode:'fixed',amount:300};
 assert.throws(()=>selection({...body,start_date:'2091-02-30'}));assert.throws(()=>selection({...body,channels:['airbnb']}));assert.throws(()=>selection({...body,end_date:'2092-04-05'}));
 assert.equal(selection(body).length,4);
 assert.throws(()=>changes({...body,mode:'percent',amount:-100},{rules:{},overrides:[]},selection(body)));
 await assert.rejects(()=>handle(null,{action:'pricing_publish'},{role:'owner'}),e=>e.status===403);
 await ensureSchema();const sql=db();
 await sql`INSERT INTO owner_users(name,email,password_salt,password_hash,role) VALUES ('Pricing test','pricing-test@example.invalid','test','test','admin') ON CONFLICT(email) DO NOTHING`;
 const [user]=await sql`SELECT id,name,role FROM owner_users WHERE email='pricing-test@example.invalid'`;
 await sql`INSERT INTO site_config(key,value) VALUES ('pricing_rules','{"weekday_rate":200,"weekend_rate":250,"default_min_nights":2,"weekend_days":[5,6]}'::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
 await sql`DELETE FROM pricing_overrides WHERE stay_date BETWEEN ${body.start_date}::date AND ${body.end_date}::date`;
 const prior=await calculateQuote(body.start_date,body.end_date);
 let p=await preview(sql,body);const a=await publish(sql,{...body,expected_snapshot:p.snapshot},user);
 assert.equal(a.count,4);const quote=await calculateQuote(body.start_date,body.end_date);assert.equal(quote.nightlySubtotal,900);assert.notEqual(prior.nightlySubtotal,quote.nightlySubtotal);
 await assert.rejects(()=>publish(sql,{...body,expected_snapshot:p.snapshot},user),e=>e.status===409);
 const percent={...body,mode:'percent',amount:10};p=await preview(sql,percent);assert.equal(p.entries[0].new.nightly_rate,330);
 const both=await Promise.allSettled([publish(sql,{...percent,expected_snapshot:p.snapshot},user),publish(sql,{...percent,expected_snapshot:p.snapshot},user)]);
 assert.equal(both.filter(r=>r.status==='fulfilled').length,1);assert.equal(both.find(r=>r.status==='rejected').reason.status,409);
 const restore={...body,mode:'restore',restore_id:a.id};p=await preview(sql,restore);await publish(sql,{...restore,expected_snapshot:p.snapshot},user);
 assert.equal((await calculateQuote(body.start_date,body.end_date)).nightlySubtotal,prior.nightlySubtotal);
 // Failed audit insertion must roll back all overrides.
 p=await preview(sql,body);await assert.rejects(()=>publish(sql,{...body,expected_snapshot:p.snapshot},{id:-999999,name:'invalid'}));
 assert.equal((await calculateQuote(body.start_date,body.end_date)).nightlySubtotal,prior.nightlySubtotal);
 // Existing override minimum stay and label survive adjustments and restores.
 await sql`INSERT INTO pricing_overrides(stay_date,nightly_rate,min_nights,label) VALUES (${body.start_date}::date,225,3,'Existing special')`;
 const delta={...body,mode:'delta',amount:-25};p=await preview(sql,delta);assert.equal(p.entries[0].new.nightly_rate,200);assert.equal(p.entries[0].new.min_nights,3);
 const d=await publish(sql,{...delta,expected_snapshot:p.snapshot},user);p=await preview(sql,{...body,mode:'restore',restore_id:d.id});await publish(sql,{...body,mode:'restore',restore_id:d.id,expected_snapshot:p.snapshot},user);
 const [ov]=await sql`SELECT nightly_rate::float8,min_nights,label FROM pricing_overrides WHERE stay_date=${body.start_date}::date`;assert.deepEqual(ov,{nightly_rate:225,min_nights:3,label:'Existing special'});
 const history=await handle(sql,{action:'pricing_history'},user);assert.ok(history.history.some(h=>h.id===a.id));
 console.log('PASS: validation, role denial, direct quote propagation, stale preview, concurrent publish, restore, atomic rollback, minimum-stay preservation and history.');
})().catch(e=>{console.error(e.message);process.exit(1)});
