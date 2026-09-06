const params=new URLSearchParams(location.search);
const reservationId=params.get('reservation_id')||'';
const sessionId=params.get('session_id')||'';
const title=document.getElementById('title');
const message=document.getElementById('message');
const detail=document.getElementById('detail');
const confirmButton=document.getElementById('confirm');
function setState(nextTitle,nextMessage,nextDetail=''){title.textContent=nextTitle;message.textContent=nextMessage;detail.textContent=nextDetail;}
async function call(action){const response=await fetch('/api/payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,reservationId,sessionId})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||data.error||'Payment request failed.');return data;}
async function verify(){
  if(params.get('cancelled')) return setState('Payment cancelled','No payment was recorded. You can close this page or contact CJT Realty if you need help.');
  if(!reservationId||!sessionId) return setState('Payment link incomplete','The confirmation link is missing its reservation or Stripe session reference. Please contact CJT Realty.');
  try{const data=await call('verify');setState('Payment verified','Stripe confirmed your payment. Select the button below to complete your guest confirmation.',`Payment recorded: ${Number(data.payment.amount||0).toLocaleString(undefined,{style:'currency',currency:'USD'})}`);confirmButton.hidden=false;confirmButton.onclick=confirmReservation;}
  catch(error){setState('Payment not verified',error.message,'If you completed payment, wait a moment and refresh this page.');}
}
async function confirmReservation(){confirmButton.disabled=true;try{await call('confirm');setState('Reservation confirmed','Thank you. Your reservation is now confirmed by CJT Realty.','You may close this page.');}catch(error){confirmButton.disabled=false;setState('Confirmation needs attention',error.message);}}
verify();
