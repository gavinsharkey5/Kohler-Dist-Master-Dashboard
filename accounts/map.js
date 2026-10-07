/* My Accounts -> Map (2026-10-02; komoot's map above a selected-place sheet).
   KdhMap.mount(slot, items, opts) draws the accounts the LIST would show (same
   search, same filters, same authorized rows -- accounts.js passes them in)
   as pins on a map, a compact sheet for the selected account (name, town,
   address, ONE action item, Open Account / Directions), and a fold listing
   every account that could not be placed, so nothing disappears from view.

   COORDINATES, in this order:
     1. row.geo from the account data (accounts/geo.csv -- validated, e.g.
        Encompass's own coordinates);
     2. this device's cache (localStorage kdh_geo:v1, keyed by customer # and
        the address it was looked up with, so an address change is redone);
     3. /api/geocode, which authorizes the route on the server and geocodes
        the street + town from the customer base (US Census Geocoder).
   Accounts with no street or town, or that the service cannot match, are
   listed under "Not on the map" with the reason.

   LOCATION is never requested on load: only when the rep taps "Use My
   Location", and a refusal just leaves the map as it was.
   Leaflet + markercluster are vendored in /assets/vendor (no CDN), loaded
   on first use. Tiles: OpenStreetMap's standard tiles with attribution
   (TILE_URL below is the one place to swap in a commercial provider). */
(function(){
'use strict';
const E = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ROOT = (function(){ try{ const s = document.currentScript && document.currentScript.src || ''; const i = s.indexOf('accounts/map.js'); return i > 0 ? s.slice(0, i) : '../'; }catch(e){ return '../'; } })();
const LIB = ROOT + 'assets/vendor/';
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const NJ_CENTER = [40.95, -74.3];
const GEO_KEY = 'kdh_geo:v1';
const BATCH = 200;

let libPromise = null;
function loadLib(){
  if(window.L && window.L.markerClusterGroup) return Promise.resolve();
  if(libPromise) return libPromise;
  const css = href => new Promise(res=>{ const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = l.onerror = res; document.head.appendChild(l); });
  const js = src => new Promise((res, rej)=>{ const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = ()=>rej(new Error('map library')); document.head.appendChild(s); });
  libPromise = Promise.all([css(LIB+'leaflet-1.9.4/leaflet.css'), css(LIB+'leaflet.markercluster-1.5.3/MarkerCluster.css')])
    .then(()=>js(LIB+'leaflet-1.9.4/leaflet.js')).then(()=>js(LIB+'leaflet.markercluster-1.5.3/leaflet.markercluster.js'));
  libPromise.catch(()=>{ libPromise = null; });
  return libPromise;
}

const addrOf = a => [String(a.address||'').trim(), String(a.city||'').trim()].join('|').toLowerCase();
function readCache(){ try{ return JSON.parse(localStorage.getItem(GEO_KEY)||'{}') || {}; }catch(e){ return {}; } }
function writeCache(c){ try{ const keys = Object.keys(c); if(keys.length > 4000) keys.slice(0, keys.length-4000).forEach(k=>delete c[k]); localStorage.setItem(GEO_KEY, JSON.stringify(c)); }catch(e){} }
const REASON = {'incomplete':'No street address or town in the customer base', 'not found':'Address not found by the map service', 'ambiguous':'Address matches more than one place', 'not on this route':'Not on this route', 'service':'Map service unavailable — try again later'};

// resolve coordinates for the items: {n -> {lat,lng,src} | {none}}
async function resolve(items, onProgress){
  const out = new Map(), cache = readCache(), ask = new Map();   // rep -> [a]
  items.forEach(({a, rep})=>{
    const n = String(a.n);
    if(Array.isArray(a.geo) && isFinite(a.geo[0]) && isFinite(a.geo[1])){ out.set(n, {lat:+a.geo[0], lng:+a.geo[1], src:a.geo[2]||'file'}); return; }
    if(!String(a.address||'').trim() || !String(a.city||'').trim()){ out.set(n, {none:'incomplete'}); return; }
    const c = cache[n];
    if(c && c.a===addrOf(a)){ out.set(n, c.none ? {none:c.none} : {lat:c.lat, lng:c.lng, src:'geocoder'}); return; }
    if(!ask.has(rep)) ask.set(rep, []);
    ask.get(rep).push(a);
  });
  let total = 0; ask.forEach(l=>total += l.length); let done = 0, failed = false, message = '';
  if(total && onProgress) onProgress(0, total);
  for(const [rep, list] of ask){
    for(let i=0;i<list.length;i+=BATCH){
      const chunk = list.slice(i, i+BATCH);
      let res = null;
      try{
        const r = await fetch(ROOT+'api/geocode', {method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body: JSON.stringify({rep, accounts: chunk.map(a=>a.n)})});
        res = await r.json().catch(()=>null);
        if(!r.ok){ failed = true; message = (res && res.error) || ''; res = res && res.results ? res : null; }
      }catch(e){ failed = true; }
      chunk.forEach(a=>{
        const n = String(a.n), g = res && res.results && res.results[n];
        if(g && isFinite(g.lat)){ out.set(n, {lat:g.lat, lng:g.lng, src:'geocoder'}); cache[n] = {a:addrOf(a), lat:g.lat, lng:g.lng, t:Date.now()}; }
        else if(g && g.none){ out.set(n, {none:g.none}); if(g.none!=='not on this route') cache[n] = {a:addrOf(a), none:g.none, t:Date.now()}; }
        else out.set(n, {none:'service'});
      });
      done += chunk.length; if(onProgress) onProgress(done, total);
    }
  }
  writeCache(cache);
  return {coords: out, failed, message};
}

// one map instance kept across list re-renders: the container moves between slots
let map = null, layer = null, holder = null, youMarker = null, selected = null, current = null;
function pinIcon(item, on){
  const busy = !!item.lead;
  return L.divIcon({className:'kpin-wrap', html:`<span class="kpin${busy?' busy':''}${on?' on':''}" aria-hidden="true"></span>`, iconSize:[on?30:22, on?30:22], iconAnchor:[on?15:11, on?15:11]});
}
function sheetHtml(it, opts){
  const a = it.a, L = it.lead;
  return `<div class="msheet" role="dialog" aria-label="${E(a.name)}">
    <button type="button" class="msheet-x" aria-label="Close">&times;</button>
    <h3>${E(a.name)}</h3>
    <p class="msheet-s">${E([a.city, opts.premWord(a.prem), '#'+a.n].filter(Boolean).join(' · '))}${it.showRep ? ' · '+E(it.rep) : ''}</p>
    <p class="msheet-a">${E([a.address, a.city].filter(Boolean).join(', '))}</p>
    ${L ? `<p class="msheet-l"><b>${E(L.label)}</b> ${E(L.d)}${L.moreText ? `<span class="lm">${E(L.moreText)}</span>` : ''}</p>` : `<p class="msheet-l quiet">Nothing flagged right now</p>`}
    <div class="msheet-b"><a class="btn primary" href="${E(opts.hrefFor(it))}" data-open="1">Open Account</a><a class="btn outline" href="${E(opts.mapsHref(a))}" target="_blank" rel="noopener">Directions</a></div>
  </div>`;
}

async function mount(slot, items, opts){
  current = {items, opts};
  slot.innerHTML = `<div class="mapbar"><span class="mscope">${E(opts.scopeLabel)} · <b>${items.length}</b></span><span class="mlegend"><span class="kpin busy"></span> Has an action item <span class="kpin"></span> Nothing flagged</span></div>
    <div class="mapbox"><div class="mapstate" id="mapState"><div class="kdh-state loading slim">Loading the map…</div></div></div>
    <div id="mapMiss"></div>`;
  const box = slot.querySelector('.mapbox');
  try{ await loadLib(); }catch(e){
    box.innerHTML = `<div class="kdh-state error"><b>The map could not load.</b><span>The account list still works — switch back to List.</span></div>`; return;
  }
  if(current.items !== items) return;               // a newer render took over
  if(!holder){ holder = document.createElement('div'); holder.className = 'mapcanvas'; holder.id = 'acctMap'; }
  box.appendChild(holder);
  if(!map){
    map = L.map(holder, {zoomControl:true, attributionControl:true, tap:true}).setView(NJ_CENTER, 9);
    L.tileLayer(TILE_URL, {maxZoom:19, attribution:TILE_ATTR}).addTo(map);
    const Loc = L.Control.extend({options:{position:'topright'}, onAdd(){ const b = L.DomUtil.create('button', 'mloc'); b.type = 'button'; b.textContent = 'Use My Location'; L.DomEvent.disableClickPropagation(b); b.addEventListener('click', locate); return b; }});
    map.addControl(new Loc());
    map.on('click', ()=>select(null));
    map.on('moveend', ()=>{ try{ const c = map.getCenter(); sessionStorage.setItem(opts.memKey+'view', JSON.stringify([c.lat, c.lng, map.getZoom()])); }catch(e){} });
  }
  setTimeout(()=>map.invalidateSize(), 0);
  const st = box.querySelector('#mapState');
  const {coords, failed, message} = await resolve(items, (d, t)=>{ if(st) st.innerHTML = `<div class="kdh-state loading slim">Placing accounts on the map… ${d} of ${t}</div>`; });
  if(current.items !== items) return;
  if(st) st.remove();
  draw(items, coords, opts, failed, message, slot);
}
function draw(items, coords, opts, failed, message, slot){
  if(layer){ map.removeLayer(layer); }
  layer = L.markerClusterGroup({showCoverageOnHover:false, maxClusterRadius:44, disableClusteringAtZoom:15, spiderfyOnMaxZoom:true});
  const placed = [], miss = [];
  items.forEach(it=>{
    const c = coords.get(String(it.a.n));
    if(!c || c.none){ miss.push({it, why: REASON[c ? c.none : 'service'] || 'Not placed'}); return; }
    const m = L.marker([c.lat, c.lng], {icon: pinIcon(it, false), title: it.a.name, keyboard:true, alt: it.a.name});
    m.on('click', ()=>select(it, m));
    m._kdh = it; it._m = m;
    layer.addLayer(m); placed.push([c.lat, c.lng]);
  });
  map.addLayer(layer);
  let view = null; try{ view = JSON.parse(sessionStorage.getItem(opts.memKey+'view')||'null'); }catch(e){}
  if(view && opts.restoreView) map.setView([view[0], view[1]], view[2]);
  else if(placed.length) map.fitBounds(L.latLngBounds(placed).pad(0.08), {maxZoom:15});
  // selection survives a return from the account page
  let selN = null; try{ selN = sessionStorage.getItem(opts.memKey+'sel'); }catch(e){}
  const again = selN && items.find(x=>String(x.a.n)===selN && x._m);
  if(again) select(again, again._m, true); else select(null);
  const missEl = slot.querySelector('#mapMiss');
  missEl.innerHTML = (failed ? `<div class="kdh-state unavailable slim"><b>Some accounts could not be placed right now.</b><span>${E(message || 'The address lookup service did not answer.')} They are listed below and in the List view.</span></div>` : '') +
    (miss.length ? `<details class="fold mmiss"${miss.length<=5?' open':''}><summary>Not on the Map · ${miss.length}</summary><div class="rows">${miss.map(({it, why})=>`<a class="row" href="${E(opts.hrefFor(it))}"><span class="row-main"><h3>${E(it.a.name)}</h3><span class="row-s">${E([it.a.city, '#'+it.a.n].filter(Boolean).join(' · '))} · ${E(why)}</span></span></a>`).join('')}</div></details>` : '');
}
function select(it, marker, quiet){
  const box = holder && holder.parentNode; if(!box) return;
  const old = box.querySelector('.msheet'); if(old) old.remove();
  if(selected && selected._m) selected._m.setIcon(pinIcon(selected, false));
  selected = it || null;
  try{ if(it) sessionStorage.setItem(current.opts.memKey+'sel', String(it.a.n)); else sessionStorage.removeItem(current.opts.memKey+'sel'); }catch(e){}
  if(!it) return;
  marker.setIcon(pinIcon(it, true));
  box.insertAdjacentHTML('beforeend', sheetHtml(it, current.opts));
  const sh = box.querySelector('.msheet');
  sh.querySelector('.msheet-x').addEventListener('click', ()=>select(null));
  if(!quiet){ const ll = marker.getLatLng(); if(!map.getBounds().pad(-0.25).contains(ll)) map.panTo(ll);
    // on a phone the map runs below the fold: bring the sheet (and its Open Account / Directions) into view above the tab bar
    setTimeout(()=>{ const cur = box.querySelector('.msheet'); if(!cur) return; const tb = document.getElementById('kdhTabs'); const tbr = tb && getComputedStyle(tb).display !== 'none' ? tb.getBoundingClientRect() : null; const tr = tbr && tbr.height ? tbr.top : innerHeight;
      const r = cur.getBoundingClientRect(); const d = r.bottom - (tr - 12); if(d > 0) window.scrollBy({top: Math.min(d, Math.max(0, r.top - 64)), behavior:'smooth'}); }, 300); }
}
function locate(){
  const btn = holder && holder.parentNode && holder.parentNode.querySelector('.mloc');
  if(!navigator.geolocation){ note('Location is not available on this device.'); return; }
  if(btn){ btn.disabled = true; btn.textContent = 'Locating…'; }
  navigator.geolocation.getCurrentPosition(p=>{
    const ll = [p.coords.latitude, p.coords.longitude];
    if(youMarker) youMarker.setLatLng(ll); else youMarker = L.circleMarker(ll, {radius:8, weight:3, color:'#fff', fillColor:'#2866C0', fillOpacity:1}).addTo(map).bindTooltip('You are here');
    map.setView(ll, Math.max(map.getZoom(), 13));
    if(btn){ btn.disabled = false; btn.textContent = 'Use My Location'; }
  }, err=>{
    note(err && err.code===1 ? 'Location is off for this site. Your accounts are still on the map.' : 'Could not find your location. Your accounts are still on the map.');
    if(btn){ btn.disabled = false; btn.textContent = 'Use My Location'; }
  }, {enableHighAccuracy:false, timeout:10000, maximumAge:60000});
}
function note(msg){
  const box = holder && holder.parentNode; if(!box) return;
  let n = box.querySelector('.mnote'); if(!n){ n = document.createElement('div'); n.className = 'mnote'; n.setAttribute('role', 'status'); box.appendChild(n); }
  n.textContent = msg; clearTimeout(n._t); n._t = setTimeout(()=>n.remove(), 6000);
}
window.KdhMap = {mount, _parseReason: REASON};
})();
