(()=>{
  const root=document.documentElement;
  if(root.dataset.financeReconciliationLoaded)return;
  root.dataset.financeReconciliationLoaded='1';

  const QB={
    year:2026,
    asOf:'September 4, 2026',
    rentalIncome:22669.77,
    totalIncome:25669.77,
    channels:{airbnb:6281.12,vrbo:14311.21,'booking.com':2077.44}
  };
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v||0));
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=v=>String(v||'other').trim().toLowerCase();
  const label=v=>({'airbnb':'Airbnb','vrbo':'Vrbo','booking.com':'Booking.com','direct':'CJT Direct','houfy':'Houfy','other':'Other'}[norm(v)]||String(v||'Other'));

  const style=document.createElement('style');
  style.textContent=`
    .fin-rec-card{background:#fff;border:1px solid var(--line);border-radius:21px;padding:20px;box-shadow:0 12px 34px rgba(13,43,49,.05)}
    .fin-rec-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.fin-rec-head h3{font-family:Georgia,serif;font-weight:500;font-size:1.35rem;margin:0;color:#102f35}
    .fin-rec-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}.fin-rec-metric{border:1px solid var(--line);border-radius:15px;padding:13px;background:#fbfcfb}.fin-rec-metric span{display:block;color:var(--muted);font-size:.67rem;font-weight:850;text-transform:uppercase;letter-spacing:.05em}.fin-rec-metric b{display:block;font-size:1.3rem;margin-top:7px;color:#102f35}.fin-rec-metric small{display:block;color:var(--muted);font-size:.7rem;margin-top:3px}
    .fin-rec-status{display:inline-flex;align-items:center;border-radius:999px;padding:6px 9px;font-size:.68rem;font-weight:900;background:#eef2f1;color:#315d64}.fin-rec-status.warn{background:#fff1cc;color:#6a4b0b}.fin-rec-status.good{background:#dff3e7;color:#1f5b39}
    .fin-rec-table{margin-top:14px;border:1px solid var(--line);border-radius:14px;overflow:hidden}.fin-rec-row{display:grid;grid-template-columns:1.1fr .9fr .9fr .9fr;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);align-items:center;font-size:.78rem}.fin-rec-row:last-child{border-bottom:0}.fin-rec-row.head{background:#f8fbfa;color:var(--muted);font-size:.67rem;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.fin-rec-row .num{text-align:right;font-variant-numeric:tabular-nums}.fin-rec-note{font-size:.72rem;color:var(--muted);line-height:1.5;margin-top:12px}
    .fin-source-strip{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.fin-source-chip{border:1px solid var(--line);border-radius:999px;padding:7px 10px;font-size:.7rem;background:#fff}.fin-source-chip strong{color:#102f35}
    @media(max-width:700px){.fin-rec-grid{grid-template-columns:1fr}.fin-rec-row{grid-template-columns:1fr 1fr}.fin-rec-row.head{display:none}.fin-rec-row>div:nth-child(2)::before{content:'Ledger: ';color:var(--muted)}.fin-rec-row>div:nth-child(3)::before{content:'QuickBooks: ';color:var(--muted)}.fin-rec-row>div:nth-child(4)::before{content:'Difference: ';color:var(--muted)}}
  `;
  document.head.appendChild(style);

  let data=null;
  async function fetchData(){
    const r=await fetch('/api/owner-calendar',{headers:{'Content-Type':'application/json'},cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'reconciliation_load_failed');
    data=d;
    render();
  }

  function ledgerForYear(year){
    return (data?.financials||[]).filter(f=>f.status!=='cancelled'&&String(f.checkin||'').startsWith(`${year}-`));
  }
  function totalsByChannel(rows){
    const out={};
    for(const r of rows){const k=norm(r.channel);out[k]=(out[k]||0)+Number(r.gross_revenue||0)}
    return out;
  }
  function currentYear(){return Number(document.getElementById('finYear')?.textContent||new Date().getFullYear())}

  function render(){
    const host=document.getElementById('finReconciliation');
    if(!host||!data)return;
    const year=currentYear();
    if(year!==QB.year){
      host.innerHTML=`<div class="fin-rec-head"><div><h3>Financial reconciliation</h3><div class="meta">Source comparison</div></div><span class="fin-rec-status">${year}</span></div><div class="fin-rec-note">A QuickBooks snapshot is currently stored only for ${QB.year}. The live booking ledger remains available for ${year}, but no accounting snapshot is available for a like-for-like comparison.</div>`;
      return;
    }
    const rows=ledgerForYear(year),by=totalsByChannel(rows),ledgerGross=Object.values(by).reduce((a,b)=>a+b,0),difference=ledgerGross-QB.rentalIncome;
    const abs=Math.abs(difference),status=abs<100?'good':'warn',statusText=abs<100?'Aligned':'Review difference';
    const channels=[...new Set([...Object.keys(by),...Object.keys(QB.channels)])].sort((a,b)=>(by[b]||0)-(by[a]||0));
    host.innerHTML=`
      <div class="fin-rec-head"><div><h3>Financial reconciliation</h3><div class="meta">Live booking ledger vs. QuickBooks accounting snapshot</div></div><span class="fin-rec-status ${status}">${statusText}</span></div>
      <div class="fin-rec-grid">
        <div class="fin-rec-metric"><span>Booking ledger gross</span><b>${money(ledgerGross)}</b><small>${rows.length} tracked booking${rows.length===1?'':'s'} checking in during ${year}</small></div>
        <div class="fin-rec-metric"><span>QuickBooks rental income</span><b>${money(QB.rentalIncome)}</b><small>Snapshot through ${QB.asOf}</small></div>
        <div class="fin-rec-metric"><span>Ledger − QuickBooks</span><b>${money(difference)}</b><small>Timing, OTA fees, direct bookings, or missing entries can cause variance</small></div>
      </div>
      <div class="fin-rec-table">
        <div class="fin-rec-row head"><div>Channel</div><div class="num">Ledger gross</div><div class="num">QB recognized</div><div class="num">Difference</div></div>
        ${channels.map(k=>{const l=by[k]||0,q=QB.channels[k]||0,d=l-q;return `<div class="fin-rec-row"><div><strong>${esc(label(k))}</strong></div><div class="num">${money(l)}</div><div class="num">${money(q)}</div><div class="num"><strong>${money(d)}</strong></div></div>`}).join('')}
      </div>
      <div class="fin-source-strip"><span class="fin-source-chip"><strong>Booking ledger:</strong> live</span><span class="fin-source-chip"><strong>Calendar:</strong> live</span><span class="fin-source-chip"><strong>QuickBooks:</strong> snapshot ${QB.asOf}</span><span class="fin-source-chip"><strong>Debt:</strong> June 2025 closing disclosure</span></div>
      <div class="fin-rec-note">This is a reconciliation indicator, not an accounting adjustment. The booking ledger is organized by reservation/check-in and gross booking values; QuickBooks recognition can differ because of payout timing, OTA fees, categorization, refunds, and non-rental income. The dashboard intentionally keeps those sources separate rather than forcing them to match.</div>`;
  }

  function mount(){
    const shell=document.querySelector('#finance .fin-shell');
    if(!shell){setTimeout(mount,120);return}
    if(document.getElementById('finReconciliation'))return;
    const card=document.createElement('div');card.id='finReconciliation';card.className='fin-rec-card';
    const accounting=document.getElementById('finV2Accounting');
    if(accounting)accounting.after(card);else{const first=shell.querySelector('.fin-grid');first?shell.insertBefore(card,first):shell.appendChild(card)}
    const yearEl=document.getElementById('finYear');if(yearEl)new MutationObserver(render).observe(yearEl,{childList:true,subtree:true,characterData:true});
    fetchData().catch(e=>{card.innerHTML=`<div class="fin-rec-head"><div><h3>Financial reconciliation</h3><div class="meta">Source comparison</div></div><span class="fin-rec-status warn">Unavailable</span></div><div class="fin-rec-note">Could not load the owner financial ledger: ${esc(e.message)}</div>`});
  }
  mount();
})();
