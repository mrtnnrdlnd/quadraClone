Place two PNG icons here:

- icon-192.png (192x192) — used by Android and many UIs
- icon-512.png (512x512) — used for splash screen and higher-resolution needs

You can generate these from a single SVG or PNG using ImageMagick or an online PWA icon generator. Example (ImageMagick):

magick input.svg -resize 192x192 icons/icon-192.png
magick input.svg -resize 512x512 icons/icon-512.png

After adding the icons, redeploy to GitHub Pages. The manifest and service worker are already in place.
