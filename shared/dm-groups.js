/* Kohler Dist Hub -- rep -> district manager groups (2026-09-29).
   A MIRROR of DM_GROUPS in incentive-tracking/programs.js (both MPO
   programs.js carry the same list) for pages that have no reason to load
   a program registry but must scope a district manager to their team
   (Carbliss on-premise targets). When the DM groups change, change them
   here too -- scratchpad dm_test.mjs fails if the two drift apart. */
window.KDH_DM_GROUPS = [
  {dm:'Chris McCrohan', reps:['Allison Scott','Anthony Palmisano','Brian Sengebush','Nick Melissari','Paul Mclaughlin','Robin Feldman']},
  {dm:'Denise Montes', reps:['Derrick Laws','Javier Melo','Jim Heaney','Matt Powierski','Pablo Lopez']},
  {dm:'Mike Engel', reps:['Chris Payton','Dan Lagala','Dave Ehlers','Phil Ernst']},
  {dm:'Mike Kennedy', reps:['Alex Rodriguez','Alisa Acciardi','Andrew Lundy','Dylan Rubino','Hakan Sadik','Jaime Colonna',"John O'Donoghue",'Michael Harboy']},
  {dm:'Paul Deady', reps:['Jayson Romine','Klejdi Lamo','Mike Ast','Shane Barreca']},
];
