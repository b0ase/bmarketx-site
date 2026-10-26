# bMarketX brand

Source of truth: https://bwalletx.com/brand (sections Logo, Versions, Name, Misuse, Colour, Type) and https://bwalletx.com/family (family icons: "On pages the logo stays the gold b; only the X takes the service colour").

## Files
- `logo.svg` - header wordmark for white/light backgrounds (black b, ink "Market", four-colour X). Aspect ~6.3:1; use `height:34px`.
- `logo-dark.svg` - same for dark backgrounds (gold-gradient b, warm-white "Market", four-colour X).
- `mark.svg` - square app/tile mark (b on black tile, rx 26.4, eBay-colour ramp). Same construction as family `bmarketx-icon.svg`.
- `favicon.svg` - bare b with the ramp, transparent (same construction as family `favicon.svg`).
- `og.svg` - 1200x630 share image source, same layout as family OGs (b + name top-left, headline, sub, domain, big b right). Export PNG: `rsvg-convert -w 1200 og.svg -o og-bmarketx-v1.png`.

All text is outlined to paths (Space Grotesk 700, the family display face, tracking -0.03em). No webfont needed.

## Rules followed
- **Logo = the b alone** (stem with 45 degree flag, r33 bowl, r15 counter, identical geometry to the family b). No X and no letters inside the mark. The X lives in the name.
- **Name**: small b, capital M, capital X, X set apart as in other family pages ("bMint X"); the X takes the service colour.
- **Colour of the b**: gold gradient on dark; black on white (gold on white is forbidden: Misuse / Colour). So the light logo uses the black b.
- **Tile and favicon**: family icons recolour the b per service (bMint green), so the b carries the service colours there only.
- **Type**: Space Grotesk 700. Palette on dark: black, warm white #F1EAD9, gold #FFD24D.
- No outlines, shadows, rotation, stretching.

## The eBay colours: the one conflict
The brand guide forbids recolouring the logo and says pages keep the gold b with only the X in service colour. So the four eBay colours (#E53238 red, #0064D2 blue, #F5AF02 yellow, #86B817 green) appear in: the X of the wordmark (four wedges, one per colour), and the b of the tile/favicon (a stepped ramp, same single userSpaceOnUse gradient mechanic as family icons). The page-header b is NOT eBay-coloured and the letters must not cycle colours. Note: the family index currently shows bMarketX with a six-stop rainbow ramp (red to purple); this is the eBay-four version of it. Update the family entry if the owner agrees.

## Clear space, min size
- Clear space: x on all sides, x = counter width (1/4.4 of the b height, i.e. ~7px at 34px tall).
- Min size: 16px tall on screen (wordmark: use the b-only `favicon.svg` below 16px), 6mm print.
- Yellow X wedge is ~1.9:1 on white (decorative brand mark, not text); do not use the wordmark smaller than 24px tall.

## Wiring
1. `app.js` line 5, `logo()` becomes:
   `const logo = () => \`<a class="logo" href="/" aria-label="bMarketX home"><img src="/brand/logo.svg" alt="bMarketX" height="34"></a>\`;`
   Remove the per-letter `<span>` colour cycling CSS for `.logo span` in style.css. On any dark section use `/brand/logo-dark.svg`.
2. Every HTML `<head>`: replace the favicon link with `<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">`; add `<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">` after exporting `rsvg-convert -w 180 mark.svg`.
3. OG: export `og.svg` to PNG and reference it in `og:image`/`twitter:image`.
4. Replace the root `favicon.svg` (four squares) with `brand/favicon.svg` or delete after relinking.
