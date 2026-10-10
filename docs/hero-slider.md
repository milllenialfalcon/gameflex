# Spotlight carousel

The hero reads `spotlight` and `featured` entries from `dist/games.json`; this batch provides 11 slides including six DOS Zone titles. Each slide uses `heroArt` if present, then its normal artwork. Halo retains its existing wide screenshot.

Previous/next, numbered selectors and arrow keys change the current slide without autoplay. In the integrated player build, the action opens the current game's internal player. The title, description, requirements, artwork, active selector and index update together. Reduced motion disables image animation. Compact selectors scroll horizontally; the mobile panel stacks below the intro.

DOS Zone slides and cards clearly say sandbox pending. In the integrated build they open the player explanation without creating an iframe or remote session. There is no external fallback. Enabling remote-browser playback remains separate work requiring verification.

Hermes implemented the carousel, source discovery, image fetching and initial responsive checks. The primary agent reviewed images, corrected the PES 6 host-logo mismatch, integrated the pending states and compact controls, and ran final browser QA. The catalogue worker was stopped after exceeding its timebox once its implementation and browser checks had been saved; it did not publish or commit changes.

Checks: `npm run check`, `npm run test:research`, `npm run test:catalogue-gate`, `npm run test:catalogue`, and the existing browser regression script. QA output and screenshots are under ignored `artifacts/qa/`.
