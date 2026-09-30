/* Account assistant (2026-09-30): the "Ask" section of the Account page.
   The page hands mount() a CONTEXT PACKET built from the data it already
   holds for this account (accounts.js buildPacket) -- nothing here fetches
   account data on its own -- and this file only draws the chat, posts the
   conversation + packet to /api/chat (a Vercel Edge Function that wraps it
   in the Kohler prompt and streams Claude's reply) and renders the stream.
   Two modes: ASK (questions about this account's buying, programs, what to
   pitch) and PRACTICE A PITCH (the assistant plays the buyer; "Get feedback"
   ends the role-play with coaching). The transcript is kept per account in
   sessionStorage so switching sections or coming back keeps it. Nothing is
   written to Supabase; a manager or a preview gets the same read-only tool. */
(function(){
'use strict';
const E = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ENDPOINT = '/api/chat';
const KEY = n => 'kdh_ask:'+n;
const LIMIT_TURNS = 30;

function load(n){ try{ const s = sessionStorage.getItem(KEY(n)); if(s) return JSON.parse(s); }catch(e){} return {mode:'ask', ask:[], pitch:[], product:'', fed:false}; }
function save(n, st){ try{ sessionStorage.setItem(KEY(n), JSON.stringify(st)); }catch(e){} }

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

function suggestions(packet, mode){
  const a = packet.account || {}; const leads = (packet.programs||[]).filter(p=>p.status==='lead' || p.status==='could qualify');
  if(mode==='pitch'){
    const out = [];
    leads.slice(0,2).forEach(p=>out.push(`I’d like to pitch ${p.ask ? p.ask.replace(/\.$/,'').replace(/^Place |^Sell /,'') : p.name} for the ${p.name} program.`));
    const top = (packet.products||[])[0]; if(top) out.push(`Let me pitch a bigger order of ${top.name}.`);
    out.push('Play a buyer who says the cooler is full and see how I handle it.');
    return out.slice(0,4);
  }
  const out = ['What does this account usually buy, and how often?', 'What may be due for a reorder right now?', 'What changed in the last three months?', 'What could I pitch here that also helps a program?'];
  if(packet.taps) out.push('What is on tap, and when was it last surveyed?');
  if((packet.patterns||{}).stoppedN) out.push('Which regular products did they stop buying?');
  return out.slice(0,6);
}

function mount(el, packet, opts){
  if(!el || !packet) return;
  const n = String(packet.account && packet.account.n || 'x');
  const st = load(n);
  let busy = false, aborter = null;
  const ref = (packet.data && packet.data.referenceMonthLabel) || '';
  const cfgOff = !(window.KDH_AUTH && window.KDH_AUTH.url);

  function render(){
    const msgs = st[st.mode] || [];
    const chips = msgs.length ? '' : `<div class="ask-chips">${suggestions(packet, st.mode).map(q=>`<button type="button" class="ask-chip" data-q="${E(q)}">${E(q)}</button>`).join('')}</div>`;
    const log = msgs.map(m=>`<div class="msg ${m.role==='user'?'me':'ai'}"><div class="msg-b">${m.role==='user' ? E(m.content).replace(/\n/g,'<br>') : md(m.content)}</div></div>`).join('');
    const pitchBar = st.mode==='pitch' ? `<div class="ask-pitchbar">
        <label for="askProd">Practising</label>
        <select id="askProd" aria-label="Product to pitch"><option value="">Any product (say it in your opening)</option>${(packet.products||[]).slice(0,40).map(p=>`<option value="${E(p.name)}"${p.name===st.product?' selected':''}>${E(p.name)}</option>`).join('')}</select>
        ${msgs.length>=2 && !st.fed ? `<button type="button" class="btn outline" id="askFeedback">Get feedback</button>` : ''}
      </div>` : '';
    el.innerHTML = `
      <div class="ask-head">
        <div class="pseg" role="tablist"><button type="button" class="${st.mode==='ask'?'active':''}" data-mode="ask">Ask</button><button type="button" class="${st.mode==='pitch'?'active':''}" data-mode="pitch">Practice a pitch</button></div>
        <p class="note ask-intro">${st.mode==='pitch'
          ? `The assistant plays the buyer at ${E(packet.account.name)} using this account’s real history; objections it invents are practice, not facts. Type your opening line, then work the conversation. <b>Get feedback</b> ends the role-play with coaching.`
          : `Answers use only what is on this page — sales through ${E(ref)}, buying alerts and patterns, program status, notes and taps. It will say when something is not in the data (contacts, prices, invoices, balances).`}</p>
        ${pitchBar}
      </div>
      ${cfgOff ? `<div class="kdh-state unavailable slim"><b>The assistant needs kohlerdisthub.com.</b><span>It is not available on a local or unsigned copy of the site.</span></div>` : ''}
      <div class="ask-log" id="askLog" aria-live="polite">${chips}${log}</div>
      <div class="ask-status" id="askStatus" hidden></div>
      <form class="ask-form" id="askForm">
        <textarea id="askIn" rows="1" placeholder="${st.mode==='pitch' ? 'Your opening line to the buyer…' : 'Ask about this account…'}" aria-label="Your message" maxlength="4000"${cfgOff?' disabled':''}></textarea>
        <button type="submit" class="btn primary" id="askSend"${cfgOff?' disabled':''}>Send</button>
      </form>
      <div class="ask-foot">${msgs.length ? `<button type="button" class="btn" id="askClear">Clear this conversation</button> · ` : ''}<span>Not saved anywhere but this device. Sales are monthly, through ${E(ref)}; numbers come from the page, not from memory.</span></div>`;
    el.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click', ()=>{ if(busy) return; st.mode = b.dataset.mode; save(n, st); render(); }));
    el.querySelectorAll('.ask-chip').forEach(b=>b.addEventListener('click', ()=>send(b.dataset.q)));
    const form = el.querySelector('#askForm'); const ta = el.querySelector('#askIn');
    form.addEventListener('submit', e=>{ e.preventDefault(); const t = ta.value.trim(); if(t) send(t); });
    ta.addEventListener('input', ()=>{ ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight)+'px'; });
    ta.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey && window.matchMedia('(min-width: 900px)').matches){ e.preventDefault(); form.requestSubmit(); } });
    const ps = el.querySelector('#askProd'); if(ps) ps.addEventListener('change', e=>{ st.product = e.target.value; save(n, st); });
    const fb = el.querySelector('#askFeedback'); if(fb) fb.addEventListener('click', ()=>send('Feedback, please — how did I do?', 'feedback'));
    const cl = el.querySelector('#askClear'); if(cl) cl.addEventListener('click', ()=>{ if(aborter) aborter.abort(); st[st.mode] = []; st.fed = false; save(n, st); render(); });
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
    let out = '';
    aborter = new AbortController();
    try{
      const r = await fetch(ENDPOINT, {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({mode, account: packet, messages: list.map(m=>({role:m.role, content:m.content}))}), signal: aborter.signal, credentials:'same-origin'});
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
          if(ev.t){ out += ev.t; bubble.firstChild.innerHTML = md(out); logEl.scrollTop = logEl.scrollHeight; }
          if(ev.error) throw new Error(ev.error);
        }
      }
      if(!out.trim()) out = 'No answer came back. Try asking again.';
      list.push({role:'assistant', content:out});
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
window.KdhAssistant = {mount, md};
})();
