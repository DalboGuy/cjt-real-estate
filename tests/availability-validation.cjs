const assert=require('node:assert/strict');
// Exercise the real parser and inquiry handler without external feeds or writes.
delete process.env.BOOKING_COM_ICAL_URL;
delete process.env.HOUFY_ICAL_URL;
let body='';
global.fetch=async()=>({ok:true,text:async()=>body});
const {getOtaBlockedDates}=require('../lib/availability');
const stub=(path,exports)=>{require.cache[require.resolve(path)]={exports};};
stub('../lib/db',{ensureSchema:async()=>{},expireHolds:async()=>{},db:()=>{throw Error('Unexpected database access');}});
stub('../lib/guests',{upsertGuest:async()=>{throw Error('Unexpected guest write');}});
const inquiry=require('../api/inquiries');
async function submit(){
  const result={status(code){this.code=code;return this;},json(data){this.data=data;return this;},setHeader(){}};
  await inquiry({method:'POST',query:{},body:{name:'Acceptance test',email:'acceptance@example.invalid',phone:'5550100000',trip_type:'Family',checkin:'2091-01-01',checkout:'2091-01-04',guests:2}},result);
  return result;
}
(async()=>{
  const calendar=event=>`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${event}END:VCALENDAR\r\n`;
  const event=(start,end)=>`BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${start}\r\nDTEND;VALUE=DATE:${end}\r\nEND:VEVENT\r\n`;
  for(const invalid of ['<html>Unavailable</html>','', 'BEGIN:VCALENDAR\r\n',calendar('BEGIN:VEVENT\r\n'),calendar(event('20910230','20910303')),calendar(event('20910104','20910101'))]){
    body=invalid;
    const ota=await getOtaBlockedDates();
    assert(ota.sources.filter(s=>['airbnb','vrbo'].includes(s.name)).every(s=>!s.ok));
    const res=await submit();assert.equal(res.code,503);assert.equal(res.data.error,'availability_unavailable');
  }
  body=calendar('');
  assert((await getOtaBlockedDates()).sources.filter(s=>['airbnb','vrbo'].includes(s.name)).every(s=>s.ok));
  body=calendar(event('20910101','20910104'));
  assert.deepEqual([...(await getOtaBlockedDates()).dates],['2091-01-01','2091-01-02','2091-01-03']);
  assert.equal((await submit()).code,409);
  console.log('PASS: six invalid feed cases block inquiries; valid empty feeds succeed; occupied nights block inquiries; checkout remains exclusive.');
})().catch(e=>{console.error(e);process.exitCode=1;});
