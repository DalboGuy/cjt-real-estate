(()=>{
  const root=document.documentElement;
  if(root.dataset.financePeriodsLoaded)return;
  root.dataset.financePeriodsLoaded='1';

  const PERIODS={
    ytd:{label:'YTD',period:'Jan 1 – Sep 4, 2026',income:25669.77,noi:10484.22,netIncome:10734.32,margin:41.8,grossMargin:77.5},
    t12:{label:'Trailing 12',period:'Sep 5, 2025 – Sep 4, 2026',income:33489.75,noi:10143.23,netIncome:16741.67,margin:50.0,grossMargin:75.1}
  };
  const CASH={period:'Jan 1 – Sep 4, 2026',operating:21292.08,investing:-26587.09,financing:-94907.05,netChange:-100202.06,endingCash:-77176.32,principalPaid:-8427.42,interestPaid:-76983.04,escrow:-28911.14};
  const DEBT={monthly:5192.51};
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v||0));
  const pct=v=>`${Number(v||0).toFixed(1)}%`;

  const style=document.createElement('style');
  style.textContent=`
    .fin-period-card{background:#fff;border:1px solid var(--line);border-radius:21px;padding:20px;box-shadow:0 12px 34px rgba(13,43,49,.05)}
    .fin-period-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.fin-period-top h3{font-family:Georgia,serif;font-weight:500;font-size:1.35rem;margin:0;color:#102f35}
    .fin-period-toggle{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:3px;background:#f8fbfa}.fin-period-toggle button{border:0;background:transparent;border-radius:999px;padding:7px 11px;font-weight:850;color:var(--muted);cursor:pointer}.fin-period-toggle button.active{background:#102f35;color:#fff}
    .fin-period-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:16px}.fin-period-metric{border:1px solid var(--line);border-radius:15px;padding:13px;background:#fbfcfb}.fin-period-metric span{display:block;color:var(--muted);font-size:.67rem;font-weight:850;text-transform:uppercase;letter-spacing:.05em}.fin-period-metric b{display:block;font-size:1.3rem;margin-top:7px;color:#102f35}.fin-period-metric small{display:block;color:var(--muted);font-size:.7rem;margin-top:3px}
    .fin-cash-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:14px}.fin-cash-metric{border:1px solid var(--line);border-radius:15px;padding:13px}.fin-cash-metric span{display:block;color:var(--muted);font-size:.67rem;font-weight:850;text-transform:uppercase}.fin-cash-metric b{display:block;font-size:1.22rem;margin-top:7px}.fin-cash-metric.negative b{color:#9d2f2f}.fin-cash-metric.positive b{color:#1f5b39}
    .fin-debt-strip{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}.fin-debt-strip div span{display:block;color:var(--muted);font-size:.67rem;text-transform:uppercase;font-weight:850}.fin-debt-strip div b{display:block;margin-top:4px;color:#102f35}
    .fin-period-note{font-size:.72rem;color:var(--muted);line-height:1.5;margin-top:12px}
    @media(max-width:1000px){.fin-period-grid,.fin-cash-grid{grid-template-columns:repeat(3,1fr)}.fin-debt-strip{grid-template-columns:1fr 1fr}}
    @media(max-width:650px){.fin-period-grid,.fin-cash-grid{grid-template-columns:1fr 1fr}.fin-debt-strip{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  function metric(label,value,small){return `<div class="fin-period-metric"><span>${label}</span><b>${value}</b><small>${small}</small></div>`}
  function renderPeriod(key){
    const p=PERIODS[key]||PERIODS.ytd,host=document.getElementById('finPeriodMetrics');if(!host)return;
    document.querySelectorAll('.fin-period-toggle button').forEach(b=>b.classList.toggle('active',b.dataset.period===key));
    document.getElementById('finPeriodLabel').textContent=p.period;
    host.innerHTML=[
      metric('Total income',money(p.income),'QuickBooks P&L'),
      metric('Net operating income',money(p.noi),'Before other income'),
      metric('Net income',money(p.netIncome),'QuickBooks P&L'),
      metric('Net margin',pct(p.margin),'Reported margin'),
      metric('Gross margin',pct(p.grossMargin),'Reported margin')
    ].join('');
  }

  function mount(){
    const shell=document.querySelector('#finance .fin-shell');
    if(!shell){setTimeout(mount,120);return}
    if(document.getElementById('finPeriodCard'))return;
    const card=document.createElement('div');card.id='finPeriodCard';card.className='fin-period-card';
    card.innerHTML=`
      <div class="fin-period-top"><div><h3>Accounting period view</h3><div class="meta" id="finPeriodLabel"></div></div><div class="fin-period-toggle"><button class="active" data-period="ytd" type="button">YTD</button><button data-period="t12" type="button">Trailing 12</button></div></div>
      <div id="finPeriodMetrics" class="fin-period-grid"></div>
      <div class="fin-period-note">QuickBooks accounting values are stored snapshots through September 4, 2026. The period control changes the accounting comparison only; live reservation metrics above remain tied to the selected booking year.</div>`;

    const cash=document.createElement('div');cash.id='finCashCard';cash.className='fin-period-card';
    const annualDebt=DEBT.monthly*12;
    cash.innerHTML=`
      <div class="fin-period-top"><div><h3>Cash flow after financing</h3><div class="meta">QuickBooks Statement of Cash Flows · ${CASH.period}</div></div><span class="fin-rec-status warn">Accounting review</span></div>
      <div class="fin-cash-grid">
        <div class="fin-cash-metric positive"><span>Operating activities</span><b>${money(CASH.operating)}</b></div>
        <div class="fin-cash-metric negative"><span>Investing activities</span><b>${money(CASH.investing)}</b></div>
        <div class="fin-cash-metric negative"><span>Financing activities</span><b>${money(CASH.financing)}</b></div>
        <div class="fin-cash-metric negative"><span>Net cash change</span><b>${money(CASH.netChange)}</b></div>
        <div class="fin-cash-metric negative"><span>Ending cash</span><b>${money(CASH.endingCash)}</b></div>
      </div>
      <div class="fin-debt-strip">
        <div><span>Scheduled monthly housing payment</span><b>${money(DEBT.monthly)}</b></div>
        <div><span>Annualized scheduled housing payment</span><b>${money(annualDebt)}</b></div>
        <div><span>QB principal paid YTD</span><b>${money(Math.abs(CASH.principalPaid))}</b></div>
        <div><span>QB interest + escrow YTD</span><b>${money(Math.abs(CASH.interestPaid)+Math.abs(CASH.escrow))}</b></div>
      </div>
      <div class="fin-period-note">The cash-flow statement already includes financing activity, so the net cash change shown here is after operating, investing, and financing movements recorded in QuickBooks. The unusually large financing outflow and negative ending cash make reconciliation a priority before using this view for owner distributions or underwriting decisions.</div>`;

    const reconciliation=document.getElementById('finReconciliation');
    if(reconciliation){reconciliation.after(cash);reconciliation.after(card)}
    else{const accounting=document.getElementById('finV2Accounting');if(accounting){accounting.after(cash);accounting.after(card)}else shell.prepend(cash,card)}
    card.querySelectorAll('.fin-period-toggle button').forEach(b=>b.addEventListener('click',()=>renderPeriod(b.dataset.period)));
    renderPeriod('ytd');
  }
  mount();
})();
