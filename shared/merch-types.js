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
    { k: 'pod',         label: 'PODs',             one: 'POD',             hint: 'SKUs on the shelf or in the door, facings and price' },
    { k: 'cooler_door', label: 'Cooler Door Stickers', one: 'Cooler Door Sticker', hint: 'Logo, price or promo stickers on the cooler' },
    { k: 'window',      label: 'Windows',          one: 'Window',          hint: 'Posters, banners and clings in the window' },
    { k: 'signage',     label: 'Signage',          one: 'Signage',         hint: 'Posters, banners, neons, shelf talkers' },
    { k: 'tap_handle',  label: 'Tap Handles',      one: 'Tap Handles',     hint: 'Brands on tap and how many handles' },
    { k: 'menu',        label: 'Menu Placements',  one: 'Menu Placement',  hint: 'Menu listings, features and promos' },
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

  /* CAPTURE ITEMS (2026-10-05). The selected type decides the form: what one item
     (one row in merch_lines) asks for. Each item = the thing chosen by search
     (`pick`: 'sku' = a catalogue product, 'brand' = a brand, 'either' = brand or SKU)
     + chip groups (stored in merch_lines.attrs under `k`, codes below) + optional
     facings / taps (quantity) and price to consumer (consumer_price). `req` chip
     groups must be answered; `opt` ones may be left blank. `rec` = a record-level
     choice asked once (merch_records.location). `add` = the "+ Add Another" label. */
  var O = function (pairs) { return pairs.map(function (p) { return { k: p[0], l: p[1] }; }); };
  var POD_TYPE = O([['door', 'Door'], ['shelf', 'Shelf'], ['special', 'Special']]);
  var SHELF = O([['top', 'Top'], ['eye', 'Eye Level'], ['well', 'Well']]);
  var ITEMS = {
    pod:        { pick: 'sku', noun: 'SKU', add: 'Add Another SKU', qty: 'facings', price: true,
                  groups: [{ k: 'pod_type', l: 'POD Type', o: POD_TYPE, req: true }, { k: 'shelf', l: 'Location', o: SHELF, req: true }] },
    display:    { pick: 'sku', noun: 'SKU', add: 'Add Another SKU', qty: 'facings', price: true,
                  groups: [{ k: 'pod_type', l: 'POD Type', o: POD_TYPE, req: true, def: 'special' }, { k: 'shelf', l: 'Location', o: SHELF, req: true }] },
    cooler_door:{ pick: 'brand', noun: 'Brand', add: 'Add Another Sticker',
                  groups: [{ k: 'sticker', l: 'Sticker Type', o: O([['brand', 'Logo / Brand'], ['price', 'Price'], ['promo', 'Promo'], ['new', 'New Product'], ['other', 'Other']]), req: true },
                           { k: 'cooler', l: 'Cooler', o: O([['beer_cave', 'Beer Cave'], ['main', 'Main Cooler'], ['front', 'Front Cooler'], ['checkout', 'Checkout Cooler'], ['other', 'Other']]), req: true },
                           { k: 'placement', l: 'Placement', o: O([['door', 'Door'], ['header', 'Header'], ['side', 'Side Panel'], ['other', 'Other']]), req: true }] },
    window:     { pick: 'brand', noun: 'Brand', add: 'Add Another',
                  groups: [{ k: 'material', l: 'Material', o: O([['poster', 'Poster'], ['banner', 'Banner'], ['cling', 'Cling'], ['decal', 'Decal'], ['sign', 'Sign'], ['other', 'Other']]), req: true },
                           { k: 'window', l: 'Window', o: O([['front', 'Front'], ['side', 'Side'], ['entrance', 'Entrance Door'], ['other', 'Other']]), req: true },
                           { k: 'theme', l: 'Theme', o: O([['football', 'Football'], ['summer', 'Summer'], ['halloween', 'Halloween'], ['holiday', 'Holiday'], ['game_day', 'Game Day'], ['price', 'Price Promotion'], ['custom', 'Custom']]), opt: true }] },
    signage:    { pick: 'brand', noun: 'Brand', add: 'Add Another',
                  groups: [{ k: 'material', l: 'Signage', o: O([['poster', 'Poster'], ['banner', 'Banner'], ['neon', 'Neon / Light'], ['shelf_talker', 'Shelf Talker'], ['sign', 'Sign'], ['other', 'Other']]), req: true },
                           { k: 'theme', l: 'Theme', o: O([['football', 'Football'], ['summer', 'Summer'], ['halloween', 'Halloween'], ['holiday', 'Holiday'], ['game_day', 'Game Day'], ['price', 'Price Promotion'], ['custom', 'Custom']]), opt: true }] },
    menu:       { pick: 'either', noun: 'Brand or SKU', add: 'Add Another Placement', price: true,
                  groups: [{ k: 'placement', l: 'Placement', o: O([['permanent', 'Permanent Listing'], ['featured', 'Featured'], ['special', 'Special'], ['callout', 'Callout'], ['logo', 'Logo'], ['other', 'Other']]), req: true },
                           { k: 'menu', l: 'Menu', o: O([['drink', 'Drink Menu'], ['beer', 'Beer Menu'], ['cocktail', 'Cocktail Menu'], ['table_tent', 'Table Tent'], ['board', 'Specials Board'], ['digital', 'Digital Menu'], ['other', 'Other']]), req: true },
                           { k: 'promo', l: 'Promotion', o: O([['happy_hour', 'Happy Hour'], ['featured_cocktail', 'Featured Cocktail'], ['game_day', 'Game Day'], ['seasonal', 'Seasonal'], ['lto', 'Limited Time'], ['other', 'Other']]), opt: true }] },
    tap_handle: { pick: 'tap', noun: 'Brand', add: 'Add Brand', qty: 'taps', own: true,
                  rec: { k: 'location', l: 'Location', o: O([['Main Bar', 'Main Bar'], ['Back Bar', 'Back Bar'], ['Service Bar', 'Service Bar'], ['Patio', 'Patio'], ['Other', 'Other']]), req: true } },
    other:      { pick: 'brand', noun: 'Brand', add: 'Add Brand', what: true, groups: [] }
  };
  // "Shelf · Eye Level · 4 facings · $19.99" -- one line per item, the same everywhere
  function optLabel(cat, k, v) {
    var spec = ITEMS[cat]; var g = spec && (spec.groups || []).filter(function (x) { return x.k === k; })[0];
    var o = g && g.o.filter(function (x) { return x.k === v; })[0]; return o ? o.l : (v || '');
  }
  function money(v) { var n = Number(v); return v == null || v === '' || isNaN(n) ? '' : '$' + n.toFixed(2); }
  function itemText(cat, l) {
    var a = l.attrs || {}, spec = ITEMS[cat] || {}, bits = [];
    (spec.groups || []).forEach(function (g) { if (!a[g.k]) return; if (g.k === 'theme' && a[g.k] === 'custom') { if (a.theme_text) bits.push(a.theme_text); return; } bits.push(optLabel(cat, g.k, a[g.k])); });
    if (l.quantity != null && l.quantity !== '') bits.push(qtyText(l.quantity, l.quantity_unit));
    if (l.consumer_price != null && l.consumer_price !== '') bits.push(money(l.consumer_price));
    return bits.join(' · ');
  }
  global.KdhMerch = { CATS: CATS, BY_PREMISE: BY_PREMISE, SUBTYPES: SUBTYPES, SUB_LABEL: SUB_LABEL, UNITS: UNITS, UNIT_LABEL: UNIT_LABEL,
    LINES: LINES, cat: cat, catLabel: catLabel, qtyText: qtyText, SOURCE_LABEL: SOURCE_LABEL, ITEMS: ITEMS, optLabel: optLabel, itemText: itemText, money: money };
})(typeof window !== 'undefined' ? window : globalThis);
