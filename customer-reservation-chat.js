(()=>{
  const token=new URLSearchParams(location.search).get('token');
  if(!token)return;
  const content=document.getElementById('content');
  if(!content)return;

  const style=document.createElement('style');
  style.textContent=`
    .guest-chat{border:1px solid var(--line);border-radius:22px;background:#fff;padding:24px;margin:20px 0;box-shadow:0 16px 40px rgba(13,43,49,.07)}
    .guest-chat-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}.guest-chat-head h2{font-family:Georgia,serif;font-weight:500;margin:0;font-size:1.7rem}.guest-chat-head p{margin:4px 0 0;color:var(--muted);font-size:.9rem}
    .guest-chat-state{font-size:.76rem;color:var(--muted);white-space:nowrap}.guest-chat-list{display:grid;gap:10px;max-height:420px;overflow:auto;padding:6px 2px 14px}.guest-chat-empty{padding:18px;border-radius:14px;background:var(--cream);color:var(--muted);text-align:center}
    .guest-msg{max-width:82%;padding:11px 13px;border-radius:16px;background:#eef2f1;justify-self:start}.guest-msg.mine{background:var(--deep);color:#fff;justify-self:end}.guest-msg .who{font-size:.7rem;font-weight:900;opacity:.72;margin-bottom:4px}.guest-msg .body{white-space:pre-wrap;overflow-wrap:anywhere}.guest-msg .when{font-size:.66rem;opacity:.65;margin-top:5px}
    .guest-chat-form{display:grid;grid-template-columns:1fr auto;gap:9px;align-items:end;border-top:1px solid var(--line);padding-top:14px}.guest-chat-form textarea{min-height:48px;max-height:130px;resize:vertical;border:1px solid var(--line);border-radius:14px;padding:11px 12px;font:inherit}.guest-chat-send{border:0;border-radius:999px;background:var(--deep);color:#fff;font-weight:900;padding:12px 18px;cursor:pointer}.guest-chat-send:disabled{opacity:.55}.guest-chat-note{grid-column:1/-1;color:var(--muted);font-size:.72rem}
    @media(max-width:600px){.guest-chat{padding:19px}.guest-chat-form{grid-template-columns:1fr}.guest-chat-send{width:100%}.guest-msg{max-width:92%}}
  `;
  document.head.appendChild(style);

  const card=document.createElement('section');
  card.className='guest-chat';
  card.innerHTML=`
    <div class="guest-chat-head"><div><h2>Message the CJT Partners</h2><p>Your conversation stays attached to this reservation.</p></div><span id="guestChatState" class="guest-chat-state">Connecting…</span></div>
    <div id="guestChatList" class="guest-chat-list"><div class="guest-chat-empty">Loading messages…</div></div>
    <form id="guestChatForm" class="guest-chat-form"><textarea id="guestChatBody" maxlength="4000" placeholder="Ask a question or send CJT an update…" required></textarea><button id="guestChatSend" class="guest-chat-send" type="submit">Send</button><div class="guest-chat-note">Private conversation for this reservation. Do not send payment card information here.</div></form>`;
  content.after(card);

  const list=document.getElementById('guestChatList'),state=document.getElementById('guestChatState'),form=document.getElementById('guestChatForm'),body=document.getElementById('guestChatBody'),send=document.getElementById('guestChatSend');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const when=s=>new Date(s).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  let lastSignature='';

  function render(messages){
    const signature=(messages||[]).map(m=>m.id).join(',');
    if(signature===lastSignature)return;
    lastSignature=signature;
    if(!messages||!messages.length){list.innerHTML='<div class="guest-chat-empty">No messages yet. Send CJT a note here and the conversation will remain with your reservation.</div>';return}
    list.innerHTML=messages.map(m=>`<div class="guest-msg ${m.sender_type==='guest'?'mine':''}"><div class="who">${m.sender_type==='guest'?'You':esc(m.sender_name||'CJT')}</div><div class="body">${esc(m.body)}</div><div class="when">${when(m.created_at)}</div></div>`).join('');
    list.scrollTop=list.scrollHeight;
  }

  async function load(silent=false){
    if(!silent)state.textContent='Connecting…';
    try{
      const r=await fetch('/api/chat?token='+encodeURIComponent(token),{cache:'no-store'}),d=await r.json();
      if(!r.ok)throw new Error(d.message||'Messaging unavailable');
      render(d.messages||[]);state.textContent='Private chat';
    }catch(e){
      state.textContent='Unavailable';
      if(!silent)list.innerHTML=`<div class="guest-chat-empty">${esc(e.message)}</div>`;
    }
  }

  form.addEventListener('submit',async e=>{
    e.preventDefault();const text=body.value.trim();if(!text)return;
    send.disabled=true;send.textContent='Sending…';
    try{
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'guest_send',token,body:text})}),d=await r.json();
      if(!r.ok)throw new Error(d.message||'Could not send message.');
      body.value='';lastSignature='';await load(true);
    }catch(e){alert(e.message)}finally{send.disabled=false;send.textContent='Send';body.focus()}
  });

  load();
  const timer=setInterval(()=>{if(!document.hidden)load(true)},15000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
