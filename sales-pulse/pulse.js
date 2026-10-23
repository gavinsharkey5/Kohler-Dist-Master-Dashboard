/* Manager-only monthly volume. No revenue, profit or incentive payouts are loaded. */
(function(){
  'use strict';
  const app=document.getElementById('pulse-app');
  const names={core:'Core Market',southern:'Southern District',other:'Other Areas',total:'Total'};
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(n,places=0)=>Number(n).toLocaleString('en-US',{maximumFractionDigits:places});
  const month=s=>new Date(s+'-01T12:00:00').toLocaleDateString('en-US',{month:'short',year:'numeric'});
  let data,mode='ytd',end,scope=null,kind='brands',direction='down';
  function delta(cur,prior){
    if(prior==null)return '';
    const n=cur-prior,cls=n>0?'up':n<0?'down':'flat',arrow=n>0?'↑':n<0?'↓':'→';
    const pct=prior>0?fmt(Math.abs(n)/prior*100,1)+'%':n===0?'0%':'No Prior Base';
    return `<div class="pulse-change ${cls}">${arrow} ${pct} vs ${data.year-1}</div>`;
  }
  function metric(label,key,a,b){return `<div><dt>${esc(label)}</dt><dd>${fmt(a[key])}</dd>${key==='new_buying_accounts'?'<small>First Seen in Loaded History</small>':delta(a[key],b[key])}</div>`;}
  function card(s,p){const a=p.scopes[s].current,b=p.scopes[s].prior;
    return `<section class="pulse-card ${s}" aria-label="${names[s]}"><h2>${names[s]}</h2><div class="pulse-hero"><span>Cases</span><strong>${fmt(a.cases)}</strong>${delta(a.cases,b.cases)}<small class="pulse-prior">${fmt(b.cases)} in ${data.year-1}</small></div>
      <dl class="pulse-metrics">${metric('Placements','placements',a,b)}${metric('Buying Accounts','buying_accounts',a,b)}${metric('New Buying Accounts','new_buying_accounts',a,b)}</dl>
      <button type="button" class="pulse-button" data-scope="${s}" aria-expanded="${scope===s}" aria-controls="pulse-detail">Review ${s==='total'?'Total':s==='core'?'Core':'Southern'}</button></section>`;
  }
  function chart(){
    const rows=data.trend.filter(r=>r.month<=end),values=rows.flatMap(r=>[r.current[scope],r.prior[scope]]);
    const hi=Math.max(1,...values),lo=Math.min(0,...values),y=n=>20+(hi-n)/(hi-lo)*120,zero=y(0);
    const step=700/rows.length,bar=Math.min(24,step/3);
    return `<div class="pulse-trend" role="img" aria-label="Monthly cases: ${data.year} compared with ${data.year-1}. Blue is ${data.year}; gray is ${data.year-1}."><svg viewBox="0 0 700 180" preserveAspectRatio="none" aria-hidden="true">${rows.map((r,i)=>{
      const x=(i+.5)*step-bar-1,now=y(r.current[scope]),old=y(r.prior[scope]);
      return `<rect class="last-year" x="${x}" y="${Math.min(zero,old)}" width="${bar}" height="${Math.abs(zero-old)}"/><rect class="this-year" x="${x+bar+2}" y="${Math.min(zero,now)}" width="${bar}" height="${Math.abs(zero-now)}"/>`;
    }).join('')}</svg><div class="pulse-trend-labels" style="--pulse-months:${rows.length}">${rows.map(r=>`<span>${month(r.month).split(' ')[0]}</span>`).join('')}</div></div><p class="pulse-note">Monthly Cases · Blue ${data.year} · Gray ${data.year-1}</p>`;
  }
  function detail(p){
    if(!scope)return '<section id="pulse-detail" hidden></section>';
    const rows=p.scopes[scope][kind][direction];
    return `<section class="pulse-detail" id="pulse-detail" aria-label="${names[scope]} Details"><div class="pulse-detail-head"><h2>${names[scope]} Details</h2><button type="button" class="pulse-button" data-close>Close Details</button></div>
      <h3>Monthly Cases</h3>${chart()}
      <div class="pulse-controls"><label>Show<select id="pulse-kind"><option value="brands"${kind==='brands'?' selected':''}>Brand Families</option><option value="accounts"${kind==='accounts'?' selected':''}>Accounts</option></select></label><label>Movement<select id="pulse-direction"><option value="down"${direction==='down'?' selected':''}>Cases Down</option><option value="up"${direction==='up'?' selected':''}>Cases Up</option></select></label></div>
      <h3>Top Changes · ${esc(p.label)}</h3><ul class="pulse-list">${rows.length?rows.map(r=>`<li><div><b>${esc(r.name)}</b><small>${kind==='accounts'?'Account #'+esc(r.id)+' · ':''}${fmt(r.current,1)} Cases vs ${fmt(r.prior,1)} Last Year</small></div><div class="pulse-amount"><span class="pulse-change ${r.change>0?'up':'down'}">${r.change>0?'↑':'↓'} ${fmt(Math.abs(r.change),1)} Cases</span></div></li>`).join(''):'<li>No changes in this period.</li>'}</ul>
      <details class="pulse-coverage"><summary>Monthly Values</summary><ul class="pulse-list">${data.trend.filter(r=>r.month<=end).map(r=>`<li><b>${esc(month(r.month))}</b><span>${fmt(r.current[scope],1)} vs ${fmt(r.prior[scope],1)} Cases</span></li>`).join('')}</ul></details>
    </section>`;
  }
  function render(focus){
    const p=data.periods[mode+':'+end],other=p.scopes.other.current;
    const months=[...new Set(Object.keys(data.periods).filter(k=>k.startsWith(mode+':')).map(k=>k.split(':')[1]))].sort().reverse();
    app.innerHTML=`<header class="pulse-head"><h1>Sales Pulse</h1><p>${esc(p.label)} vs ${esc(p.label.replace(String(data.year),String(data.year-1)))} · Sales Through ${esc(month(data.through))}</p></header>
      <div class="pulse-filters"><label>Period<select id="pulse-mode"><option value="ytd"${mode==='ytd'?' selected':''}>Year to Date</option><option value="month"${mode==='month'?' selected':''}>Month</option></select></label><label>${mode==='ytd'?'Through Month':'Month'}<select id="pulse-month">${months.map(m=>`<option value="${m}"${m===end?' selected':''}>${month(m)}</option>`).join('')}</select></label></div>
      <div class="pulse-cards">${['core','southern','total'].map(s=>card(s,p)).join('')}</div>
      <p class="pulse-note">Total includes Other Areas. Whole-market figures; each market is compared with its own prior year.</p>
      ${detail(p)}
      <details class="pulse-coverage"><summary>Coverage & Definitions</summary>
        <p>Complete monthly sales only. No daily, weekly or current-month estimate. Imported ${esc(data.exported||'date not supplied')}.${data.partial_excluded.length?' Partial months excluded: '+data.partial_excluded.map(esc).join(', ')+'.':''}</p>
        <p>Core: Bergen, Passaic, Passaic-FF, Sussex, Morris 1 and Morris 3. Southern: Essex, Hudson and Union. Other Areas includes Morris 2 and areas outside these groups. “Sales” areas use county. Current active-account geography is used where available; historical customers retain the sales master’s geography otherwise.</p>
        <p>Cases are net of returns. A placement is one account × product with net positive cases across the selected period. Buying accounts have net positive cases in that period. Year-to-date counts are distinct, not sums of monthly counts.</p>
        <p>New buying accounts first bought in the selected period within loaded history (${esc(month(data.history_start))} onward). Accounts already buying at the start of history are excluded. This is not a lifetime first order; no prior-year percentage is claimed.</p>
        <h3>Other Areas · ${esc(p.label)}</h3><dl>${[['Cases',other.cases],['Placements',other.placements],['Buying Accounts',other.buying_accounts],['New Buying Accounts',other.new_buying_accounts]].map(([k,n])=>`<div><dt>${k}</dt><dd>${fmt(n,k==='Cases'?2:0)}</dd></div>`).join('')}</dl>
        <p>Internal adjustments and finance charges are excluded. No revenue, profit or payout data is used. Program progress uses separate, newer source windows: <a href="../hub/">Open Incentives & MPOs</a>.</p>
      </details>`;
    if(focus)document.getElementById(focus)?.focus();
  }
  app.addEventListener('change',e=>{
    if(e.target.id==='pulse-mode'){mode=e.target.value;if(!data.periods[mode+':'+end])end=data.through;render('pulse-mode');}
    if(e.target.id==='pulse-month'){end=e.target.value;render('pulse-month');}
    if(e.target.id==='pulse-kind'){kind=e.target.value;render('pulse-kind');}
    if(e.target.id==='pulse-direction'){direction=e.target.value;render('pulse-direction');}
  });
  app.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.scope){scope=scope===b.dataset.scope?null:b.dataset.scope;render();if(scope){app.querySelector('[data-close]').focus({preventScroll:true});document.getElementById('pulse-detail').scrollIntoView({block:'start'});}else app.querySelector(`[data-scope="${b.dataset.scope}"]`)?.focus();}
    if(b.hasAttribute('data-close')){const old=scope;scope=null;render();app.querySelector(`[data-scope="${old}"]`)?.focus();}
  });
  async function boot(){
    let u;try{u=window.kdhUser&&window.kdhUser();}catch(e){}
    if(!u||u.role!=='manager'||u.preview){app.innerHTML='<p class="pulse-state">Sales Pulse Is Available to Managers Only.</p>';return;}
    try{
      const r=await fetch('data/pulse.json?v=20261023p4b',{cache:'no-store'});if(!r.ok)throw Error('Data request failed');
      data=await r.json();end=data.through;
      if(!data.periods[data.default])throw Error('No complete comparison');
      [mode,end]=data.default.split(':');render();
    }catch(e){app.innerHTML='<div class="pulse-state">Sales Pulse Could Not Load.<br><button class="pulse-button" id="pulse-retry">Try Again</button></div>';document.getElementById('pulse-retry').onclick=boot;}
  }
  boot();
})();
