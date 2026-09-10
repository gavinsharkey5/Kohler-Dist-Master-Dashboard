/* ====================================================================
   Incentives & MPO Hub -- account universe + brand territory.
   --------------------------------------------------------------------
   Two rules, applied to every account list the hub shows:

     1. A rep's universe is their ASSIGNED customer base (HUB_ACCOUNTS,
        from the Sales Reps' Customer Base report) -- never anyone else's
        accounts, never the whole company.
     2. A brand can only be sold where the Brand Permissions file says
        CAN SELL for the account's Encompass area (HUB_BRANDS). NOT IN
        TERRITORY and BLOCKED accounts are listed under "Can't sell here"
        with the reason, so a rep never chases one.

   On top of those, the trackers' own per-rep lists say which accounts are
   ALREADY buying the brand (hub.js gathers them; this file just takes the
   names), which leaves:

     eligible   in book, right premise, CAN SELL, not buying yet
     buying     in book and already on the brand
     high       the eligible accounts with the most 2026 volume -- the
                proxy for "high potential" these two files support (the
                customer base carries total cases per account, not
                brand-level sales, so there is no "does well with similar
                products" signal to rank on; see README)
     excluded   in book but the brand cannot be sold there
     unknown    in book but the area could not be resolved (Middlesex, a
                Morris account with no numbered area) -- shown, never
                counted as eligible

   PROGRAM_BRANDS maps each program to the brand families it pays on. A
   family missing from the Brand Permissions file (the wine & spirits
   brands, Tona, Lytt) falls back to the tracker's own territory call --
   Core Market for programs the incentive tracker greys out of
   non-core counties, otherwise "not on file", which applies NO territory
   filter and says so on the list.
   ==================================================================== */
(function(global){
'use strict';

const CORE_AREAS = ['Bergen','Passaic','Passaic-FF','Sussex','Morris 1','Morris 3'];
const CONSTELLATION = ['Corona Extra','Corona Light','Corona Premier','Corona Familiar','Corona Sunbrew','Modelo Especial','Modelo Negra','Modelo Oro','Pacifico','Victoria'];
const MABI = ['White Claw',"Mike's Hard Lemonade","Mike's Harder",'Cayman Jack','Mxd Cocktails','Ole'];
const YUENGLING = ['Yuengling Lager','Yuengling Flight','Yuengling Light Lager'];
const MOLSON = ['Coors','Coors Light','Blue Moon','Peroni','Miller Genuine Draft','Keystone','Leinenkugel'];
const NEW_BELGIUM = ['Voodoo Family',"Bell's Hearted Family",'Kirin Ichiban',"Bell's"];
const BARDSTOWN = ['Bardstown Bourbon','Bardstown Green River'];

// null = the program pays on any brand (house programs, "any brand" MPOs),
// so there is no territory rule to apply and no "already buying" list.
const PROGRAM_BRANDS = {
  // --- incentives (incentive-tracking/programs.js keys) ---
  'inc:keystone_ice':['Keystone'], 'inc:touchdowns_tea':['Sun Cruiser','Twisted Tea'], 'inc:evil_genius':['Evil Genius'],
  'inc:other_half':['Other Half'], 'inc:montauk':['Montauk'], 'inc:sam_adams_conversion':['Samuel Adams'],
  'inc:printed_menu':BARDSTOWN, 'inc:bardstown_display':BARDSTOWN, 'inc:two_xo':['2XO'],
  'inc:1911':['1911 Hard Cider'], 'inc:woodchuck':['Woodchuck'], 'inc:tona':['Tona'], 'inc:lytt':['Lytt'],
  'inc:le_grand_noir':['Le Grand Noir'], 'inc:garage_beer_president':['Garage Beer'], 'inc:garage_beer_summer_sequel':['Garage Beer'],
  'inc:mc_retention':MOLSON, 'inc:constellation_fall':CONSTELLATION, 'inc:constellation_retention':CONSTELLATION,
  'inc:mabi_retention_fall':MABI, 'inc:mabi_retention':MABI, 'inc:yuengling_retention_fall':YUENGLING, 'inc:yuengling_retention':YUENGLING,
  'inc:heineken_husa':['Heineken USA','Dos Equis'], 'inc:new_belgium_distribution_retain':NEW_BELGIUM, 'inc:new_belgium_distribution':NEW_BELGIUM,
  'inc:new_belgium':['Voodoo Family',"Bell's Hearted Family"], 'inc:boston_beer':['Angry Orchard','Dogfish Head Beer'], 'inc:sam_adams':['Samuel Adams'],
  'inc:path_to_victory':['Victory'], 'inc:sun_cruiser':['Sun Cruiser'], 'inc:yave':['YaVe'], 'inc:mollys':["Molly's"],
  'inc:fall_seasonal':null, 'inc:display_auction':null,
  // --- on-premise MPO objectives (MPOs/on-prem/programs.js keys) ---
  'on:bardstown_menu':BARDSTOWN, 'on:fever_tree':['Fever Tree'], 'on:carbliss':['Carbliss'], 'on:husa_xx_draft':['Dos Equis'],
  'on:angry_orchard':['Angry Orchard'], 'on:molson_coors':['Peroni','Coors'], 'on:wine_spirits':['YaVe','Leyenda 1925'],
  'on:sapporo_na':['Sapporo'], 'on:isellbeer':null,
  // --- off-premise MPO objectives (MPOs/off-prem/programs.js keys) ---
  'off:constellation_gaintain':['Corona Extra','Corona Light','Corona Premier','Corona Familiar','Corona Sunbrew'],
  'off:keystone_ice':['Keystone'], 'off:fever_tree':['Fever Tree'], 'off:wine_spirits_any':null, 'off:pos_stickers':null,
  'off:corona_premier':['Corona Premier'], 'off:bbc_lytt':['Lytt'], 'off:disruptors':['Lytt'], 'off:molson_coors':['Peroni','Coors'],
  'off:wine_spirits':['Le Grand Noir','Leyenda 1925','Bardstown Green River'], 'off:new_belgium':NEW_BELGIUM,
  'off:ws_2xo':['2XO'], 'off:sapporo_light':['Sapporo'], 'off:famosa':['Famosa'],
};

const norm = s => String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

function brandKey(p){ return (p.source==='inc' ? 'inc:' : p.source+':') + p.key; }

// Resolve each brand family to an areas map. Families in the Brand
// Permissions file use it verbatim; others fall back to the tracker's call.
function familiesFor(p){
  const key = brandKey(p);
  const names = PROGRAM_BRANDS[key];
  if(names===null) return {any:true, fams:[], notes:[]};
  if(!names) return {any:true, fams:[], notes:['No brand family is mapped for this program yet, so no territory rule is applied.']};
  const coreByTracker = p.source==='inc'
    ? (typeof CORE_MARKET_PROGRAM_KEYS!=='undefined' && CORE_MARKET_PROGRAM_KEYS.has(p.key))
    : (p.objective && (p.objective.type==='pct_of_base'));   // off-prem pct_of_base is scored on the core-territory book
  const fams = [], notes = [];
  names.forEach(n=>{
    const f = HUB_BRANDS.families[n];
    if(f){ fams.push({name:n, areas:f.areas, territory:f.territory, onFile:true}); return; }
    if(coreByTracker){
      const areas = {}; HUB_BRANDS.areas.forEach(a=>{ areas[a] = CORE_AREAS.includes(a) ? 'CAN SELL' : 'NOT IN TERRITORY'; });
      fams.push({name:n, areas, territory:'Core Market (per the tracker)', onFile:false});
      notes.push(`${n} is not in the Brand Permissions file — using the tracker's Core Market rule (Bergen, Passaic, Passaic-FF, Sussex, Morris 1 & 3).`);
    } else {
      fams.push({name:n, areas:null, territory:'Not on file', onFile:false});
      notes.push(`${n} is not in the Brand Permissions file, so no territory filter is applied to it — confirm before acting on an account outside the core counties.`);
    }
  });
  return {any:false, fams, notes};
}

// 'ok' | 'no' | 'unknown', plus a reason string for 'no'.
function territoryOf(fams, acc){
  if(!acc.area) return {v:'unknown', why:`Area not on file (${acc.rawArea||'—'}${acc.county?', '+acc.county+' County':''})`};
  let anyOk = false, anyUnknown = false; const whys = [];
  fams.forEach(f=>{
    if(!f.areas){ anyUnknown = true; return; }
    const s = f.areas[acc.area];
    if(s==='CAN SELL') anyOk = true;
    else whys.push(`${f.name}: ${s==='BLOCKED' ? 'blocked' : 'not in territory'} in ${acc.area}`);
  });
  if(anyOk || anyUnknown) return {v:'ok', why:''};
  return {v:'no', why: whys.join(' · ')};
}

// buying: Map(normName -> note) gathered by hub.js from the tracker's data.
function classify(p, rep, buying){
  const book = (HUB_ACCOUNTS.reps[rep] || []).slice();
  const chan = p.channel;                       // 'on' | 'off' | 'both'
  const inPrem = a => chan==='both' || (chan==='on' ? a.prem==='On' : a.prem==='Off');
  const B = familiesFor(p);
  const out = {eligible:[], buying:[], high:[], excluded:[], unknown:[], offPremise:0, universe:0,
               any:B.any, families:B.fams.map(f=>f.name), notes:B.notes.slice(), territory:B.fams.map(f=>f.name+': '+f.territory)};
  const seen = new Set();
  book.forEach(a=>{
    const row = Object.assign({}, a);
    const k = norm(a.name);
    // "Already buying" is matched against the rep's WHOLE book, whichever
    // premise the customer base gives the account: the trackers credit an
    // off-premise wine placement at a restaurant to the off-prem MPO, and
    // that account must not vanish into "not in your book".
    const buy = buying && (buying.get(k) || buying.get(String(a.n)));
    if(buy){
      row.note = [buy===true ? '' : buy, inPrem(a) ? '' : (a.prem==='On' ? 'on-premise account' : 'off-premise account')].filter(Boolean).join(' · ');
      out.buying.push(row); seen.add(k);
      if(inPrem(a)) out.universe++;
      return;
    }
    if(!inPrem(a)){ out.offPremise++; return; }
    out.universe++;
    if(B.any){ out.eligible.push(row); return; }
    const t = territoryOf(B.fams, a);
    if(t.v==='no'){ row.why = t.why; out.excluded.push(row); }
    else if(t.v==='unknown'){ row.why = t.why; out.unknown.push(row); }
    else out.eligible.push(row);
  });
  // Buying accounts the tracker names that are not in this rep's book (a
  // transfer, a name the two exports spell differently): keep them visible
  // so the count matches what the tracker shows, but mark them.
  if(buying) buying.forEach((note, k)=>{
    if(seen.has(k) || /^\d+$/.test(k)) return;
    const label = buying.get('__label__'+k) || k;
    if(k.startsWith('__label__')) return;
    out.buying.push({name:label, area:'', city:'', prem:'', cases:null, note: note===true ? 'not in your assigned book' : note+' · not in your assigned book', foreign:true});
  });
  const byCases = (a,b)=>(b.cases||0)-(a.cases||0) || a.name.localeCompare(b.name);
  out.eligible.sort(byCases); out.buying.sort(byCases); out.excluded.sort(byCases); out.unknown.sort(byCases);
  out.high = out.eligible.filter(a=>(a.cases||0)>0).slice(0, 10);
  return out;
}

global.HubAccounts = {PROGRAM_BRANDS, CORE_AREAS, norm, brandKey, familiesFor, classify,
  asOf: (typeof HUB_ACCOUNTS!=='undefined' && HUB_ACCOUNTS.asOf) || ''};
})(window);
