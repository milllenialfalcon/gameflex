# Spotlight header refresh

Straight Pixel "GAMEFLEX" text wordmark + lime `span.logo-pixel` returns in the header and footer (both keep
`aria-label="GAMEFLEX home"`); the curve-image consumer rules were removed from dist/spotlight.css (the unused
SVG asset stays on disk) and the footer text sits at 27px.

Desktop bar 75px -> 82.5px (+10%), logo 27px -> 29.7px, modest gap/search nudges, 44px search box and
header icons; <=720px adds ~10% vertical padding and keeps 44px touch targets. Header-right menu/account
markup and behaviour are unchanged. Active Discover underline: 2px lime, right-aligned under the label,
24px at rest, full text width on hover/focus (width .22s ease, none under reduced motion). Background #0b0d0b, hero fade, hero, catalogue and player untouched. Verified by review only; no browser pass was run.
