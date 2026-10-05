/* PROGRAM ELIGIBILITY (2026-10-05) -- the browser side of tools/program_eligibility.py.

   ONE calculation, read by every page that talks about a program at the
   account level -- the hub's program workspace (Eligible Accounts /
   Qualifying Products / Credited Results), the Account page's Program
   Opportunities, the Products list's program filter and the assistant's
   page context. Nothing here re-derives a rule: the generator joins the
   tracker's own exports to the sales record on CustomerID + ProductID and
   writes the result; this file only reads, filters and counts it.

     shared/data/program-rules.json   rules + qualifying products (no customer data)
     accounts/data/elig/<key>.json    one rep's accounts -- the middleware serves
                                      a rep only their own file; a manager may
                                      load any (team scope is applied by the page,
                                      as everywhere else)

   KdhElig.ready()               -> Promise (rules + rep index)
   KdhElig.rule(programId)        -> the rule, or null when the program has none yet
   KdhElig.load(repName)          -> Promise<rep file | null>
   KdhElig.model(programId, [{rep, data}])
        -> {rule, accounts, products, credited, totals}   (see below)
   KdhElig.forAccount(n, data)    -> [{rule, account}] for every program that has one
   KdhElig.productIds(programId)  -> Set of qualifying ProductIDs
   KdhElig.reasonText(...)        -> plain-language reason lines

   Four concepts are kept apart everywhere:
     product   (rule.products)           a Qualifying Product
     account   (model.accounts)          an Eligible Account
     open      (account.op / account.need) a Remaining Opportunity
     credited  (account.cr, totals)      a Credited Result
*/
(function (global) {
  'use strict';
  const base = (function () {
    try { const s = document.currentScript && document.currentScript.src; if (s) return s.replace(/shared\/eligibility\.js.*$/, ''); } catch (e) {}
    return '../';
  })();
  let RULES = null, INDEX = null, READY = null;
  const files = new Map();
  function getJSON(url) {
    return fetch(url, { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null);
  }
  function ready() {
    if (!READY) READY = Promise.all([getJSON(base + 'shared/data/program-rules.json'), getJSON(base + 'accounts/data/index.json')])
      .then(([r, i]) => { RULES = r; INDEX = i; return !!r; });
    return READY;
  }
  function rule(id) { return RULES && RULES.programs ? RULES.programs.find(p => p.id === id) || null : null; }
  function keyFor(rep) {
    if (!INDEX || !INDEX.reps) return null;
    const names = INDEX.reps.map(r => r.rep);
    let hit = INDEX.reps.find(r => r.rep === rep);
    if (!hit && global.kdhMatchName) { const m = global.kdhMatchName(rep, names); if (m) hit = INDEX.reps.find(r => r.rep === m); }
    return hit ? hit.key : null;
  }
  function load(rep) {
    return ready().then(() => {
      const k = keyFor(rep); if (!k) return null;
      if (!files.has(k)) files.set(k, getJSON(base + 'accounts/data/elig/' + k + '.json'));
      return files.get(k);
    });
  }
  const prodMap = r => { const m = new Map(); (r.products || []).forEach(p => m.set(String(p.id), p)); return m; };
  function productIds(id) { const r = rule(id); return r ? new Set(r.products.map(p => String(p.id))) : null; }

  // reasons, in the words the data supports
  const REASON = { sku: 'Buys the brand, not this product', lapsed: 'Bought before, not this period', brand: 'New to the brand', partial: 'Buying some this month' };
  function reasonText(code) { return REASON[code] || ''; }

  // One program across one or more reps' files.
  function model(id, reps) {
    const r = rule(id); if (!r) return null;
    const P = prodMap(r);
    const accounts = [], credited = [];
    let trk = 0, req = 0, det = 0, after = 0, scored = 0, opps = 0;
    reps.forEach(({ rep, data }) => {
      const g = data && data.programs && data.programs[id]; if (!g) return;
      if (g.tracker && g.tracker.scored) { scored++; trk += Number(g.tracker.value || 0); req += Number(g.tracker.requirement || 0); }
      det += Number(g.detailCredited || 0); after += Number(g.afterDetail || 0);
      g.accounts.forEach(a => {
        const row = Object.assign({ rep }, a);
        if (a.st === 'excluded') { accounts.push(row); return; }
        if (r.kind === 'placements') {
          (a.cr || []).forEach(pid => credited.push({ rep, n: a.n, name: a.name, city: a.city, pid, product: P.get(String(pid)) }));
          opps += (a.op || []).length;
        } else {
          if (a.st === 'done') credited.push({ rep, n: a.n, name: a.name, city: a.city, pids: a.cr || [], products: (a.cr || []).map(x => P.get(String(x))).filter(Boolean) });
          else opps++;
        }
        accounts.push(row);
      });
    });
    // products: how many accounts could still add each one / already credit it
    const products = r.products.map(p => {
      let open = 0, cred = 0;
      accounts.forEach(a => {
        if (a.st === 'excluded') return;
        if (r.kind === 'placements') {
          if ((a.op || []).some(o => String(o[0]) === String(p.id))) open++;
          if ((a.cr || []).map(String).includes(String(p.id))) cred++;
        } else {
          const has = (a.cr || []).map(String).includes(String(p.id));
          if (has) cred++;
          else if (a.st === 'open') open++;
        }
      });
      return Object.assign({}, p, { open, credited: cred });
    });
    const live = accounts.filter(a => a.st === 'open');
    return {
      rule: r, accounts, products, credited,
      totals: {
        tracker: trk, requirement: req, scoredReps: scored, detail: det, afterDetail: after,
        eligible: accounts.filter(a => a.st !== 'excluded').length, open: live.length, opportunities: opps,
        excluded: accounts.filter(a => a.st === 'excluded').length,
      },
    };
  }

  // Eligible Accounts, filtered by product / search / rep and ordered by the rule's own order.
  function accountsView(M, opt) {
    opt = opt || {};
    const r = M.rule, pid = opt.product ? String(opt.product) : '';
    const q = String(opt.q || '').trim().toLowerCase();
    let rows = M.accounts.filter(a => a.st === 'open');
    if (opt.rep) rows = rows.filter(a => a.rep === opt.rep);
    if (pid) rows = rows.filter(a => r.kind === 'placements' ? (a.op || []).some(o => String(o[0]) === pid) : !(a.cr || []).map(String).includes(pid));
    if (q) rows = rows.filter(a => (String(a.name || '') + ' ' + String(a.city || '') + ' ' + a.n + ' ' + (a.rep || '')).toLowerCase().includes(q));
    const rankOf = a => {
      if (r.kind !== 'placements' || !pid) return a.rank == null ? 9 : a.rank;
      const o = (a.op || []).find(x => String(x[0]) === pid); return o ? ({ sku: 0, lapsed: 1, brand: 2 }[o[1]] ?? 3) : 9;
    };
    const skuN = a => (a.op || []).filter(o => o[1] === 'sku').length;
    rows = rows.slice().sort((x, y) => rankOf(x) - rankOf(y) || (r.kind !== 'placements' ? (x.need || 0) - (y.need || 0) : (pid ? 0 : skuN(y) - skuN(x)))
      || (Number(y.cases) || 0) - (Number(x.cases) || 0) || String(x.name).localeCompare(String(y.name)));
    return rows;
  }

  // One account's line for a program: {what, need, reasons[], credited[], open[]}
  function accountLine(M, a, pid) {
    const r = M.rule, P = prodMap(r);
    const name = id => { const p = P.get(String(id)); return p ? p.name : '#' + id; };
    if (r.kind === 'placements') {
      const PRI = { sku: 0, lapsed: 1, brand: 2 };
      const ops = (a.op || []).filter(o => !pid || String(o[0]) === String(pid)).slice().sort((x, y) => (PRI[x[1]] ?? 3) - (PRI[y[1]] ?? 3));
      const one = ops[0];
      const same = one ? ops.filter(o => o[1] === one[1]).length : 0;
      return {
        open: ops.map(o => ({ id: o[0], name: name(o[0]), code: o[1], why: o[2] })),
        credited: (a.cr || []).map(id => ({ id, name: name(id) })),
        what: pid ? name(pid) : (ops.length === 1 ? name(one[0]) : `${ops.length} qualifying products not placed here yet`),
        need: pid ? '1 placement for this product' : `Up to ${ops.length} ${ops.length === 1 ? 'placement' : 'placements'} here`,
        why: one ? (pid || ops.length === 1 ? one[2] : `Start with ${name(one[0])}: ${one[2].charAt(0).toLowerCase() + one[2].slice(1)}`) : '',
        more: same,
        code: one ? one[1] : '',
      };
    }
    const have = (a.cr || []).map(id => ({ id, name: name(id) }));
    const missing = r.products.filter(p => !(a.cr || []).map(String).includes(String(p.id))).map(p => ({ id: p.id, name: p.name }));
    return {
      open: missing, credited: have,
      what: (() => { const fam = r.families[0], by = r.period.label.split(' – ')[1].replace(/, \d{4}$/, '');
        if ((r.minSkus || 1) <= 1) return pid ? `${name(pid)} (any ${fam} product counts) by ${by}` : `A ${fam} purchase by ${by}`;
        return pid ? `${name(pid)}${a.need > 1 ? ` + ${a.need - 1} more ${fam}` : ''} by ${by}` : `${a.need} more ${fam} ${a.need === 1 ? 'product' : 'products'} by ${by}`; })(),
      need: (r.minSkus || 1) <= 1 ? `One ${r.families[0]} purchase, ${r.period.label}` : `${r.minSkus} different products, ${r.period.label} — has ${have.length}`,
      why: a.why ? a.why[1] : '',
      code: a.why ? a.why[0] : '',
    };
  }

  function forAccount(n, data) {
    const out = [];
    if (!data || !data.programs) return out;
    Object.keys(data.programs).forEach(id => {
      const r = rule(id); if (!r) return;
      const a = data.programs[id].accounts.find(x => String(x.n) === String(n));
      if (a) out.push({ rule: r, account: a, tracker: data.programs[id].tracker, prog: data.programs[id] });
    });
    return out;
  }

  global.KdhElig = { ready, rule, load, model, accountsView, accountLine, forAccount, productIds, reasonText,
    rules: () => RULES, questions: () => (RULES && RULES.questions) || {} };
})(typeof window !== 'undefined' ? window : globalThis);
