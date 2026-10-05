/* MERCHANDISING TYPES (2026-10-04) -- the one list of categories, subtypes,
 * quantity units and labels, shared by the Account page (capture, gallery,
 * activity), the manager recap and the iSellBeer importer. Values match the
 * database checks in supabase/migrations/20261004090000_merchandising.sql
 * (+ pod / signage: 20261005120000_merch_pod_signage.sql).
 *
 * Categories are the Hub's simplified evidence types. iSellBeer's own
 * Promotion Type / Theme / Elements are kept separately on each imported
 * record and are never rewritten into these. */
(function (global) {
  'use strict';
  var CATS = [
    { k: 'display',     label: 'Display',          one: 'Display',         hint: 'Floor stack, end cap, case stack' },
    { k: 'pod',         label: 'PODs',             one: 'POD',             hint: 'New items on the shelf or in the cooler' },
    { k: 'cooler_door', label: 'Cooler Door',      one: 'Cooler Door',     hint: 'Door wrap, cling or decal' },
    { k: 'window',      label: 'Window',           one: 'Window',          hint: 'Window display, cling or banner' },
    { k: 'signage',     label: 'Signage',          one: 'Signage',         hint: 'Posters, banners, neons, shelf talkers' },
    { k: 'tap_handle',  label: 'Tap Handles',      one: 'Tap Handles',     hint: 'The tap wall or a single handle' },
    { k: 'menu',        label: 'Menu Placement',   one: 'Menu Placement',  hint: 'Menu, cocktail or spirit list, table tent' },
    { k: 'other',       label: 'Other Activation', one: 'Other Activation', hint: 'Tasting, event, anything else' }
  ];
  // the most relevant first for each premise; every type stays one tap away
  // (Gavin, 2026-10-05) off-premise: displays, PODs, cooler doors, windows, signage; on-premise: taps, menu promos (+ signage)
  var BY_PREMISE = { Off: ['display', 'pod', 'cooler_door', 'window', 'signage', 'other'], On: ['tap_handle', 'menu', 'signage', 'other'] };
  var SUBTYPES = {
    menu: [['menu', 'Menu'], ['cocktail_list', 'Cocktail List'], ['spirit_list', 'Spirit List'], ['table_tent', 'Table Tent']],
    cooler_door: [['cooler_door_wrap', 'Cooler Door Wrap']],
    other: [['tasting_event', 'Tasting / Event'], ['other', 'Other (describe)']]
  };
  var SUB_LABEL = { menu: 'Menu', cocktail_list: 'Cocktail List', spirit_list: 'Spirit List', table_tent: 'Table Tent',
    cooler_door_wrap: 'Cooler Door Wrap', tasting_event: 'Tasting / Event', other: 'Other' };
  // a quantity never travels without its unit; "unspecified" = the source gave a number without saying what it counts
  var UNITS = [['cases', 'Cases'], ['bottles', 'Bottles'], ['units', 'Units'], ['facings', 'Facings'], ['placements', 'Placements'], ['taps', 'Taps'], ['unspecified', 'Unit not stated']];
  var UNIT_LABEL = {}; UNITS.forEach(function (u) { UNIT_LABEL[u[0]] = u[1]; });
  // categories whose capture asks for product lines with quantities
  var LINES = { display: 'qty', pod: 'qty', tap_handle: 'taps' };
  function cat(k) { for (var i = 0; i < CATS.length; i++) if (CATS[i].k === k) return CATS[i]; return null; }
  function catLabel(k) { var c = cat(k); return c ? c.label : (k ? 'Uncategorized' : 'Uncategorized'); }
  function qtyText(q, unit) {
    if (q == null || q === '') return 'Quantity not recorded';
    var n = Number(q); var u = unit || 'unspecified';
    if (u === 'unspecified') return n + ' (unit not stated)';
    var lab = (UNIT_LABEL[u] || u).toLowerCase();
    if (n === 1) lab = lab.replace(/s$/, '');
    return n + ' ' + lab;
  }
  var SOURCE_LABEL = { hub: 'Captured in Kohler Hub', isellbeer: 'Imported From iSellBeer' };
  global.KdhMerch = { CATS: CATS, BY_PREMISE: BY_PREMISE, SUBTYPES: SUBTYPES, SUB_LABEL: SUB_LABEL, UNITS: UNITS, UNIT_LABEL: UNIT_LABEL,
    LINES: LINES, cat: cat, catLabel: catLabel, qtyText: qtyText, SOURCE_LABEL: SOURCE_LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
