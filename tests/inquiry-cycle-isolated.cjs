const assert=require('node:assert/strict');
const {db,ensureSchema,getActiveReservations,expireHolds}=require('../lib/db');
const {updateReservation}=require('../lib/reservation-workflow');
// Isolate OTA transport only. Real handlers and database queries still execute.
global.fetch=async()=>({ok:true,text:async()=> 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n'});
const inquiry=require('../api/inquiries');
const status=require('../api/reservation-status');
async function call(handler,req){const res={status(n){this.code=n;return this},json(data){this.data=data;return this},setHeader(){}};await handler(req,res);return res;}
(async()=>{
  assert.equal(process.env.CJT_WORKFLOW_TEST_ISOLATED,'1');
  await ensureSchema();const sql=db(),prefix=`CYCLE-${Date.now()}`,user={id:0,name:'Isolated acceptance test',email:'acceptance@example.invalid'};
  const act=(id,status)=>updateReservation(sql,{id,status},user);
  const created=await call(inquiry,{method:'POST',query:{},body:{name:'Isolated acceptance test',email:`${prefix}@example.invalid`,phone:'5550100000',trip_type:'Acceptance test',checkin:'2097-01-10',checkout:'2097-01-13',guests:2}});
  assert.equal(created.code,201,JSON.stringify(created.data));assert(created.data.statusUrl);
  const id=created.data.reservation.id,token=new URL(created.data.statusUrl,'https://example.invalid').searchParams.get('token');
  const guest=()=>call(status,{method:'GET',query:{token}});
  assert.equal((await guest()).data.reservation.status,'inquiry_hold');
  assert((await getActiveReservations()).some(r=>r.id===id));
  assert.equal((await act(id,'reject')).reservation.review_stage,'rejected');
  assert.equal((await guest()).data.reservation.status,'released');
  assert(!(await getActiveReservations()).some(r=>r.id===id));
  const expId=`${prefix}-expired`;
  await sql`INSERT INTO reservations(id,guest_name,guest_email,guests,checkin,checkout,hold_expires_at) VALUES (${expId},'Isolated acceptance test','acceptance@example.invalid',2,'2097-02-01','2097-02-03',now()-interval '1 second')`;
  assert.equal((await act(expId,'accept')).code,409);
  await expireHolds();
  const [expired]=await sql`SELECT status FROM reservations WHERE id=${expId}`;assert.equal(expired.status,'expired');
  assert(!(await getActiveReservations()).some(r=>r.id===expId));
  console.log('PASS: guest inquiry persists, status token works, active hold blocks, rejection releases, expired hold cannot be accepted and is removed from active availability.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
