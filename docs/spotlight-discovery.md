# Spotlight discovery

Only `spotlight.html` loads the discovery module and stylesheet. The shared app exposes the hero slides and conditionally delegates Spotlight shelf rendering; `index.html`, `style.css`, the catalogue and player files are unchanged.

Default browse contains nine short shelves, each with at most eight games. All 54 catalogue IDs appear exactly once. Shelves: Start here, Change the pace, Shooter legends, Build an empire, Think it through, Jump and run, Stories and adventures, Build a city, Fight and race. Future unclaimed games are split into eight-item More classics shelves.

Filters, search and favourites show every matching game in a responsive grid. Resting cards show artwork with no titles or captions below. Pending and unavailable entries retain small status overlays. Scrollbars are hidden; arrows, swipe and one-card keyboard navigation remain functional.

A 200ms hover, keyboard focus or first tap expands a card over its artwork. The panel is attached to the body and clamped inside the viewport, so it does not reflow shelves or get clipped by row overflow. It contains a title, genre, short description, availability and Play/View status, Favourite and Info actions. Pending status opens the existing blocked player without requesting a game frame. No availability decisions changed.

Escape restores focus without reopening the panel. Tab enters the panel controls and leaves for the next card, including across shelves. Outside clicks, filters, dialogs and player changes close it. Touch waits until the click to expand; expanding during focus would move the artwork under the finger and retarget the click. Reduced motion removes expansion animation. Supporting copy is 14px and actions have 44px minimum height.

Hermes handled the discovery UI, hero thumbnails and initial QA in separate file scopes using OpenCode Go / DeepSeek V4.1 Flash. Primary integration corrected overlay positioning, focus restoration, shelf-boundary tab order and touch click retargeting.

Validation: `npm run check`, `npm run test:discovery`, `npm run test:hero`, and `npm run test:browser`. Browser tests cover all 54 listings, decoded artwork, hover pointer travel, edge placement, Escape, tab order, favourites persistence, grids, touch at 390px, reduced motion, autoplay pauses and the unchanged homepage/player. Game hosts use local fixtures; these checks do not establish gameplay or embedding permission.
