FROZEN CLOSED MONTHS (2026-10-05, Gavin)

PROGRAM_DATA_2026_08.json and PROGRAM_DATA_2026_09.json are the August and September
incentive blobs EXACTLY as published on 2026-10-05 before the customer-base refresh.
generate.py restores them over whatever it would rebuild, so a base / CSV refresh cannot
move a finished month. October and later rebuild normally.

The versions a rebuild would have produced after the 2026-10-05 customer-base refresh
(same programs, mostly refreshed 2026 case volumes on target lists + 25 new accounts) are
filed in ../refreshed_archive/ in case Gavin ever wants them applied.

To re-open a month on purpose:  KDH_UNFREEZE=1 python3 generate.py
then copy the new blobs over these files to freeze them again.
