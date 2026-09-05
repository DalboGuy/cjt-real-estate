// Run only against a disposable database branch: CJT_DATABASE_URL=... node tests/reservation-workflow.cjs
const assert=require('node:assert/strict');
const {db,ensureSchema}=require('../lib/db');
const {updateReservation}=require('../lib/reservation-workflow');
(async()=>{
  assert.equal(process.env.CJT_WORKFLOW_TEST_ISOLATED,'1','Explicit isolated database acknowledgement required');
  await ensureSchema();const sql=db(),prefix=`TEST-${Date.now()}`,user={id:0,name:'Workflow test',email:'test@example.invalid'};
  async function fixture(n,expires="now()+interval '24 hours'"){
    const id=`${prefix}-${n}`;
    await sql.query(`INSERT INTO reservations(id,guest_name,guest_email,guests,checkin,checkout,hold_expires_at) VALUES ($1,'Test','test@example.invalid',2,$2::date,$2::date+1,${expires})`,[id,`2090-01-${String(n).padStart(2,'0')}`]);return id;
  }
  async function act(id,status,extra={}){return updateReservation(sql,{id,status,...extra},user)}
  const id=await fixture(1);
  assert.equal((await act(id,'processing')).code,200);
  assert.equal((await act(id,'accept')).reservation.review_stage,'accepted');
  assert.equal((await act(id,'processing')).code,409);
  assert.equal((await act(id,'deposit_received')).code,409);
  assert.equal((await act(id,'contract_sent')).code,200);
  assert.equal((await act(id,'contract_signed')).code,200);
  assert.equal((await act(id,'deposit_received')).reservation.status,'confirmed');
  assert.equal((await act(id,'contract_sent')).code,409);
  assert.equal((await act(id,'reject')).code,409);
  assert.equal((await act(id,'release_dates')).code,200);
  assert.equal((await act(id,'accept')).code,409);
  const stale=await fixture(2),[version]=await sql`SELECT updated_at::text FROM reservations WHERE id=${stale}`;
  const concurrent=await Promise.all([act(stale,'accept',{expected_updated_at:version.updated_at}),act(stale,'reject',{expected_updated_at:version.updated_at})]);
  assert.deepEqual(concurrent.map(r=>r.code).sort(),[200,409]);
  const expired=await fixture(3,"now()-interval '1 second'");assert.equal((await act(expired,'accept')).code,409);
  const rejected=await fixture(4);assert.equal((await act(rejected,'reject',{note:'Cannot accommodate'})).reservation.review_stage,'rejected');
  const [event]=await sql`SELECT metadata FROM booking_events WHERE reservation_id=${rejected}`;assert.equal(event.metadata.note,'Cannot accommodate');
  const [count]=await sql`SELECT count(*)::int AS n FROM booking_events WHERE reservation_id=${id}`;assert.equal(count.n,6);
  assert.equal((await act('missing','release_dates')).code,404);
  console.log('PASS: migration, decisions, milestones, rejection, expiration, concurrency, and atomic audit history');
})().catch(e=>{console.error(e.message);process.exitCode=1});
