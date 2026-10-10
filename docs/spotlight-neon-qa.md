# Spotlight neon review

Hermes implemented the header/logo and shelf/panel changes and prepared regression updates. Primary reviewed source and desktop/mobile screenshots, corrected stale test assumptions, and ran final checks.

- Restored straight Pixel GAMEFLEX header/footer; desktop nav 82.5px (+10%). Right-aligned underline expands across the label on hover/focus.
- Outline glyphs sit in a 16px gutter centered across title/subtitle. Subtitles align with title text.
- Top Games uses lime outlined SVG ranks, level with uniform portrait posters, with a subtle centered background glow. Rank 1 meets its poster; rank 10 remains readable. Top cards have accessible names and no visible title line.
- Continue Playing opens the existing player directly without hover panels. Green icons precede card names; examples show labelled sample progress. Real history has empty rails because cross-origin game progress is unavailable.
- Other panels center on the thumbnail, clamp within viewport/below navigation, and use the page background.
- Final validation: syntax/catalogue checks; 19 hero, 11 discovery, 9 history checks passed. Desktop and 390px mobile reviewed. Fixture launch checks do not verify live gameplay or hosting permission.
