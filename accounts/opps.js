/* PROGRAM OPPORTUNITIES (2026-10-03; renamed and re-ordered 2026-10-04).
   Account-level opportunities, kept apart from the rep's overall progress.

   build() is the calculation; it reads only what the trackers and the hub
   already decide -- no new rule is invented here:
     * a program is an OPPORTUNITY at this account only when the tracker lists
       the account as a target for the rep (hub targets: a WARM lead from the
       tracker's own opportunity list, or eligible and not yet buying), the
       program has not ended, and the brand is sellable in the account's area
       (the territory workbook, familyAllowed);
     * CREDITED = the tracker credited this account (credited lines) -- shown
       as "already earned credit", never as an opportunity;
     * every other active program is listed under "Doesn't apply here" with
       the tracker's own reason (not sellable / already buying / not on its
       lists / awaiting data).
   Products = hub/accounts.js eligibleProducts(): the program's own product
   rule when it has one (PROGRAM_PRODUCTS -- Lagunitas Sprint counts IPA and
   Little Sumpin' only, as its export does), otherwise the catalogue rows in
   its brand families (PROGRAM_BRANDS) narrowed to a size the program names
   ("24 oz"); always only families sellable in the area. The same rule tags
   "Lead" rows in the Products list and feeds the assistant's page context,
   so the three never disagree.
   CARD ORDER (Gavin, 2026-10-04): Program -> What to Sell -> What Is Needed
   -> Deadline; why it is listed, credit, the products, resources and the
   rep's overall progress sit in one "Details" fold. "Add Evidence" opens the
   photo flow with the program and a category preselected; saved evidence is
   NOT credit -- credit comes only from the tracker's sales data.
   Inventory is the warehouse SNAPSHOT in catalog.json with its date -- never
   called live. Pitch: there is no approved customer pitch in the data (the
   registries' `pitch` lines are rep-incentive summaries, some with payouts),
   so none is shown -- the card says so.

   render*() turn the result into HTML; nothing here fetches a file. */
(function(){
'use strict';
const E = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtN = n => (Math.round(Number(n||0)*10)/10).toLocaleString('en-US');
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dayLabel = iso => { if(!iso) return ''; const d = new Date(iso+'T12:00:00'); return isNaN(d) ? iso : MON[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear(); };

// size a program names, e.g. "Keystone Ice 24 oz Cans" -> "24"
function sizeOf(text){ const m = /(\d+(?:\.\d+)?)\s?(?:oz|ounce)/i.exec(String(text||'')); return m ? m[1] : ''; }

// "no purchases" from the hub (old and new wording) -- not a reason worth repeating
const noBuy = w => /^(Never bought it|No purchases in the available history)/.test(String(w||''));
// the products a program counts (hub/accounts.js eligibleProducts), memoised per program
const ELMEMO = new Map();
function eligibleFor(p, CAT, HB, famKey){
  const k = p.id; if(ELMEMO.has(k) && ELMEMO.get(k).cat===CAT) return ELMEMO.get(k).v;
  const rows = (CAT && CAT.products) || [];
  const v = HB && HB.eligibleProducts ? HB.eligibleProducts(p, rows, famKey) : {rows: [], rule: '', byProduct: false};
  ELMEMO.set(k, {cat: CAT, v}); return v;
}
// a sensible photo category for evidence: draft/keg -> tap handles; on-premise -> menu; else a display
function evidenceCat(o, prem){
  const t = (o.ask+' '+o.full+' '+o.channel).toLowerCase();
  if(/\b(keg|draft|draught|tap|handle)\b/.test(t) && prem!=='Off') return 'tap_handle';
  if(prem==='On' || /on-?prem/.test(t)) return 'menu';
  return 'display';
}

function build(o){
  const {a, rep, k, programs, credited, targets, H, HB, CAT, famKey, familyAllowed, today} = o;
  const out = {list:[], credited:[], other:[]};
  const inv = (CAT && CAT.inventory) || {};
  const asOf = inv.asOf || '';
  const ageDays = asOf ? Math.round((today - new Date(asOf+'T00:00:00'))/86400000) : null;
  programs.forEach(p=>{
    const r = p.forRep(rep); if(!r) return;
    if(p.period && p.period.end && p.period.end < today) return;          // ended
    const cred = credited.filter(c=>c.p===p);
    const tgt = targets.find(t=>t.p===p);
    const A = H.accountsFor(p, rep) || {};
    const excl = (A.excluded||[]).concat(A.unknown||[]).find(x=>String(x.n)===k);
    const buying = (A.buying||[]).find(x=>String(x.n)===k);
    const fams = (HB && HB.PROGRAM_BRANDS && HB.PROGRAM_BRANDS[HB.brandKey(p)]) || [];
    const ask = H.sellAsk(p);
    const facts = H.progFacts(p, r, rep) || {};
    const base = {id:p.id, p, name:p.shortName||p.name, full:p.name, supplier:p.supplier, channel:p.channelLabel, type:p.type, month:p.monthLabel||'',
      ends:H.endsLabel(p.period), end:p.period && p.period.end, ask, fams,
      repProgress:[facts.main, facts.need].filter(Boolean).join(' · '), whose:o.whose};
    if(cred.length){ out.credited.push(Object.assign(base, {status:'credited', lines:cred.map(c=>[c.what||'Credited', c.date||''].filter(Boolean).join(' · '))})); return; }
    if(!tgt){
      out.other.push(Object.assign(base, {status: excl ? 'not sellable' : buying ? 'already buying' : r.soon ? 'awaiting data' : 'not on its lists',
        why: excl ? (excl.why || 'The brand cannot be sold in this account’s area.') : buying ? 'Already buys the brand, so it is not a new placement for this program — no credit recorded here yet.' : r.soon ? 'The tracker has no data for this program yet.' : 'The tracker does not list this account for this program.'}));
      return;
    }
    // eligible products: ONE definition, shared with the Products list and the assistant
    const EL = eligibleFor(p, CAT, HB, famKey);
    let prods = EL.rows.filter(c=>familyAllowed(c[3], a.area).ok);
    const size = EL.byProduct ? '' : sizeOf(p.name+' '+ask);
    let sizeNote = EL.byProduct ? EL.rule : '';
    if(size){ const re = new RegExp('(^|[^0-9.])'+size.replace('.', '\\.')+'\\s?oz', 'i'); const narrowed = prods.filter(c=>re.test(c[1]+' '+c[4])); if(narrowed.length){ prods = narrowed; sizeNote = size+' oz'; } }
    prods.sort((x,y)=>(Number(y[5])||0)-(Number(x[5])||0) || String(x[1]).localeCompare(String(y[1])));
    const pkgs = Array.from(new Set(prods.map(c=>c[4]).filter(Boolean)));
    const sheets = prods.filter(c=>c[10]).map(c=>({name:c[1], url:c[10]}));
    out.list.push(Object.assign(base, {status: tgt.warm ? 'lead' : 'eligible', warm: !!tgt.warm,
      needs: noBuy(tgt.why) ? '' : (tgt.why || ''), byProduct: EL.byProduct, products: prods.slice(0, 40), productCount: prods.length, sizeNote, packages: pkgs, sheets,
      inventory: {asOf, ageDays, stale: ageDays!=null && ageDays > 7},
      why: tgt.warm ? 'On the tracker’s own opportunity list for '+rep.split(' ')[0]+(tgt.why ? ' — '+tgt.why : '')+'.' : 'Eligible here: in the program’s territory and not buying the brand now'+(tgt.why && !noBuy(tgt.why) ? ' ('+tgt.why+')' : '')+'.'}));
  });
  // warm leads first, then the soonest deadline
  out.list.sort((x,y)=>(y.warm - x.warm) || ((x.end||0) - (y.end||0)));
  return out;
}

/* ---------------- render ---------------- */
function statusTag(o){ return o.status==='lead' ? '<span class="tag go">Lead</span>' : o.status==='eligible' ? '<span class="tag">Eligible</span>' : o.status==='credited' ? '<span class="tag ok">Credit Earned</span>' : `<span class="tag na">${E(o.status.replace(/\b\w/g, c=>c.toUpperCase()))}</span>`; }
function invLine(o, c){
  const n = Number(c[5]);
  const snap = o.inventory.asOf ? `warehouse snapshot ${dayLabel(o.inventory.asOf)}${o.inventory.ageDays!=null ? ' ('+o.inventory.ageDays+' days old)' : ''}` : 'warehouse snapshot, date unknown';
  return `${isNaN(n) ? 'No stock figure' : `<b>${fmtN(n)} ${n===1?'unit':'units'}</b>`} · ${E(snap)}`;
}
function resourcesInner(o){
  const top = o.products.slice(0, 3);
  const prodRows = top.map(c=>`<li><span class="op-pn">${E(c[1])}</span><span class="op-pi">${invLine(o, c)}</span></li>`).join('');
  return `<div class="op-r"><p class="op-rh">Approved Quick Pitch</p><p class="op-miss">No approved pitch on file for this program. The program sheets in the data are rep incentive summaries, not customer pitches.</p></div>
    <div class="op-r"><p class="op-rh">Sell Sheet</p>${o.sheets.length ? `<ul class="op-links">${o.sheets.slice(0, 4).map(s=>`<li><a href="${E(s.url)}" target="_blank" rel="noopener">${E(s.name)} · Sell Sheet (PDF)</a></li>`).join('')}</ul>` : `<p class="op-miss">No sell sheet on file for ${E(o.fams.join(' / ') || 'this brand')}. Sell sheets are loaded for Carbliss only so far.</p>`}</div>
    <div class="op-r"><p class="op-rh">Package Options</p>${o.packages.length ? `<p>${o.packages.slice(0, 8).map(E).join(' · ')}${o.packages.length>8 ? ` · ${o.packages.length-8} more` : ''}</p>` : `<p class="op-miss">No catalogue products mapped to this program.</p>`}</div>
    <div class="op-r"><p class="op-rh">Stock at Kohler’s Warehouse</p>${top.length ? `<ul class="op-prods">${prodRows}</ul>${o.inventory.stale ? `<p class="op-rs"><span class="kdh-tag stale">Snapshot is ${o.inventory.ageDays} days old</span> Not live availability — check Encompass before promising quantities.</p>` : `<p class="op-rs">Snapshot, not live availability.</p>`}` : `<p class="op-miss">No eligible products in the catalogue.</p>`}</div>`;
}
function cardHtml(o, links){
  const meta = `${E(o.supplier)} · ${E(o.channel)}${o.type==='MPO' ? ' · '+E(o.month)+' MPO' : ''}`;
  if(o.status==='credited') return `<div class="op k-cred"><div class="op-h"><span class="op-t">${E(o.name)}</span>${statusTag(o)}</div>
    <p class="op-m">${meta} · ${E(o.ends)}</p>
    <p class="op-l">${o.lines.map(E).join('<br>')}</p>
    <p class="op-a"><a href="${E(links.prog(o))}">Open Tracker ›</a></p></div>`;
  if(o.status!=='lead' && o.status!=='eligible') return `<div class="op k-other"><div class="op-h"><span class="op-t">${E(o.name)}</span>${statusTag(o)}</div>
    <p class="op-m">${E(o.supplier)} · ${E(o.ends)}</p><p class="op-l">${E(o.why)}</p></div>`;
  const what = o.productCount ? (o.byProduct ? `${E(o.sizeNote)}` : `${E(o.fams.join(' / '))}${o.sizeNote ? ' · '+E(o.sizeNote) : ''}`) + ` — ${o.productCount} ${o.productCount===1?'product':'products'} sellable here` : E(o.ask);
  const need = o.needs ? E(o.needs) : 'A first qualifying purchase at this account';
  const evid = links.evidence ? `<button type="button" class="btn outline sm" data-evid="${E(o.id)}" data-ecat="${E(evidenceCat(o, links.prem))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Add Evidence</button>` : '';
  return `<div class="op k-${o.status}">
    <div class="op-h"><span class="op-t">${E(o.name)}</span>${statusTag(o)}</div>
    <p class="op-m">${meta}</p>
    <dl class="op-kv">
      <dt>What to Sell</dt><dd>${E(o.ask)}</dd>
      <dt>What Is Needed</dt><dd>${need}</dd>
      <dt>Deadline</dt><dd><b>${E(o.ends)}</b></dd>
    </dl>
    <details class="op-res"><summary>Details</summary><div class="op-rb">
      <div class="op-r"><p class="op-rh">Why It’s Listed Here</p><p>${E(o.why)}</p></div>
      <div class="op-r"><p class="op-rh">Credit at This Account</p><p>Not earned yet. Credit comes from the tracker’s sales data — a saved photo or note is evidence, not credit.</p></div>
      <div class="op-r"><p class="op-rh">Products That Count</p><p>${what}${o.productCount && o.products[0] ? `, e.g. ${E(o.products[0][1])}` : ''}</p>${o.productCount ? `<a class="btn outline sm" href="#" data-pq="${E(o.fams[0]||'')}" data-pprog="${E(o.id)}">View ${o.productCount} Eligible ${o.productCount===1?'Product':'Products'}</a>` : ''}</div>
      ${resourcesInner(o)}
      <div class="op-r"><p class="op-rh">Full Program Name</p><p>${E(o.full)}</p></div>
      ${o.repProgress ? `<div class="op-r"><p class="op-rh">${E(o.whose||'Your')} Overall Progress (All Accounts)</p><p>${E(o.repProgress)}</p></div>` : ''}
    </div></details>
    <p class="op-a"><a class="btn sm" href="${E(links.prog(o))}">Open Tracker</a>${evid}${links.acct ? `<a class="btn ghost sm" href="${E(links.acct(o))}">Account in the Hub</a>` : ''}</p>
  </div>`;
}
function overviewHtml(res, links, allHref){
  const top = res.list.slice(0, 3);
  if(!top.length) return `<div class="card op-empty"><p>No active program lists this account as an opportunity right now.${res.credited.length ? ` It has already earned credit on ${res.credited.length} ${res.credited.length===1?'program':'programs'}.` : ''}</p><a class="btn outline wide" href="${E(allHref)}" data-go="more:programs">View All Programs</a></div>`;
  return `<div class="ops">${top.map(o=>cardHtml(o, links)).join('')}</div>
    <a class="btn outline wide" href="${E(allHref)}" data-go="more:programs">View All Program Opportunities · ${res.list.length}${res.credited.length ? ', '+res.credited.length+' credited' : ''}</a>`;
}
function fullHtml(res, links){
  return `${res.list.length ? `<div class="ops">${res.list.map(o=>cardHtml(o, links)).join('')}</div>` : `<div class="kdh-state empty slim"><b>No program lists this account as an opportunity right now.</b></div>`}
    ${res.credited.length ? `<h3 class="op-gh">Already Earned Credit · ${res.credited.length}</h3><div class="ops">${res.credited.map(o=>cardHtml(o, links)).join('')}</div>` : ''}
    ${res.other.length ? `<details class="fold op-other"><summary>Programs That Don’t Apply Here · ${res.other.length}</summary><div class="ops">${res.other.map(o=>cardHtml(o, links)).join('')}</div></details>` : ''}
    <p class="note">An opportunity is a program whose tracker lists this account for the rep (a lead from its opportunity list, or eligible and not yet buying), the brand is sellable in this area, and the program has not ended. The rep’s overall progress is shown separately on each card and is not this account’s qualification.</p>`;
}
window.KdhOpps = {build, overviewHtml, fullHtml, cardHtml, eligibleFor, evidenceCat, _sizeOf: sizeOf};
})();
