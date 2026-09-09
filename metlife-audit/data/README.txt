Drop a phone export here as audit.json to publish it to the dashboard:

  metlife-audit/data/audit.json

The dashboard fetches this file on load and merges it with whatever is
saved on the viewing device. Export it from the app: Log tab -> "Export
(with photos)". Photos are embedded as JPEG data URLs (~100 KB each), so
a 200-location audit with photos is roughly 20-40 MB -- fine for GitHub
but do not hand-edit it.
