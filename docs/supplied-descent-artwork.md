# Supplied artwork: Descent

Scope: this document records the normalisation of a single supplied artwork file
for the `dos-descent` spotlight entry. It changes no permission, availability or
launch claim, and makes no new claim of either kind.

## Source

- Original: `D:\AI\Gameflex\descent-offer-8hanc.jpg`
- Source dimensions: `2560x1440` (exact 16:9)
- Source SHA256: `358617DB3D9BD16974CBA37227D11B61F198FA547192A49C1B5345E88ACB2686`
  (digest of the original, taken before the run and re-checked unchanged afterwards)

## Output

- Path: `dist/assets/supplied-artwork/dos-descent.webp`
- Format: WebP, quality 90, method 6
- Dimensions: `1280x720` (exact 16:9)
- Resampling: Lanczos
- Crop: none - the source is already exact 16:9, so the whole image was
  proportionally resized to the target size with no crop and no stretch.
- No text, logo, title or watermark was added.

## Manifest change

`dist/spotlight-thumbnails.json` -> `dos-descent` now reads:

```json
{
  "image": "assets/supplied-artwork/dos-descent.webp",
  "source": "descent-offer-8hanc.jpg",
  "composition": "user-supplied artwork",
  "width": 1280,
  "height": 720,
  "crop": "source already 16:9; proportional resize, no crop"
}
```

No other manifest entry was modified.

## Verification performed

- The output reopens with Pillow and reports format `WEBP`, `1280x720`.
- The output is exact 16:9: `width * 9 == height * 16` holds.
- The original source file hash is unchanged after the run.
- `dist/spotlight-thumbnails.json` was compared entry-by-entry with its pre-edit
  state: only `dos-descent` differs; all other entries compare equal and the
  manifest still holds the same number of entries.

## Limits

- Artwork normalisation only. No statement is made about hosting, framing,
  streaming or monetisation permission, or about runtime compatibility.
