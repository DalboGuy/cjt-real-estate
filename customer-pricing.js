(()=>{
 const testMode=document.body.dataset.bookingTest==='1';
 const old=document.getElementById('bookingForm');if(!old)return;
 // Keep the existing inputs so calendar selection still targets the visible form.
 const form=old;
 const phone=form.elements.phone;phone.required=true;phone.placeholder='Phone number';
 if(!form.elements.trip_type){const trip=document.createElement('div');trip.className='field full';trip.innerHTML='<label for="tripType">Trip type</label><select id="tripType" name="trip_type" required><option value="">Select</option><option>Family trip</option><option>Friends getaway</option><option>Wedding / event</option><option>Cruise stay</option><option>Other</option></select>';phone.closest('.field').after(trip);}
 const quoteBox=document.createElement('div');quoteBox.className='field full';quoteBox.setAttribute('aria-live','polite');
 const quoteBtn=document.createElement('button');quoteBtn.type='button';quoteBtn.className='btn btn-primary';quoteBtn.textContent='Check availability & price';
 const out=document.createElement('div');quoteBox.append(quoteBtn,out);form.querySelector('.form-grid').insertBefore(quoteBox,form.querySelector('#submitBtn').closest('.field'));
 const submit=form.querySelector('#submitBtn'),msg=form.querySelector('#formMessage');let quote=null,busy=false,version=0,quotedSelection='';submit.disabled=true;submit.textContent='Review price before holding dates';
 const money=n=>Number(n).toLocaleString('en-US',{style:'currency',currency:'USD'});
 const payload=()=>Object.fromEntries(new FormData(form).entries());
 const selection=()=>JSON.stringify(['checkin','checkout','guests'].map(n=>form.elements[n].value));
 function invalidate(){version++;quotedSelection='';quote=null;submit.disabled=true;submit.textContent='Review price before holding dates';out.textContent='Check availability and price for your selected dates.';}
 for(const n of ['checkin','checkout','guests'])form.elements[n].addEventListener('input',invalidate);
 async function request(url,b){const r=await fetch(url+(testMode?'?booking_test=1':''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),d=await r.json();if(!r.ok)throw Error(d.message||'Request failed');return d;}
 quoteBtn.onclick=async()=>{
  if(busy)return;const b=payload();if(!b.checkin||!b.checkout||!b.guests){out.textContent='Choose check-in, check-out and guest count first.';return;}
  invalidate();const v=version;busy=true;quoteBtn.disabled=true;out.textContent='Checking availability and price…';
  try{const d=await request('/api/quote',b);if(v!==version)return;
   if(!d.quote.pricingReady||d.quote.total===null){out.textContent='Online pricing is not ready for these dates. Contact CJT for a quote.';return;}
   quote=d.quote;quotedSelection=JSON.stringify([b.checkin,b.checkout,b.guests]);if(quotedSelection!==selection()){invalidate();return;}out.replaceChildren();
   const lines=[`${quote.nights} nights: ${money(quote.nightlySubtotal)}`,`Discount: −${money(quote.discountAmount)}`,`Cleaning: ${money(quote.cleaningFee)}`,`Taxes: ${money(quote.taxes)}`,`Total stay: ${money(quote.total)}`];
   if(quote.depositDue!==null)lines.push(`Deposit if booking proceeds: ${money(quote.depositDue)}`);
   lines.push('No payment is collected when you request a hold.');
   for(const line of lines){const p=document.createElement('p');p.textContent=line;out.appendChild(p)}submit.disabled=false;submit.textContent=testMode?'Test Dates & Price':'Hold Dates & Request Booking';
  }catch(e){if(v===version)out.textContent=e.message}finally{busy=false;quoteBtn.disabled=false}
 };
 form.addEventListener('submit',async e=>{
  e.preventDefault();e.stopImmediatePropagation();if(!quote||busy)return;if(quotedSelection!==selection()){invalidate();return;}const b={...payload(),expected_quote:quote};busy=true;submit.disabled=true;quoteBtn.disabled=true;msg.className='form-message show';msg.textContent='Placing your temporary hold…';
  try{const d=await request('/api/inquiries',b);msg.textContent=d.testMode?'Test complete. No reservation or hold was created.':`Your dates are temporarily held. Reference: ${d.reservation.id}. CJT will follow up with booking details.`;if(d.statusUrl){const link=document.createElement('a');link.href=d.statusUrl;link.textContent='View request status';msg.append(document.createElement('br'),link);}form.reset();if(typeof selectedCheckin!=='undefined'){selectedCheckin='';selectedCheckout='';}invalidate();if(typeof refreshCalendar==='function')await refreshCalendar()}
  catch(e){msg.textContent=e.message;msg.className='form-message error show';invalidate()}
  finally{busy=false;quoteBtn.disabled=false}
 },true);
})();
