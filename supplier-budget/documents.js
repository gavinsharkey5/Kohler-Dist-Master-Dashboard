/* Private invoice PDFs. Expense UUIDs survive ledger sorting and imports.
   Filename matches are suggestions only; an editor reviews before uploading. */
(function (root) {
'use strict';
const BUCKET = 'supplier-invoices', MAX = 20 * 1024 * 1024;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s || '').trim().toLowerCase().replace(/\.0+$/, '');
function matches(name, rows) {
  const stem = name.replace(/\.pdf$/i, '').toLowerCase();
  return rows.filter(r => {
    const n = norm(r.invoice);
    // Do not attach generic ledger labels such as "Samples" by filename.
    if (!n || !/\d/.test(n)) return false;
    const token = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9])' + token + '($|[^a-z0-9])', 'i').test(stem);
  });
}
function create(host) {
  let docs = [], state = 'loading', queue = [], busy = false, dialog;
  const rows = () => host.rows();
  const forRow = id => docs.filter(d => d.expense_id === id);
  async function storage(path, options, retried) {
    const c = host.cfg();
    if (!c) throw new Error('Sign in again to open or attach PDFs.');
    const r = await fetch(c.url + '/storage/v1/' + path, Object.assign({}, options, {headers: Object.assign({apikey:c.key, authorization:'Bearer ' + c.token}, options && options.headers)}));
    if (r.status === 401 && !retried && root.kdhFreshToken) { await root.kdhFreshToken(); return storage(path, options, true); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok && !(options && options.method === 'POST' && path.startsWith('object/' + BUCKET + '/') && (r.status === 409 || String(data.statusCode) === '409' || data.error === 'Duplicate'))) throw new Error(data.message || data.error || 'The PDF could not be saved. Try again.');
    return data;
  }
  async function load() {
    state = 'loading';
    try {
      const all = [];
      for (let offset = 0;; offset += 500) {
        const part = await host.rest('supplier_invoice_documents?select=*&order=created_at.asc,id.asc&limit=500&offset=' + offset);
        all.push(...part); if (part.length < 500) break;
      }
      docs = all; state = 'ready';
    } catch (_) { state = 'error'; }
  }
  function html(r, detail) {
    const files = forRow(r.id);
    const status = state === 'error' ? '<span class="pdf-status">PDF status unavailable</span>' : state === 'loading' ? '<span class="pdf-status">Checking PDFs…</span>' : !files.length ? '<span class="pdf-status missing">Missing PDF</span>' : '';
    return '<span class="invoice-docs">' + status + files.map((d, i) => '<button type="button" class="pdf-link" data-pdf="' + esc(d.id) + '" title="' + esc(d.file_name + (d.uploaded_name ? ' · Uploaded by ' + d.uploaded_name : '') + ' · ' + d.created_at.slice(0,10)) + '">View PDF' + (files.length > 1 ? ' ' + (i+1) : '') + '</button>' + (detail ? '<span class="pdf-filename">' + esc(d.file_name) + '</span>' : '')).join('') +
      (host.canEdit() && state === 'ready' ? '<button type="button" class="pdf-link" data-attach-pdf="' + esc(r.id) + '">Attach PDF</button>' : '') + '</span>';
  }
  function toolbar() { return '<div class="pdf-toolbar"><span>Invoice documents</span>' + (host.canEdit() && state === 'ready' ? '<button class="btn" type="button" data-bulk-pdf>Bulk Upload PDFs</button>' : '') + (state === 'error' ? '<span>PDF status could not be loaded.</span><button type="button" class="btn" data-retry-pdf>Retry PDFs</button>' : '') + '</div>'; }
  async function open(id, button) {
    const d = docs.find(x => x.id === id);
    // A preview may show fewer rows than the signed-in editor's database scope.
    if (!d || !rows().some(r => r.id === d.expense_id)) return;
    const win = root.open('about:blank', '_blank'); if (win) win.opener = null;
    button.disabled = true;
    try {
      const c = host.cfg();
      const result = await storage('object/sign/' + BUCKET + '/' + d.storage_path, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({expiresIn:60})});
      const signed = result.signedURL || result.signedUrl;
      if (!signed || !signed.startsWith('/object/sign/' + BUCKET + '/')) throw new Error('The PDF link could not be created.');
      const href = c.url + '/storage/v1' + signed;
      if (win) win.location.replace(href);
      else showLink(href);
    } catch (e) { if (win) win.close(); root.alert(e.message); }
    finally { button.disabled = false; }
  }
  function showLink(href) {
    const d = document.createElement('dialog'); d.className = 'pdf-dialog';
    d.innerHTML = '<h2>Invoice PDF</h2><p>Your browser blocked the new tab.</p><a class="btn" target="_blank" rel="noopener" href="' + esc(href) + '">Open PDF</a> <button class="btn" type="button">Close</button>';
    d.querySelector('button').onclick = () => d.close(); d.onclose = () => d.remove(); document.body.append(d); d.showModal();
  }
  function launch(expenseId) {
    if (!host.canEdit() || busy) return;
    queue = [];
    dialog = document.createElement('dialog'); dialog.className = 'pdf-dialog'; dialog.setAttribute('aria-label', expenseId ? 'Attach invoice PDF' : 'Bulk upload invoice PDFs');
    const target = rows().find(r => r.id === expenseId);
    dialog.innerHTML = '<div class="pdf-dialog-head"><h2>' + (target ? 'Attach PDF · ' + esc(target.invoice || target.vendor) : 'Bulk Upload PDFs') + '</h2><button type="button" class="btn" data-close>Close</button></div>' +
      '<p>Select PDFs named with the invoice number, such as <b>1234567 Supplier.pdf</b>. Review each match before saving. Use the selector to resolve unmatched or repeated invoice numbers. PDF only, up to 20 MB each; 200 files per batch.</p>' +
      '<label class="btn pdf-picker">Choose PDFs<input type="file" accept="application/pdf,.pdf" multiple></label><p class="pdf-progress" role="status"></p><div class="pdf-queue"></div><button type="button" class="btn primary" data-save disabled>Upload Reviewed PDFs</button>';
    document.body.append(dialog);
    const close = () => { if (!busy) dialog.close(); };
    dialog.querySelector('[data-close]').onclick = close;
    dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    dialog.onclose = () => { dialog.remove(); host.changed(); };
    dialog.querySelector('input').onchange = async e => {
      const files = Array.from(e.target.files);
      if (files.length > 200) { dialog.querySelector('[role=status]').textContent = 'Choose up to 200 files at a time.'; return; }
      queue = files.map(file => {
        const candidates = target ? [target] : matches(file.name, rows());
        return {file, candidates, expense: candidates.length === 1 ? candidates[0].id : '', id:crypto.randomUUID(), status:'', done:false};
      });
      renderQueue();
    };
    dialog.querySelector('[data-save]').onclick = save;
    dialog.showModal();
  }
  function label(r) { return [r.year, r.invoice || '(No invoice)', r.vendor, r.account, r.expense_date].filter(Boolean).join(' · '); }
  function renderQueue() {
    const available = rows();
    dialog.querySelector('.pdf-queue').innerHTML = queue.map((q, i) => {
      const valid = /\.pdf$/i.test(q.file.name) && q.file.size > 0 && q.file.size <= MAX;
      q.invalid = !valid;
      const choices = q.candidates;
      const disabled = busy || q.done || !valid ? ' disabled' : '';
      return '<div class="pdf-queue-row"><b>' + esc(q.file.name) + '</b><label>Find an expense<input type="search" data-find="' + i + '" placeholder="Invoice, vendor, account or year"' + disabled + '></label><label>Attach to invoice<select data-match="' + i + '"' + disabled + '><option value="">' + (q.candidates.length > 1 ? 'Multiple matches — choose invoice' : 'Choose an expense') + '</option>' + choices.map(r => '<option value="' + esc(r.id) + '"' + (q.expense === r.id ? ' selected' : '') + '>' + esc(label(r)) + '</option>').join('') + '</select></label><span role="status">' + esc(!valid ? 'Choose a nonempty PDF of 20 MB or less.' : q.status || (q.expense ? 'Matched — review before upload' : 'Needs a match; will be skipped until selected')) + '</span></div>';
    }).join('');
    dialog.querySelectorAll('[data-match]').forEach(el => el.onchange = () => { queue[+el.dataset.match].expense = el.value; queue[+el.dataset.match].status = ''; updateSave(); });
    dialog.querySelectorAll('[data-find]').forEach(el => el.oninput = () => {
      const q = queue[+el.dataset.find], search = el.value.trim().toLowerCase();
      const selected = available.filter(r => r.id === q.expense);
      q.candidates = [...new Map(selected.concat(available.filter(r => label(r).toLowerCase().includes(search)).slice(0,50)).map(r => [r.id,r])).values()];
      const select = dialog.querySelector('[data-match="' + el.dataset.find + '"]');
      select.innerHTML = '<option value="">Choose an expense</option>' + q.candidates.map(r => '<option value="' + esc(r.id) + '"' + (r.id === q.expense ? ' selected' : '') + '>' + esc(label(r)) + '</option>').join('');
    });
    updateSave();
  }
  function updateSave() { dialog.querySelector('[data-save]').disabled = busy || !queue.some(q => q.expense && !q.invalid && !q.done); }
  async function attach(q) {
    if (!host.canEdit() || !rows().some(r => r.id === q.expense)) throw new Error('That expense is no longer available.');
    const bytes = await q.file.arrayBuffer();
    if (new TextDecoder().decode(bytes.slice(0,5)) !== '%PDF-') throw new Error('This file is not a PDF.');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2,'0')).join('');
    // Re-read from the server on retries, including a response lost after commit.
    const existing = await host.rest('supplier_invoice_documents?select=*&expense_id=eq.' + q.expense + '&sha256=eq.' + hash);
    if (existing.length) { docs = docs.filter(d => d.id !== existing[0].id).concat(existing); return 'Already attached — skipped duplicate'; }
    const path = q.expense + '/' + q.id + '.pdf';
    await storage('object/' + BUCKET + '/' + path, {method:'POST', headers:{'content-type':'application/pdf', 'x-upsert':'false'}, body:bytes});
    const record = {id:q.id, expense_id:q.expense, storage_path:path, file_name:q.file.name, size_bytes:bytes.byteLength, sha256:hash};
    try {
      const saved = await host.rest('supplier_invoice_documents?select=*', {method:'POST', body:record, headers:{prefer:'return=representation'}});
      if (!saved || saved.length !== 1) throw new Error('The attachment was not confirmed. Retry this file.');
      docs.push(saved[0]);
    } catch (e) {
      // Leave the immutable object for a safe retry; never delete after an uncertain commit.
      const saved = await host.rest('supplier_invoice_documents?select=*&expense_id=eq.' + q.expense + '&sha256=eq.' + hash);
      if (!saved.length) throw e;
      docs = docs.filter(d => d.id !== saved[0].id).concat(saved);
    }
    return 'Attached';
  }
  async function save() {
    if (busy || !host.canEdit()) return;
    busy = true; dialog.querySelector('input').disabled = true; dialog.querySelector('[data-close]').disabled = true;
    renderQueue();
    for (const q of queue) {
      if (!q.expense || q.invalid || q.done) continue;
      q.status = 'Uploading…'; renderQueue();
      try { q.status = await attach(q); q.done = true; }
      catch (e) { q.status = 'Failed: ' + e.message; }
      renderQueue();
    }
    busy = false; dialog.querySelector('input').disabled = false; dialog.querySelector('[data-close]').disabled = false; renderQueue();
    const done = queue.filter(q => q.done).length;
    dialog.querySelector('[role=status]').textContent = done + ' of ' + queue.length + ' files attached or already present. Resolve remaining matches or retry failed files.';
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pdf],[data-attach-pdf],[data-bulk-pdf],[data-retry-pdf]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (b.hasAttribute('data-pdf')) open(b.dataset.pdf,b);
    else if (b.hasAttribute('data-retry-pdf')) load().then(host.changed);
    else launch(b.dataset.attachPdf || '');
  });
  return {load, html, toolbar};
}
root.KdhInvoiceDocuments = {create, matches};
})(typeof window === 'undefined' ? globalThis : window);
