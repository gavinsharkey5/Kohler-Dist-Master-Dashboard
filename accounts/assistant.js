/* Account assistant (2026-09-30, v2): the "Ask" section of the Account page.
   The page hands mount() the PACKET it built for display (accounts.js
   buildPacket). This file draws the chat and posts to /api/chat ONLY the
   customer number, the rep whose book it is, the page's own reading of
   program status and warehouse availability (labelled unverified on the
   server) and the conversation. The server authorizes the account against
   the caller's route, builds the trusted record itself from Kohler's
   exports and streams Claude's reply back; every answer carries a footer
   with the reporting period, the data load date, the lookups the server
   ran on the full record, and links to the page blocks that hold the
   supporting numbers.
   Two modes: ASK and PRACTICE A PITCH ("Get feedback" ends the role-play).
   PERSISTENCE: the transcript lives in sessionStorage of THIS browser tab
   under a key made from the signed-in email + preview identity + customer
   number, so another person on the same device, or a manager leaving
   preview, never sees it; kdh-user.js and /login/ call KdhAssistant.forget()
   (or clear kdh_ask:* directly) on preview change, sign-out and sign-in.
   Nothing is written to Supabase; a manager or a preview gets the same
   read-only tool. */
(function(){
'use strict';
const E = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ENDPOINT = '/api/chat';
const LIMIT_TURNS = 30;
const cookie = n => { try{ const m = document.cookie.match(new RegExp('(?:^|;\\s*)'+n+'=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }catch(e){ return ''; } };
// who is looking: signed-in email + the preview identity (a manager in
// preview and the same manager out of preview are two different viewers)
function viewerKey(){
  let email = ''; try{ email = (JSON.parse(cookie('kdh_user')||'null')||{}).email || ''; }catch(e){}
  const s = (email.toLowerCase()+'|'+cookie('kdh_preview'));
  let h = 5381; for(let i=0;i<s.length;i++) h = ((h*33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const KEY = n => 'kdh_ask:'+viewerKey()+':'+n;
function load(n){ try{ const s = sessionStorage.getItem(KEY(n)); if(s) return JSON.parse(s); }catch(e){} return {mode:'ask', ask:[], pitch:[], product:'', fed:false}; }
function save(n, st){ try{ sessionStorage.setItem(KEY(n), JSON.stringify(st)); }catch(e){} }
function forget(){ try{ Object.keys(sessionStorage).filter(k=>k.indexOf('kdh_ask:')===0).forEach(k=>sessionStorage.removeItem(k)); }catch(e){} }

// markdown-lite: paragraphs, "- " bullets, **bold**. Everything else is text.
function md(s){
  const lines = String(s||'').split('\n'); let html = '', inList = false, para = [];
  const flush = ()=>{ if(para.length){ html += `<p>${para.join('<br>')}</p>`; para = []; } };
  const inline = t => E(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  lines.forEach(raw=>{
    const l = raw.replace(/\s+$/,'');
    const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if(m){ flush(); if(!inList){ html += '<ul>'; inList = true; } html += `<li>${inline(m[1])}</li>`; return; }
    if(inList){ html += '</ul>'; inList = false; }
    if(!l.trim()){ flush(); return; }
    para.push(inline(l));
  });
  if(inList) html += '</ul>'; flush();
  return html;
}
const fmtDate = s => { if(!s) return ''; const d = new Date(s.slice(0,10)+'T12:00:00Z'); return isNaN(d) ? s : d.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric', timeZone:'UTC'}); };
const TOOL_WORDS = {product_history:'product history', period_totals:'period totals', list_products:'product list'};

function suggestions(packet, mode){
  const leads = (packet.programs||[]).filter(p=>p.status==='lead' || p.status==='could qualify');
  if(mode==='pitch'){
    const out = [];
    leads.slice(0,2).forEach(p=>out.push(`I’d like to pitch ${p.ask ? p.ask.replace(/\.$/,'').replace(/^Place |^Sell /,'') : p.name} for the ${p.name} program.`));
    const top = (packet.products||[])[0]; if(top) out.push(`Let me pitch a bigger order of ${top.name}.`);
    out.push('Play a buyer who says the cooler is full and see how I handle it.');
    return out.slice(0,4);
  }
  // the six starter questions (2026-10-02 brief, Zalando's suggested questions)
  return ['What does this account usually buy?', 'Which products may be due for a reorder?', 'How has its buying pattern changed?', 'What seasonal purchases appear in its history?', 'Which eligible products could help this account qualify for an incentive or MPO?', 'What should I discuss on my next visit?'];
}

// what the browser sends besides the conversation: identity + the page's own reading
function pageContext(packet){
  const warehouse = {};
  (packet.products||[]).forEach(p=>{ if(p.warehouseAvailable!=null) warehouse[p.num] = [p.warehouseAvailable, p.warehouseStatus||null]; });
  return {v:2, account: packet.account.n, rep: packet.rep, page: {programs: (packet.programs||[]).slice(0,40), warehouse: Object.keys(warehouse).length ? warehouse : null, warehouseAsOf: (packet.data||{}).warehouseAsOf || null}};
}

function mount(el, packet, opts){
  if(!el || !packet) return;
  const n = String(packet.account && packet.account.n || 'x');
  const st = load(n);
  let busy = false, aborter = null;
  const D = packet.data || {};
  const ref = D.referenceMonthLabel || '';
  const span = [D.firstMonthLabel, D.referenceMonthLabel].filter(Boolean).join(' – ');
  const cfgOff = !(window.KDH_AUTH && window.KDH_AUTH.url);
  const footer = m => {
    const meta = m.meta || {}; const parts = [];
    parts.push(`Monthly sales record through ${E(meta.refLabel||ref)}${meta.salesLoaded ? `, loaded ${E(fmtDate(meta.salesLoaded))}` : D.salesLoaded ? `, loaded ${E(fmtDate(D.salesLoaded))}` : ''}`);
    if(meta.tools && meta.tools.length) parts.push(`checked the full record (${E(Array.from(new Set(meta.tools.map(t=>TOOL_WORDS[t]||t))).join(', '))})`);
    if(meta.fellBack) parts.push('answered by a fallback model');
    const links = `<a href="#" data-go="sales:sales">Purchase history</a> · <a href="#" data-go="sales:alerts">Alerts</a> · <a href="#" data-go="sales:patterns">Patterns</a> · <a href="#" data-go="tasks:programs">Programs</a>`;
    return `<div class="msg-f">${parts.join(' · ')}<span class="msg-links">Check: ${links}</span></div>`;
  };

  function render(){
    const msgs = st[st.mode] || [];
    const chips = msgs.length ? '' : `<div class="ask-chips">${suggestions(packet, st.mode).map(q=>`<button type="button" class="ask-chip" data-q="${E(q)}">${E(q)}</button>`).join('')}</div>`;
    const log = msgs.map(m=>`<div class="msg ${m.role==='user'?'me':'ai'}"><div class="msg-b">${m.role==='user' ? E(m.content).replace(/\n/g,'<br>') : md(m.content)}</div>${m.role==='assistant' && st.mode==='ask' ? footer(m) : ''}</div>`).join('');
    const pitchBar = st.mode==='pitch' ? `<div class="ask-pitchbar">
        <label for="askProd">Product</label>
        <select id="askProd" aria-label="Product to pitch"><option value="">Any product (say it in your opening)</option>${(packet.products||[]).slice(0,40).map(p=>`<option value="${E(p.name)}"${p.name===st.product?' selected':''}>${E(p.name)}</option>`).join('')}</select>
        ${msgs.length>=2 && !st.fed ? `<button type="button" class="btn outline" id="askFeedback">Get Feedback</button>` : ''}
      </div>` : '';
    el.innerHTML = `
      <div class="ask-head">
        <div class="pseg" role="tablist"><button type="button" class="${st.mode==='ask'?'active':''}" data-mode="ask">Ask</button><button type="button" class="${st.mode==='pitch'?'active':''}" data-mode="pitch">Practice a Pitch</button></div>
        <div class="note ask-intro">${st.mode==='pitch'
          ? `<p>The assistant plays the buyer at ${E(packet.account.name)}. Its objections are simulated practice.</p><details class="ask-more"><summary>How Practice Works</summary><p>What it says about this account’s buying comes from the sales record, and it will not invent prices, stock levels or competitor facts. Type your opening line, then work the conversation. <b>Get Feedback</b> ends the role-play with coaching.</p></details>`
          : `<p>Ask about <b>${E(packet.account.name)}</b>. Answers use its monthly sales record${span ? `, ${E(span)}` : ''}${D.salesLoaded ? ` (loaded ${E(fmtDate(D.salesLoaded))})` : ''}, checked by code.</p><details class="ask-more"><summary>What It Can Answer</summary><p>Every product, ${E(span || ('through '+ref))}${D.salesLoaded ? `, loaded ${E(fmtDate(D.salesLoaded))}` : ''} — plus its buying alerts and patterns, your notes and the tap survey. Program status and warehouse availability are quoted from what this page shows. Not in the data: contacts, hours, prices, invoices, balances, shelf stock, days between orders. It says so when a question needs them.</p></details>`}</div>
        ${pitchBar}
      </div>
      ${cfgOff ? `<div class="kdh-state unavailable slim"><b>The assistant needs kohlerdisthub.com.</b><span>It is not available on a local or unsigned copy of the site.</span></div>` : ''}
      <div class="ask-log" id="askLog" aria-live="polite">${chips}${log}</div>
      <div class="ask-status" id="askStatus" hidden></div>
      <form class="ask-form" id="askForm">
        <textarea id="askIn" rows="1" placeholder="${st.mode==='pitch' ? 'Your opening line to the buyer…' : 'Ask about this account…'}" aria-label="Your message" maxlength="4000"${cfgOff?' disabled':''}></textarea>
        <button type="submit" class="btn primary" id="askSend"${cfgOff?' disabled':''}>Send</button>
      </form>
      <div class="ask-foot">${msgs.length ? `<button type="button" class="btn ghost sm" id="askClear">Delete Conversation</button> · ` : ''}<span>Kept only in this browser tab, for you, until you close it or sign out. Numbers come from the record, not from memory.</span></div>`;
    el.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click', ()=>{ if(busy) return; st.mode = b.dataset.mode; save(n, st); render(); }));
    el.querySelectorAll('.ask-chip').forEach(b=>b.addEventListener('click', ()=>send(b.dataset.q)));
    const form = el.querySelector('#askForm'); const ta = el.querySelector('#askIn');
    form.addEventListener('submit', e=>{ e.preventDefault(); const t = ta.value.trim(); if(t) send(t); });
    ta.addEventListener('input', ()=>{ ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight)+'px'; });
    ta.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey && window.matchMedia('(min-width: 900px)').matches){ e.preventDefault(); form.requestSubmit(); } });
    const ps = el.querySelector('#askProd'); if(ps) ps.addEventListener('change', e=>{ st.product = e.target.value; save(n, st); });
    const fb = el.querySelector('#askFeedback'); if(fb) fb.addEventListener('click', ()=>send('Feedback, please — how did I do?', 'feedback'));
    const cl = el.querySelector('#askClear'); if(cl) cl.addEventListener('click', ()=>{ if(!window.confirm('Delete this conversation from this device?')) return; if(aborter) aborter.abort(); st[st.mode] = []; st.fed = false; save(n, st); render(); });
    const logEl = el.querySelector('#askLog'); logEl.scrollTop = logEl.scrollHeight;
  }

  async function send(text, modeOverride){
    if(busy || cfgOff) return;
    const mode = modeOverride || st.mode;
    const list = st[st.mode];
    let userText = text;
    if(st.mode==='pitch' && !list.length && st.product && !modeOverride) userText = `[Practising a pitch for ${st.product}] ${text}`;
    list.push({role:'user', content:userText});
    if(list.length > LIMIT_TURNS) list.splice(0, list.length - LIMIT_TURNS);
    save(n, st); render();
    busy = true;
    const status = el.querySelector('#askStatus'); status.hidden = false; status.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> Thinking…';
    el.querySelector('#askSend').disabled = true;
    const bubble = document.createElement('div'); bubble.className = 'msg ai'; bubble.innerHTML = '<div class="msg-b"></div>';
    const logEl = el.querySelector('#askLog'); logEl.appendChild(bubble); logEl.scrollTop = logEl.scrollHeight;
    let out = ''; const meta = {tools:[]};
    aborter = new AbortController();
    try{
      const body = Object.assign(pageContext(packet), {mode, messages: list.map(m=>({role:m.role, content:m.content}))});
      if(opts && opts.model) body.model = opts.model;
      const r = await fetch(ENDPOINT, {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body), signal: aborter.signal, credentials:'same-origin'});
      if(!r.ok){
        let msg = 'The assistant could not answer right now.';
        try{ const j = await r.json(); if(j && j.error) msg = j.error; }catch(e){}
        if(r.status===401) msg = 'Your sign-in has expired — sign in again to use the assistant.';
        throw new Error(msg);
      }
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
      status.textContent = '';
      while(true){
        const {value, done} = await reader.read(); if(done) break;
        buf += dec.decode(value, {stream:true});
        let i; while((i = buf.indexOf('\n\n')) >= 0){
          const frame = buf.slice(0, i); buf = buf.slice(i+2);
          const line = frame.split('\n').find(l=>l.startsWith('data:')); if(!line) continue;
          let ev; try{ ev = JSON.parse(line.slice(5).trim()); }catch(e){ continue; }
          if(ev.meta){ meta.refLabel = ev.meta.refLabel; meta.salesLoaded = ev.meta.salesLoaded; }
          if(ev.tool){ meta.tools.push(ev.tool); status.hidden = false; status.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> Checking the full record…'; }
          if(ev.t){ out += ev.t; status.hidden = true; bubble.firstChild.innerHTML = md(out); logEl.scrollTop = logEl.scrollHeight; }
          if(ev.done && ev.usage){ meta.fellBack = !!ev.usage.fellBack; }
          if(ev.error) throw new Error(ev.error);
        }
      }
      if(!out.trim()) out = 'No answer came back. Try asking again.';
      list.push({role:'assistant', content:out, meta});
      if(mode==='feedback') st.fed = true;
      save(n, st);
    }catch(e){
      if(e.name==='AbortError'){ return; }
      list.pop();       // the question did not get an answer: let the rep resend it
      save(n, st); render();
      const st2 = el.querySelector('#askStatus'); st2.hidden = false; st2.innerHTML = `<div class="kdh-state error slim"><b>${E(e.message||'Something went wrong.')}</b></div>`;
      el.querySelector('#askIn').value = text;
    }finally{
      busy = false; aborter = null;
      const s = el.querySelector('#askStatus'); if(s && !s.querySelector('.kdh-state')) s.hidden = true;
      const b = el.querySelector('#askSend'); if(b) b.disabled = false;
      if(out.trim()) render();
    }
  }
  render();
}
window.KdhAssistant = {mount, md, forget, pageContext};
})();
