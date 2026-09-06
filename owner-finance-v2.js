(()=>{
  const root=document.documentElement;
  if(root.dataset.financeV2Loaded)return;
  root.dataset.financeV2Loaded='1';

  const QB_SNAPSHOT={
    asOf:'September 4, 2026',
    period:'Jan 1 – Sep 4, 2026',
    income:25669.77,
    grossProfit:19884.82,
    noi:10484.22,
    netIncome:10734.32,
    margin:41.8,
    cleaning:5700,
    repairs:4199.28,
    utilities:3457.84,
    insurance:736.11,
    software:1007.37
  };
  const DEBT={loan:541500,rate:7.75,pi:3879.37,escrow:1313.14,total:5192.51,annualEscrow:15757.68,closingCosts:33738.23};
  const PROJECTION={adr:358,occupancy:48,revenue:62800};
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v||0));
  const oneDecimal=v=>`${Number(v||0).toFixed(1)}%`;

  const style=document.createElement('style');
  style.textContent=`
    #finance{--fin-dark:#102f35;--fin-teal:#315d64;--fin-gold:#9a6b00;--fin-bg:#f4f1ea}
    #finance .fin-shell{gap:18px}
    #finance .fin-head{padding:4px 2px 2px}
    #finance .fin-head h2{font-family:Georgia,serif;font-size:clamp(2rem,3.5vw,3.1rem);font-weight:500;letter-spacing:-.035em;color:var(--fin-dark)}
    #finance .fin-head .meta{max-width:730px;line-height:1.5}
    #finance .fin-kpis{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    #finance .fin-kpi{border-radius:20px;padding:18px 19px;min-height:118px;box-shadow:0 12px 30px rgba(13,43,49,.055)}
    #finance .fin-kpi span{font-size:.72rem;text-transform:uppercase;letter-spacing:.055em}
    #finance .fin-kpi b{font-family:Georgia,serif;font-weight:500;font-size:1.8rem;margin-top:10px;color:var(--fin-dark)}
    #finance .fin-grid{gap:16px}
    #finance .fin-card{border-radius:21px;padding:20px;box-shadow:0 12px 34px rgba(13,43,49,.05)}
    #finance .fin-card h3{font-family:Georgia,serif;font-weight:500;font-size:1.35rem;color:var(--fin-dark)}
    .fin-v2-section{display:grid;grid-template-columns:1.18fr .82fr;gap:16px}
    .fin-v2-card{background:#fff;border:1px solid var(--line);border-radius:21px;padding:20px;box-shadow:0 12px 34px rgba(13,43,49,.05)}
    .fin-v2-card h3{font-family:Georgia,serif;font-weight:500;font-size:1.35rem;margin:0;color:var(--fin-dark)}
    .fin-v2-eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:.67rem;font-weight:900;color:var(--muted);margin-bottom:5px}
    .fin-v2-sub{font-size:.78rem;color:var(--muted);margin-top:5px}
    .fin-v2-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}
    .fin-v2-metric{border:1px solid var(--line);border-radius:15px;padding:13px;background:#fbfcfb}
    .fin-v2-metric span{display:block;font-size:.68rem;text-transform:uppercase;letter-spacing:.045em;color:var(--muted);font-weight:850}
    .fin-v2-metric b{display:block;font-size:1.25rem;margin-top:7px;color:var(--fin-dark)}
    .fin-v2-metric small{display:block;color:var(--muted);font-size:.7rem;margin-top:3px}
    .fin-v2-expenses{display:grid;gap:10px;margin-top:16px}.fin-v2-expense{display:grid;grid-template-columns:140px 1fr auto;align-items:center;gap:9px;font-size:.78rem}.fin-v2-bar{height:8px;background:#edf1f0;border-radius:999px;overflow:hidden}.fin-v2-bar i{display:block;height:100%;background:var(--fin-teal);border-radius:999px}
    .fin-v2-debt-hero{background:var(--fin-dark);color:#fff;border-radius:18px;padding:18px;margin-top:15px}.fin-v2-debt-hero span{font-size:.72rem;text-transform:uppercase;letter-spacing:.065em;color:rgba(255,255,255,.68)}.fin-v2-debt-hero b{display:block;font-family:Georgia,serif;font-size:2rem;font-weight:500;margin:6px 0}.fin-v2-debt-hero small{color:rgba(255,255,255,.72)}
    .fin-v2-debt-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:10px}.fin-v2-debt-item{border:1px solid var(--line);border-radius:14px;padding:12px}.fin-v2-debt-item span{display:block;color:var(--muted);font-size:.68rem;text-transform:uppercase;font-weight:850;letter-spacing:.04em}.fin-v2-debt-item b{display:block;margin-top:5px;color:var(--fin-dark)}
    .fin-v2-benchmark{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;padding:15px 17px;border:1px solid #e8dfca;background:#fffaf0;border-radius:16px;margin-top:14px}.fin-v2-benchmark b{font-family:Georgia,serif;font-size:1.35rem;color:#65480a}.fin-v2-benchmark span{font-size:.74rem;color:#765e2c}
    .fin-v2-note{font-size:.72rem;color:var(--muted);line-height:1.5;margin-top:12px}
    @media(max-width:1000px){.fin-v2-section{grid-template-columns:1fr}#finance .fin-kpis{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:650px){#finance .fin-kpis{grid-template-columns:1fr 1fr}.fin-v2-metrics{grid-template-columns:1fr 1fr}.fin-v2-expense{grid-template-columns:110px 1fr auto}.fin-v2-debt-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  function waitForFinance(){
    const shell=document.querySelector('#finance .fin-shell');
    if(!shell){setTimeout(waitForFinance,120);return}
    if(document.getElementById('finV2Accounting'))return;

    const accounting=document.createElement('div');
    accounting.id='finV2Accounting';
    accounting.className='fin-v2-section';
    const maxExpense=Math.max(QB_SNAPSHOT.cleaning,QB_SNAPSHOT.repairs,QB_SNAPSHOT.utilities,QB_SNAPSHOT.insurance,QB_SNAPSHOT.software);
    const expense=(name,val)=>`<div class="fin-v2-expense"><span>${name}</span><div class="fin-v2-bar"><i style="width:${Math.max(4,val/maxExpense*100)}%"></i></div><strong>${money(val)}</strong></div>`;
    accounting.innerHTML=`
      <div class="fin-v2-card">
        <div class="fin-v2-eyebrow">Accounting snapshot · QuickBooks</div>
        <h3>Property operating performance</h3>
        <div class="fin-v2-sub">CJT Real Estate Holdings · ${QB_SNAPSHOT.period}</div>
        <div class="fin-v2-metrics">
          <div class="fin-v2-metric"><span>Total income</span><b>${money(QB_SNAPSHOT.income)}</b><small>QuickBooks P&L</small></div>
          <div class="fin-v2-metric"><span>Net operating income</span><b>${money(QB_SNAPSHOT.noi)}</b><small>Before other income</small></div>
          <div class="fin-v2-metric"><span>Net income</span><b>${money(QB_SNAPSHOT.netIncome)}</b><small>${oneDecimal(QB_SNAPSHOT.margin)} net margin</small></div>
        </div>
        <div class="fin-v2-expenses">
          ${expense('Cleaning',QB_SNAPSHOT.cleaning)}
          ${expense('Repairs',QB_SNAPSHOT.repairs)}
          ${expense('Utilities',QB_SNAPSHOT.utilities)}
          ${expense('Software',QB_SNAPSHOT.software)}
          ${expense('Insurance',QB_SNAPSHOT.insurance)}
        </div>
        <div class="fin-v2-note">Accounting figures are a QuickBooks snapshot through ${QB_SNAPSHOT.asOf}. They are not yet live-synced into the owner portal; booking-ledger revenue above remains the portal's live operational dataset.</div>
      </div>
      <div class="fin-v2-card">
        <div class="fin-v2-eyebrow">Capital structure</div>
        <h3>Debt service & underwriting</h3>
        <div class="fin-v2-debt-hero"><span>Estimated monthly housing payment</span><b>${money(DEBT.total)}</b><small>${money(DEBT.pi)} principal & interest + approximately ${money(DEBT.escrow)} escrow</small></div>
        <div class="fin-v2-debt-grid">
          <div class="fin-v2-debt-item"><span>Loan amount</span><b>${money(DEBT.loan)}</b></div>
          <div class="fin-v2-debt-item"><span>Interest rate</span><b>${DEBT.rate.toFixed(2)}%</b></div>
          <div class="fin-v2-debt-item"><span>Annual escrow estimate</span><b>${money(DEBT.annualEscrow)}</b></div>
          <div class="fin-v2-debt-item"><span>Refi closing costs</span><b>${money(DEBT.closingCosts)}</b></div>
        </div>
        <div class="fin-v2-benchmark"><div><span>Original project underwriting benchmark</span><br><b>${money(PROJECTION.revenue)} annual revenue</b></div><strong>${money(PROJECTION.adr)} ADR<br>${PROJECTION.occupancy}% occ.</strong></div>
        <div class="fin-v2-note">Loan figures are based on the June 2025 Champions Funding closing disclosure. The underwriting benchmark is historical planning data, not a live market forecast.</div>
      </div>`;

    const firstGrid=shell.querySelector('.fin-grid');
    if(firstGrid)shell.insertBefore(accounting,firstGrid);
    else shell.appendChild(accounting);

    const headText=shell.querySelector('.fin-head .meta');
    if(headText)headText.textContent='Revenue, occupancy, collection status, operating performance, and debt service for Sand & Sea Manor.';
  }
  waitForFinance();
})();
