/* Incentive Performance (2026-10-02). See the comment in index.html. */
(function(){
'use strict';
const E = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = document.getElementById('perfApp');
const U = window.kdhUser ? window.kdhUser() : null;
if(!U || U.role !== 'manager' || U.preview){
  app.innerHTML = `<div class="kdh-state unavailable"><b>Incentive Performance is for managers.</b><span>Financial results are not shown on rep pages.</span></div>`;
  return;
}
const H = window.KohlerHub;
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monLabel = k => { const [y, m] = String(k).split('-'); return m ? MON[+m-1]+' '+y : k; };
const isoMonth = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
function monthsIn(period){ const out = []; const d = new Date(period.start.getFullYear(), period.start.getMonth(), 1); while(d <= period.end){ out.push(isoMonth(d)); d.setMonth(d.getMonth()+1); } return out; }

// what exists on disk for a month (HEAD, managers may fetch these; reps are refused by the middleware)
const probe = new Map();
function has(path){ if(!probe.has(path)) probe.set(path, fetch(path, {method:'HEAD', cache:'no-store'}).then(r=>r.ok).catch(()=>false)); return probe.get(path); }

const METRICS = [
  ['Qualifying Sales', 'Revenue on sales that meet the program’s rules', 'line'],
  ['Cases', 'Qualifying cases, with explicit unit conversions', 'line'],
  ['Cost of Goods Sold', 'Laid-in cost of the qualifying sales', 'line'],
  ['Gross Profit', 'Qualifying sales minus cost of goods sold', 'line'],
  ['Gross Margin', 'Gross profit ÷ qualifying sales', 'line'],
  ['Incentive Costs', 'Rep payouts and program costs, shown separately', 'cost'],
  ['Supplier Reimbursements', 'Supplier funding for the program, shown separately', 'cost'],
  ['Estimated Incremental Gross Profit', 'Needs an agreed baseline / comparison method', 'base'],
  ['Estimated Net Contribution', 'Incremental gross profit minus defined program costs — not net income', 'base'],
];
const QUESTIONS = [
  ['Revenue', 'Is Fusion’s “$Vol” net of discounts and promotional pricing? Does it include excise or sales tax, or keg / bottle deposits?'],
  ['Cost', 'Is “Laid-In Cost” the cost of goods to use (does it include freight, state excise, or anything else)?'],
  ['Gross', 'Fusion’s Gross is not $Vol minus Laid-In on about half the rows. Which is authoritative, and what explains the difference?'],
  ['Returns and credits', 'Are returns and credits netted in the month they happen, or matched back to the original sale? Where do credits that are not product returns live?'],
  ['Discounts and allowances', 'Are depletion allowances, scan-backs or billbacks inside revenue, inside cost, or separate lines?'],
  ['Supplier reimbursements', 'Where is supplier funding for each program recorded, and should it offset cost or be shown as its own line?'],
  ['Reward costs', 'What is the source of rep payout amounts per program, and when is a payout counted (earned, approved or paid)?'],
  ['Participation', 'Which reps and accounts count as participating — everyone eligible, or only those with activity?'],
  ['Qualifying rules', 'May the trackers’ credited lines stand as “earned credit”? For “qualifying sales”, which products, packages and account conditions (e.g. 90-day non-buy) define each program?'],
  ['Baseline', 'For incremental results: same period last year, the period before, or non-participating accounts? How should seasonality be handled?'],
  ['Overlap', 'When one sale qualifies for two programs, should each program show it (with totals de-duplicated) or should it be split?'],
  ['Internal accounts', 'Out of Code, Breakage and Samples are kept out of sales. Should any of them count as a program cost?'],
];

async function render(){
  const progs = H.programs().filter(p=>p.type==='Incentive' || p.type==='MPO');
  const months = Array.from(new Set(progs.map(p=>p.monthKey))).sort().reverse();
  const h = new URLSearchParams(location.hash.slice(1));
  const month = months.includes(h.get('m')) ? h.get('m') : months[0];
  const inMonth = progs.filter(p=>p.monthKey===month).sort((a,b)=>(a.shortName||a.name).localeCompare(b.shortName||b.name));
  const pid = inMonth.some(p=>p.id===h.get('p')) ? h.get('p') : (inMonth[0] && inMonth[0].id);
  const p = inMonth.find(x=>x.id===pid);
  const pMonths = p ? monthsIn(p.period) : [];
  const cover = await Promise.all(pMonths.map(async m=>({m, money: await has('../rolling-distribution/data/master/money/'+m+'.csv'), adj: await has('../rolling-distribution/data/master/adjust/'+m+'.csv'), sales: await has('../rolling-distribution/data/master/months/'+m+'.csv')})));
  const moneyAll = cover.length && cover.every(c=>c.money);
  const credited = p && p.type==='Incentive' && p.forRep ? H.roster.some(rep=>{ try{ return (H.distFor ? H.distFor(p, rep) : []).length > 0; }catch(e){ return false; } }) : false;
  const why = {
    line: 'Needs invoice-level sales with revenue and cost for the program period, matched to the program’s rules' + (moneyAll ? '' : ' — Fusion’s monthly money file is not loaded for ' + cover.filter(c=>!c.money).map(c=>monLabel(c.m)).join(', ')),
    cost: 'Needs the program’s payout and supplier-funding records',
    base: 'Needs an agreed baseline method and the figures above',
  };
  app.innerHTML = `
    <header class="ws"><div class="id"><h1>Incentive Performance</h1><p class="idline">Gross profit on qualifying sales, by program and period · managers only</p></div></header>
    <div class="pf-controls">
      <label>Period <select id="pfMonth">${months.map(m=>`<option value="${m}"${m===month?' selected':''}>${E(monLabel(m))}</option>`).join('')}</select></label>
      <label>Program <select id="pfProg">${inMonth.map(x=>`<option value="${E(x.id)}"${x.id===pid?' selected':''}>${E(x.shortName||x.name)} · ${E(x.supplier)}</option>`).join('')}</select></label>
    </div>
    ${p ? `<p class="pf-prog"><b>${E(p.shortName||p.name)}</b> · ${E(p.supplier)} · ${E(p.channelLabel)} · ${E(p.period.label)}${p.shortName && p.shortName!==p.name ? `<br><span>Full program name: ${E(p.name)}</span>` : ''}</p>` : ''}
    <div class="kdh-state unavailable pf-banner"><b>Not calculable with current data.</b><span>The financial results below need the definitions confirmed and the reports listed under What Is Needed. Nothing is estimated in the meantime.</span></div>
    ${[['line','Qualifying Sales and Gross Profit'],['cost','Program Costs and Funding'],['base','Incremental Results (Estimates)']].map(([k, title])=>`<section class="sec pf-grp"><h2>${E(title)}</h2><p class="pf-why">${E(why[k])}.</p>
      <div class="pf-metrics">${METRICS.filter(m=>m[2]===k).map(([t, d])=>`<div class="pf-m"><p class="pf-mt">${E(t)}</p><p class="pf-mv">Not Calculable With Current Data</p><p class="pf-md">${E(d)}</p></div>`).join('')}</div></section>`).join('')}
    <section class="sec"><h2>Three Different Things</h2><div class="card"><dl class="pf-dl">
      <dt>Sales during the program period</dt><dd>Everything the participating accounts bought between the program’s start and end. Not a program result.</dd>
      <dt>Qualifying sales</dt><dd>Only the sales that meet the program’s own rules (products, packages, account conditions). An account’s other purchases are not qualifying sales just because it earned a placement.</dd>
      <dt>Sales that earned credit</dt><dd>The sales the tracker actually credited. ${p ? (credited ? 'The tracker publishes credited lines for this program.' : 'The tracker does not publish credited lines for this program, only totals.') : ''}</dd>
    </dl><p class="note">Gross profit on qualifying sales is not profit caused by the incentive. An incremental figure needs a documented baseline, and program contribution is not company net income.</p></div></section>
    <section class="sec"><h2>Data Coverage <small>for this program’s months</small></h2><div class="card"><table class="tbl pf-tbl"><thead><tr><th>Month</th><th>Cases by account (Fusion)</th><th>Revenue and cost (monthly)</th><th>Adjustments</th><th>Invoice lines</th><th>Program costs</th></tr></thead><tbody>
      ${cover.map(c=>`<tr><td><b>${E(monLabel(c.m))}</b></td><td data-l="Cases by account">${c.sales ? 'Loaded' : 'Not loaded'}</td><td data-l="Revenue and cost">${c.money ? 'Loaded' : 'Not loaded'}</td><td data-l="Adjustments">${c.adj ? 'Loaded' : 'Not loaded'}</td><td data-l="Invoice lines">Not available</td><td data-l="Program costs">Not available</td></tr>`).join('')}
    </tbody></table><p class="note">Monthly files say how much an account bought in a month, not which invoices met a rule on which day, so they cannot by themselves separate qualifying sales from the rest.</p></div></section>
    <section class="sec"><h2>Definitions to Confirm</h2><div class="card"><ol class="pf-q">${QUESTIONS.map(([t, q])=>`<li><b>${E(t)}.</b> ${E(q)}</li>`).join('')}</ol></div></section>
    <section class="sec"><h2>What Is Needed</h2><div class="card"><ul class="pf-need">
      <li><b>Invoice-level sales</b> for the program periods: invoice number and date, CustomerID, product number, quantity with unit, net revenue, cost, discounts, returns and credits as separate lines.</li>
      <li><b>Program payout records</b>: program, rep, amount, earned / approved / paid dates.</li>
      <li><b>Supplier funding</b>: program, supplier, amount, basis (per case, per placement, flat), date received.</li>
      <li><b>Each program’s qualifying rule</b> in data form: eligible products and packages, account conditions, dates.</li>
    </ul><p class="note">The full request, with fields and refresh timing, is in accounts/REPORTING_REQUEST.md (P1–P4).</p></div></section>
    <section class="sec"><h2>Supporting Transactions</h2><div class="kdh-state empty"><b>No transactions to show yet.</b><span>Qualifying transactions will be listed here, with their dates, once invoice-level data is loaded.</span></div></section>`;
  document.getElementById('pfMonth').addEventListener('change', e=>{ location.hash = 'm='+e.target.value; });
  document.getElementById('pfProg').addEventListener('change', e=>{ location.hash = 'm='+month+'&p='+encodeURIComponent(e.target.value); });
}
window.addEventListener('hashchange', render);
render().catch(e=>{ app.innerHTML = `<div class="kdh-state error"><b>Could not load programs.</b><span>${E(e.message||e)}</span></div>`; });
})();
