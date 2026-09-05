(()=>{
  const params=new URLSearchParams(location.search);
  const token=params.get('token');
  const demo=params.get('demo')==='1';
  const state={status:null,quote:null,guest:null,unread:0,messagesLoaded:false,demoMessages:[]};
  const DEMO={
    status:{id:'DEMO-RESERVATION',property:'1720-avenue-m',checkin:'2026-10-16',checkout:'2026-10-19',guests:8,status:'confirmed',statusLabel:'Reservation confirmed',holdExpiresAt:null,contractSentAt:'2026-09-02T16:00:00Z',contractSignedAt:'2026-09-02T18:30:00Z',depositReceivedAt:'2026-09-03T14:00:00Z',createdAt:'2026-09-01T15:00:00Z'},
    quote:{nightlySubtotal:1800,discountAmount:150,discountName:'Direct booking offer',cleaningFee:275,taxes:288.75,total:2213.75,depositDue:553.44,pricingReady:true},
    guest:{guest_name:'Demo Guest',guest_email:'demo@example.com',guest_phone:'555-0100'},
    messages:[
      {id:'d1',sender_type:'owner',sender_name:'CJT',body:'Your reservation is confirmed. We are looking forward to hosting your group at Sand & Sea Manor.',created_at:'2026-09-03T15:15:00Z'},
      {id:'d2',sender_type:'guest',sender_name:'Demo Guest',body:'Thanks. We are excited for the trip.',created_at:'2026-09-03T15:22:00Z'}
    ]
  };
  const $=id=>document.getElementById(id);
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));
  const date=s=>s?new Date(String(s).includes('T')?s:s+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'—';
  const shortDate=s=>s?new Date(String(s).includes('T')?s:s+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}):'—';
  const time=s=>s?new Date(s).toLocaleString():'—';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const when=s=>new Date(s).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

  function showFatal(message){
    $('appLoading').innerHTML=`<div class="error-box">${esc(message)}</div>`;
    document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
    $('loadingScreen').classList.add('active');
  }
  function stayNights(r){
    if(!r||!r.checkin||!r.checkout)return null;
    return Math.max(0,Math.round((new Date(r.checkout+'T00:00:00')-new Date(r.checkin+'T00:00:00'))/86400000));
  }
  function countdown(r){
    if(!r||!r.checkin)return {value:'—',label:'until check-in'};
    const today=new Date();today.setHours(0,0,0,0);
    const start=new Date(r.checkin+'T00:00:00');
    const end=new Date(r.checkout+'T00:00:00');
    const days=Math.ceil((start-today)/86400000);
    if(today>=start&&today<end)return {value:'NOW',label:'your stay is underway'};
    if(days===0)return {value:'TODAY',label:'check-in day'};
    if(days===1)return {value:'1',label:'day to check-in'};
    if(days>1)return {value:String(days),label:'days to check-in'};
    return {value:'PAST',label:'stay completed'};
  }
  function appStage(r){
    if(!r)return {title:'Loading reservation',body:'Retrieving your booking details.'};
    if(['expired','released','cancelled'].includes(r.status))return {title:r.statusLabel,body:'Message CJT if you need help with this reservation.'};
    if(r.status==='confirmed')return {title:'No action required',body:'Your reservation is confirmed. Return here as your stay gets closer for guest information.'};
    if(r.status==='contract_signed')return {title:'Complete your deposit',body:'Your agreement is signed. CJT will confirm the reservation when the deposit step is complete.'};
    if(r.status==='contract_sent')return {title:'Review your agreement',body:'Your direct-booking agreement has been sent and is awaiting signature.'};
    if(r.status==='hold_verified')return {title:'CJT is preparing your booking',body:'Your hold has been reviewed. Watch this page and Messages for the agreement.'};
    return {title:'Your dates are being held',body:'CJT is reviewing your request. Your temporary hold remains active until the time shown in My Stay.'};
  }
  function statusClass(ok,pending){return ok?'good':pending?'warn':''}
  function renderHome(){
    const r=state.status,q=state.quote,guest=state.guest||{};
    const cd=countdown(r),nights=stayNights(r),next=appStage(r);
    $('homeGreeting').textContent=guest.guest_name?`Welcome, ${guest.guest_name.split(' ')[0]}`:'Your Galveston stay';
    $('homeDates').textContent=`${shortDate(r.checkin)} – ${shortDate(r.checkout)}${nights!=null?` · ${nights} night${nights===1?'':'s'}`:''} · ${r.guests} guest${Number(r.guests)===1?'':'s'}`;
    $('countdownValue').textContent=cd.value;$('countdownLabel').textContent=cd.label;
    $('reservationState').textContent=r.statusLabel;
    $('reservationBox').className='status-box '+statusClass(r.status==='confirmed',r.status!=='confirmed');
    const signed=!!r.contractSignedAt;$('agreementState').textContent=signed?'Signed':r.contractSentAt?'Awaiting signature':'Not sent yet';$('agreementBox').className='status-box '+statusClass(signed,!!r.contractSentAt);
    const paid=!!r.depositReceivedAt;$('depositState').textContent=paid?'Received':r.status==='confirmed'?'Complete':'Pending';$('depositBox').className='status-box '+statusClass(paid||r.status==='confirmed',true);
    $('nextTitle').textContent=next.title;$('nextBody').textContent=next.body;
    if(q&&q.pricingReady&&Number(q.total)>0){$('homeTotalWrap').hidden=false;$('homeTotal').textContent=money(q.total)}else $('homeTotalWrap').hidden=true;
    updateUnread(state.unread);
  }
  function stepHtml(r){
    const order=['inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed'];
    const labels=['Dates held','CJT review','Agreement sent','Agreement signed','Reservation confirmed'];
    const current=order.indexOf(r.status);
    if(['expired','released','cancelled'].includes(r.status))return `<div class="notice">This reservation is marked <strong>${esc(r.statusLabel)}</strong>. Contact CJT if you need help.</div>`;
    return `<div class="steps">${labels.map((label,i)=>`<div class="step ${i<current?'done':''} ${i===current?'active':''}"><span class="dot"></span><div><strong>${label}</strong>${i===current?'<br><small>Current step</small>':''}</div></div>`).join('')}</div>`;
  }
  function quoteHtml(q){
    if(!q)return '<div class="notice">A detailed quote is not available on this reservation yet.</div>';
    let rows=`<div class="quote"><div class="quote-row"><span>Nightly stay</span><strong>${money(q.nightlySubtotal)}</strong></div>`;
    if(Number(q.discountAmount)>0)rows+=`<div class="quote-row"><span>${esc(q.discountName||'Discount')}</span><strong>−${money(q.discountAmount)}</strong></div>`;
    if(q.pricingReady){rows+=`<div class="quote-row"><span>Cleaning</span><strong>${money(q.cleaningFee)}</strong></div><div class="quote-row"><span>Taxes</span><strong>${money(q.taxes)}</strong></div><div class="quote-row total"><span>Total stay</span><strong>${money(q.total)}</strong></div>`;if(q.depositDue!=null)rows+=`<div class="quote-row"><span>Deposit due</span><strong>${money(q.depositDue)}</strong></div>`}
    return rows+'</div>';
  }
  function renderStay(){
    const r=state.status;
    $('stayContent').innerHTML=`
      <span class="status-pill">${esc(r.statusLabel)}</span>
      <div class="detail-grid" style="margin-top:18px">
        <div class="detail"><span>Reservation</span><strong>${esc(r.id)}</strong></div>
        <div class="detail"><span>Guests</span><strong>${esc(r.guests)}</strong></div>
        <div class="detail"><span>Check-in</span><strong>${date(r.checkin)}</strong></div>
        <div class="detail"><span>Check-out</span><strong>${date(r.checkout)}</strong></div>
        ${r.holdExpiresAt?`<div class="detail"><span>Temporary hold expires</span><strong>${time(r.holdExpiresAt)}</strong></div>`:''}
        <div class="detail"><span>Property</span><strong>Sand & Sea Manor</strong></div>
      </div>${stepHtml(r)}`;
    $('quoteContent').innerHTML=quoteHtml(state.quote);
  }
  function updateUnread(n){
    state.unread=Number(n||0);const badge=$('messageBadge');
    if(state.unread>0){badge.textContent=state.unread>99?'99+':String(state.unread);badge.classList.add('show');$('homeMessageMeta').textContent=`${state.unread} new message${state.unread===1?'':'s'} from CJT`}
    else{badge.classList.remove('show');$('homeMessageMeta').textContent='Open your private conversation with CJT'}
  }
  function switchTab(name){
    document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.dataset.screen===name));
    document.querySelectorAll('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
    if(name==='messages')loadMessages(false);
    const nextHash=name==='home'?'':name;
    if(location.hash.replace('#','')!==nextHash)history.replaceState(null,'',nextHash?'#'+nextHash:location.pathname+location.search);
    window.scrollTo({top:0,behavior:'instant'});
  }
  function renderMessages(messages){
    const list=$('chatList');
    if(!messages||!messages.length){list.innerHTML='<div class="chat-empty">No messages yet. Send CJT a note here and the conversation will remain attached to your reservation.</div>';return}
    list.innerHTML=messages.map(m=>`<div class="chat-msg ${m.sender_type==='guest'?'mine':''}"><div class="who">${m.sender_type==='guest'?'You':esc(m.sender_name||'CJT')}</div><div class="body">${esc(m.body)}</div><div class="when">${when(m.created_at)}</div></div>`).join('');
    list.scrollTop=list.scrollHeight;
  }
  async function loadMessages(silent=true){
    if(demo){state.messagesLoaded=true;renderMessages(state.demoMessages);updateUnread(0);$('chatState').textContent='Demo chat';return}
    if(!token)return;
    if(!silent)$('chatState').textContent='Connecting…';
    try{
      const r=await fetch('/api/chat?token='+encodeURIComponent(token),{cache:'no-store'}),d=await r.json();
      if(!r.ok)throw new Error(d.message||'Messaging unavailable');
      state.guest=d.reservation||state.guest;state.messagesLoaded=true;renderMessages(d.messages||[]);updateUnread(0);$('chatState').textContent='Private chat';
    }catch(e){$('chatState').textContent='Unavailable';if(!silent)$('chatList').innerHTML=`<div class="chat-empty">${esc(e.message)}</div>`}
  }
  async function loadApp(){
    if(demo){
      state.status=DEMO.status;state.quote=DEMO.quote;state.guest=DEMO.guest;state.unread=1;state.demoMessages=DEMO.messages.slice();
      const demoBanner=$('demoBanner');if(demoBanner)demoBanner.hidden=false;
      renderHome();renderStay();$('loadingScreen').classList.remove('active');
      const initial=(location.hash||'').replace('#','');switchTab(['stay','messages','house','help'].includes(initial)?initial:'home');
      return;
    }
    if(!token){showFatal('This reservation link is incomplete. Use the private link sent by CJT.');return}
    try{
      const [statusRes,summaryRes]=await Promise.all([
        fetch('/api/reservation-status?token='+encodeURIComponent(token),{cache:'no-store'}),
        fetch('/api/chat?mode=guest_summary&token='+encodeURIComponent(token),{cache:'no-store'})
      ]);
      const statusData=await statusRes.json();
      if(!statusRes.ok)throw new Error(statusData.message||'Unable to load reservation.');
      state.status=statusData.reservation;state.quote=statusData.quote||null;
      if(summaryRes.ok){const summary=await summaryRes.json();state.guest=summary.reservation||null;state.unread=Number(summary.unread_count||0)}
      renderHome();renderStay();$('loadingScreen').classList.remove('active');
      const initial=(location.hash||'').replace('#','');switchTab(['stay','messages','house','help'].includes(initial)?initial:'home');
    }catch(e){showFatal(e.message)}
  }
  document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
  document.querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.go)));
  $('chatForm').addEventListener('submit',async e=>{
    e.preventDefault();const body=$('chatBody'),send=$('chatSend'),text=body.value.trim();if(!text)return;
    send.disabled=true;send.textContent='Sending…';
    try{
      if(demo){state.demoMessages.push({id:'demo-'+Date.now(),sender_type:'guest',sender_name:'Demo Guest',body:text,created_at:new Date().toISOString()});body.value='';renderMessages(state.demoMessages);return}
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'guest_send',token,body:text})}),d=await r.json();
      if(!r.ok)throw new Error(d.message||'Could not send message.');body.value='';await loadMessages(true);
    }catch(e){alert(e.message)}finally{send.disabled=false;send.textContent='Send';body.focus()}
  });
  window.addEventListener('hashchange',()=>{const h=(location.hash||'').replace('#','');if(['home','stay','messages','house','help'].includes(h))switchTab(h)});
  const timer=setInterval(()=>{if(!document.hidden&&state.messagesLoaded&&document.querySelector('[data-screen="messages"]').classList.contains('active'))loadMessages(true)},15000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  loadApp();
})();
