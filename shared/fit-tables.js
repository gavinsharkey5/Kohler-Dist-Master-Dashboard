/* FIT TABLES (2026-10-06) -- one pass over the supporting tables inside program
   cards (MPO trackers' Details / rep rows, the hub's program screens) so each
   table fits its content. PRESENTATION ONLY: no number, row or record changes.

   KdhFit.tables(root) -- for every <table> with a header row under `root`:
     * a column whose every body cell is blank or a dash ("", "—", "–", "-")
       across the WHOLE table (all rows, hidden "show more" rows included) is
       hidden (class kf-off) and named once under the table: "Column hidden
       (blank on every row): Date." -- zero is a value and keeps its column; a cell with a
       link, photo or icon counts as filled; the last visible column is never
       hidden
     * every body cell gets data-l = its column heading (phone layouts label
       stacked cells with it)
     * the table is tagged kf-2 (one or two visible columns: stays a real
       table on a phone) or kf-n (more: stacked labelled records on a phone)
   Rows whose cell count differs from the header (colspan rows, expanders) are
   left alone. Safe to call again: a table is processed once. */
(function (global) {
  'use strict';
  var BLANK = /^(?:|—|–|-|n\/a)$/i;
  function filled(td) {
    if (!td) return false;
    if (td.querySelector('img,a,svg,input,button')) return true;
    return !BLANK.test(String(td.textContent || '').replace(/\s+/g, ' ').trim());
  }
  function fitOne(t) {
    if (t.dataset.kf) return; t.dataset.kf = '1';
    var head = t.querySelector('thead tr'); if (!head) return;
    var ths = Array.prototype.slice.call(head.children);
    if (!ths.length) return;
    var rows = Array.prototype.slice.call(t.querySelectorAll('tbody tr')).filter(function (r) { return r.children.length === ths.length; });
    if (!rows.length) return;
    var hidden = [];
    ths.forEach(function (th, i) {
      var label = String(th.textContent || '').replace(/\s+/g, ' ').trim();
      rows.forEach(function (r) { var td = r.children[i]; if (td && label && !td.hasAttribute('data-l')) td.setAttribute('data-l', label); });
      var any = rows.some(function (r) { return filled(r.children[i]); });
      if (!any && ths.length - hidden.length > 1 && label) {
        hidden.push(label);
        th.classList.add('kf-off');
        rows.forEach(function (r) { if (r.children[i]) r.children[i].classList.add('kf-off'); });
      }
    });
    var visible = ths.length - hidden.length;
    t.classList.add(visible <= 2 ? 'kf-2' : 'kf-n');
    if (hidden.length) {
      var p = document.createElement('p');
      p.className = 'kf-note';
      p.textContent = (hidden.length === 1 ? 'Column hidden' : 'Columns hidden') + ' (blank on every row): ' + hidden.join(', ') + '.';
      (t.parentNode || t).insertBefore(p, t.nextSibling);
    }
  }
  function tables(root) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('table'), fitOne);
  }
  global.KdhFit = { tables: tables };
})(typeof window !== 'undefined' ? window : globalThis);
