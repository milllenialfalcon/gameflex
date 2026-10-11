# Supplied artwork

Nineteen player-supplied artwork files were normalised to exact 16:9 WebP and
wired into `dist/spotlight-thumbnails.json`. This document records the mapping,
the originals' hashes and dimensions, and the crop strategy used for each.

Scope: artwork only. Nothing in this document changes any permission,
availability or launch claim, and no new claim of either kind is made.

## Output

- Directory: `dist/assets/supplied-artwork/`
- The 19 outputs are WebP, quality 90, method 6.
- Output size is `1280x720` when the source width is `>= 1280`, otherwise
  `800x450`. Both are exact 16:9.
- No text, logo, title or watermark was added to any output.

## Mapping

SHA256 values below are the full 64-character digest of each original, taken
before the run and re-checked unchanged afterwards.

| Game id | Original file | Original WxH | Original SHA256 | Output | Crop strategy |
|---|---|---|---|---|---|
| dos-age-of-empires | `age of empires.jpg` | 1280x720 | `435cab74e112e0ec84b667886a8b45e6fd107d1483879601bf5d00a85a32b280` | 1280x720 | source already 16:9; straight resize |
| dos-doom-dec-1993 | `doom.webp` | 1920x1080 | `a3411769941897764f4e6bdd1aebc8e5bbd4458c0825f51f041ddc83c9f151bf` | 1280x720 | source already 16:9; straight resize |
| dos-duke-nukem-3d-1996 | `duke nukem 3d.jpg` | 701x438 | `b50488a8538b2b37fb1e42ee2bb6613f11850fc9539d664ab297f5bd40235872` | 800x450 | whole image contained proportionally and centred on blurred darkened backdrop |
| dos-dune-2-dos-1992 | `dune2.jpg` | 580x250 | `50164037a2a62a3f9507b58f1355d7f3fc19424839a8cde4e1e93cf44f14ccb5` | 800x450 | whole image centred on blurred darkened cover backdrop |
| halo | `halo com evo.jpg` | 646x475 | `3e887e05c38c0c92c496aa371fff97ee3a0505ac2c6d5a957b64d2469519a844` | 800x450 | whole image centred on blurred darkened cover backdrop |
| halomobile | `Halo_CE_Mobile.webp` | 1920x1080 | `2c1a1fc95b4707818fe2ee97b3aa65f3943c371f6ec39b61077900fcb7cf7c51` | 1280x720 | source already 16:9; straight resize |
| dos-lemmings-1991 | `lemmings.jpg` | 738x415 | `13aa01ee42a0b4c7435f76d948f7aa077a03bcb1c9548a4ba823d61a63ee4818` | 800x450 | 3px height trimmed, centre crop, no stretch |
| dos-the-need-for-speed-sep-1995 | `need for speed.jpg` | 739x415 | `9b9d559d370a73317d732510ea64731d5c3bdb8eb38d6fd3c277f9f214d9761a` | 800x450 | 1px height trimmed, centre crop, no stretch |
| dos-prince-of-persia-2 | `Prince_of_Persia_the_shadow_and_the_flame.webp` | 464x221 | `7ef820055dc8614a4b14af16562b08a71fd924c248c1b9d424d55afe181837c2` | 800x450 | whole image centred on blurred darkened cover backdrop |
| pes6 | `pro-evolution-soccer-6-nintendo-ds-art-banner.jpg` | 1920x1080 | `1b6a9a5b5e443a07242782a773248f1d1839756bbe99336e1b1baa91f0283598` | 1280x720 | source already 16:9; straight resize |
| dos-resident-evil | `resident-evil-game-cover-altar-of-gaming.webp` | 1600x900 | `54cd694bc57df033d8f48840e7f063111fe786058c0eaee84bb9d645c813252a` | 1280x720 | source already 16:9; straight resize |
| dos-road-rash | `roadrash.jpg` | 1280x720 | `a97f7d73cc98b64d06ffc1eb46a609f9fd792eb480495e8ac6ed856e8abc8cf0` | 1280x720 | source already 16:9; straight resize |
| simpsons | `simpsons hit and run.jpg` | 1280x720 | `41eda3cd6522947d43c58c541d6255267f7ab0b82eac096a78b8ca0dcac0f515` | 1280x720 | source already 16:9; straight resize |
| skate | `skate3.webp` | 1200x675 | `ac6d7301f9c86deccee52e72f3953bae49ac98ea69cde0020dae3f28e37fa7b9` | 800x450 | source already 16:9; straight resize |
| dos-dark-forces | `star wars dark forces.webp` | 1024x576 | `018ffef778d5f794eceb47e13df5dd4da8ebed2c612ce22616ced923946362e4` | 800x450 | source already 16:9; straight resize |
| dos-the-lost-vikings | `The-Lost-Vikings.jpg` | 1920x1080 | `ccbc998348893754c50d2001d36cff430e9829cf2d9fd1ce975ae24c38c8e398` | 1280x720 | source already 16:9; straight resize |
| dos-tomb-raider | `tomb raider.jpg` | 739x415 | `6ea75798b2ba37b8d5aa85ea7a7f7739bfd6d5d3ac98f9dfa97506f6fa5adc53` | 800x450 | 1px height trimmed, centre crop, no stretch |
| urbanterror | `urban terror.jpg` | 547x365 | `f5a79e40b44aba4cb09a001106523e6a5e81d006a1ed42ff30533b179390d4e8` | 800x450 | centre crop to 16:9 retaining the wordmark, no stretch |
| dos-worms-1995 | `worms.jpg` | 616x353 | `56cc038635a3f351e0b3435e28834ec02560975260866eee58200b61511e3caf` | 800x450 | 2px width trimmed, centre crop, no stretch |

## Crop strategies

Four strategies were used; none involved stretching or distorting the artwork.

1. **Straight resize.** The source was already 16:9, so it was
   resized with Lanczos resampling to the target size and nothing was cropped.

2. **Small centre crop.** The source rounded to 16:9 within a few
   pixels. The overhang was trimmed from the height (or, for `worms.jpg`,
   the width) so the visible artwork is a centred, unstretched subset that
   fills the frame. The trims were 1-3px; two of these sources were likewise
   treated as a straight resize where the rounding did not require a crop.

3. **Contain on a blurred backdrop (4 entries: Halo, Dune 2, Prince of
   Persia, Duke Nukem 3D).** These sources are far from 16:9 (1.36, 2.32,
   2.10 and 1.60 respectively), so cropping to the frame would have discarded
   a significant part of the supplied picture. Instead the complete image is
   proportionally scaled to fit wholly inside the frame and pasted
   centred, with no cropping and no stretch. The
   frame behind it is built from the same image, cover-resized, then
   Gaussian-blurred at radius 20 and darkened, so the fill is
   derived only from the supplied artwork itself.

4. **Positional crop (1 entry).**
   - `urbanterror`: a centred 16:9 crop that retains the URBAN TERROR wordmark.

## Verification performed

- All 19 outputs reopen with Pillow and report format `WEBP`.
- All 19 outputs are exact 16:9: `width * 9 == height * 16` holds for every
  output, and each is either `1280x720` or `800x450` as decided by the source
  width rule.
- Every original in `D:\AI\Gameflex` was hashed with SHA256 before and after the
  run; all 19 hashes are unchanged.
- `dist/spotlight-thumbnails.json` was diffed against its pre-edit copy: exactly
  the 19 target entries changed, all 35 other entries compare equal, and the
  top-level key order is unchanged. The manifest still holds 54 entries.

## Contact sheet

`artifacts/cropped-art-contact.jpg` is a 3-column contact sheet of the 19 final
16:9 crops, each tile rendered at 480x270 with its game id and output size
labelled underneath. It is an inspection aid only and is not referenced by the
site.

## Limits

- This document records artwork normalisation only. It makes no statement about
  whether any hosting, framing, streaming or monetisation use is permitted, and
  no statement about runtime compatibility or availability.
- Primary reviewed all output artwork; Duke uses full-image containment to
  preserve head and logo, Urban Terror center crop preserves wordmark.
