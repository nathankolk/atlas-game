# Orchestrator notes for the polish stage (from looking at screenshots, 17 Nov 05:10 UTC)

- Phone, continent rounds: the opening frame is too wide. shots/app/globe/m1-europe-m-dark.png shows the Arctic,
  Greenland and North Africa with Europe's countries small in the middle; the Balkans are too small to tap without
  zooming. On portrait phones fit the continent's width to the stage width (the clear area), accepting that the
  far north or south runs under the prompt card or off the stage.
- Night Chart: the round's own land and the dimmed context land are too close in tone (same screenshot: Europe's
  countries against North Africa and Russia-in-Asia). Parchment separates them clearly (m1-africa-d-light.png).
  Raise the contrast between `land` and `dim` in the dark `--g-*` tokens.
