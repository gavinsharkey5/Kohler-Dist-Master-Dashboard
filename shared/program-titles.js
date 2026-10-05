/* PROGRAM DISPLAY TITLES (2026-10-02). The one explicit map from a program's
   id to the concise title reps see on rows, cards and headings. It changes
   ONLY the label: the source name (the supplier's / tracker's title, with
   the full requirement), the program id, eligibility, goals, percentages and
   every calculation stay exactly as the trackers define them. The full
   source name is still shown on the program screen ("Full program name")
   and the requirement under "Qualifies" / "How it is scored".

   Rules: name the brand and what is being counted ("Keystone Ice Buyers");
   supplier and premise are shown beside the title, not inside it; keep two
   distinct programs distinguishable (same brand, different month or
   premise is told apart by the period / premise metadata on every row);
   official brand spellings. Ids not listed fall back to the tracker's own
   short title. Incentive ids are inc:<key>; MPO ids <on|off>:<YYYY-MM>:<key>.
   Add a line here whenever a new program is loaded. */
(function(){
'use strict';
var T = {
  // ---- incentives
  'inc:mabi_single_serve': 'Mark Anthony Single Serve',
  'inc:four_loko': 'Four Loko Volume Rewards',
  'inc:lagunitas_sprint': 'Lagunitas Sprint to the Finish',
  'inc:famosa_oct': 'Push Famosa',
  'inc:sam_adams_cold_snap': 'Sam Adams Seasonal Draft Conversion',
  'inc:industrial_arts': 'Industrial Arts Launch',
  'inc:touchdowns_tea': 'Touchdowns & Tea',
  'inc:lytt': 'Lytt Launch',
  'inc:other_half': 'Other Half Launch',
  'inc:le_grand_noir': 'Le Grand Noir Volume',
  'inc:printed_menu': 'Bardstown Printed Menu',
  'inc:bardstown_display': 'Bardstown Display & Activation',
  'inc:two_xo': '2XO Bourbon',
  'inc:mc_retention': 'Molson Coors Retention',
  'inc:constellation_fall': 'Constellation Fall Distribution',
  'inc:mabi_retention_fall': 'Mark Anthony Retention',
  'inc:yuengling_retention_fall': 'Yuengling Retention',
  'inc:heineken_husa': 'Heineken USA Retention',
  'inc:new_belgium_distribution_retain': 'New Belgium Distribution Retain',
  'inc:keystone_ice': 'Keystone Ice 24 oz Cans',
  'inc:evil_genius': 'Evil Genius Core Growth',
  'inc:montauk': 'Montauk Wave Chaser Placements',
  'inc:path_to_victory_sd': 'Path to Victory (Southern District)',
  'inc:fall_seasonal_sd': 'Fall Seasonal Fast Start (Southern District)',
  'inc:sam_adams_conversion': 'Sam Adams Octoberfest Draft Conversion',
  'inc:sam_adams': 'Sam Adams Octoberfest Fast Start',
  'inc:1911': 'Beak & Skiff 1911 Rewards',
  'inc:woodchuck': 'Woodchuck Cider Rewards',
  'inc:tona': 'Tona Distribution & Volume',
  'inc:garage_beer_president': 'Garage Beer President’s Incentive',
  'inc:path_to_victory': 'Path to Victory',
  'inc:boston_beer': 'Boston Beer August Draft Blitz',
  'inc:new_belgium': 'New Belgium Summer Draft',
  'inc:fall_seasonal': 'Fall Seasonal Fast Start',
  'inc:sun_cruiser': 'Sun Cruiser Volume',
  'inc:yave': 'Yave Tequila Launch',
  'inc:mollys': 'Molly’s 1.75 L',
  'inc:garage_beer_summer_sequel': 'Garage Beer Summer Sequel',
  'inc:new_belgium_distribution': 'New Belgium Distribution Push',
  'inc:display_auction': 'iSellBeer Summer Display Auction',
  'inc:mabi_retention': 'Mark Anthony Retention',
  'inc:constellation_retention': 'Constellation Retention',
  'inc:yuengling_retention': 'Yuengling Retention',
  // ---- on-premise MPOs
  'on:2026-07:carbliss': 'Carbliss New Buying Accounts',
  'on:2026-07:sapporo_na': 'Sapporo NA New Buying Accounts',
  'on:2026-07:wine_spirits': 'Wine & Spirits Placements',
  'on:2026-07:isellbeer': 'iSellBeer Qualifying Photos',
  'on:2026-08:angry_orchard': 'Angry Orchard Draft Lines',
  'on:2026-08:molson_coors': 'Peroni & Banquet Placements',
  'on:2026-08:wine_spirits': 'Yave & Leyenda Buying Accounts',
  'on:2026-08:isellbeer': 'iSellBeer Qualifying Photos',
  'on:2026-09:bardstown_menu': 'Bardstown Menu Placements',
  'on:2026-09:fever_tree': 'Fever-Tree Placements',
  'on:2026-09:carbliss': 'Carbliss New Buying Accounts',
  'on:2026-09:husa_xx_draft': 'Dos Equis Draft Line',
  // ---- off-premise MPOs
  'off:2026-07:new_belgium': 'New Belgium Distribution Goal',
  'off:2026-07:ws_2xo': '2XO, Le Grand & Yave Placements',
  'off:2026-07:sapporo_light': 'Sapporo Light Placements',
  'off:2026-07:famosa': 'Famosa 7 oz Placements',
  'off:2026-07:disruptors': 'Disruptor Photos',
  'off:2026-08:corona_premier': 'Corona Premier Suitcase Placements',
  'off:2026-08:bbc_lytt': 'Lytt Distribution',
  'off:2026-08:molson_coors': 'Peroni & Banquet Placements',
  'off:2026-08:wine_spirits': 'Le Grand, Leyenda & Green River Placements',
  'off:2026-08:disruptors': 'Lytt POS Photos',
  'off:2026-09:constellation_gaintain': 'Corona Gaintain Distribution',
  'off:2026-09:keystone_ice': 'Keystone Ice Buyers',
  'off:2026-09:fever_tree': 'Fever-Tree Placements',
  'off:2026-09:wine_spirits_any': 'Wine & Spirits Placements, Any Brand',
  'off:2026-09:pos_stickers': 'Cooler Door Stickers',
  'on:2026-10:carbliss': 'Carbliss Buying Accounts',
  'on:2026-10:sam_adams_conversion': 'Oktoberfest Draft Conversion',
  'on:2026-10:spirits_followup': 'Spirits Follow-Up',
  'on:2026-10:isellbeer': 'iSellBeer Feature Photos',
  'off:2026-10:constellation_innovation': 'Corona Innovation',
  'off:2026-10:bbc_lytt': 'Lytt Buying Accounts',
  'off:2026-10:mollys': 'Molly\u2019s New Placements',
  'off:2026-10:wine_new': 'Wine New Placements',
  'off:2026-10:pos_stickers': 'Cooler Door Stickers'
};
window.KDH_PROGRAM_TITLES = T;
window.kdhTitle = function(id, fallback){ return (id && T[id]) || fallback || id || ''; };
})();
