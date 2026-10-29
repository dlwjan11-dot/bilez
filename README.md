# Bilez

Free design and developer tools that run entirely in your browser. Your files are never uploaded.

**Live:** https://dlwjan11-dot.github.io/bilez/

## Tools

- **Smart Resize**: resize and compress images to WebP, JPEG or PNG, one size or several at once
- **Renamer**: bulk rename files and download them as a ZIP
- **Typescale**: build a modular type scale and copy it as CSS or design tokens
- **PDF to JPG**: turn every page of a PDF into an image
- **Favicon**: generate a full set of website icons from one logo
- **SVG**: optimize SVG files with SVGO
- **Cropper**: crop images, with common aspect ratios
- **Palette**: pull a color palette from an image
- **Formatter**: pretty-print or minify JSON, CSS and HTML
- **Base64**: encode and decode text and files
- **CSS Builder**: build box shadows and gradients visually

## Development

Requires Node 22 (see `.nvmrc`).

```bash
npm install
npm run dev          # dev server
npm run build:web    # web version (what GitHub Pages serves)
npm run build-exe    # Windows desktop app (Electron), branded "Abdul Tools"
```

Pushing to `main` builds the web version and deploys it to GitHub Pages automatically
(`.github/workflows/deploy-pages.yml`).

---

© 2026 Abdulrahman Hasan Saidali · [abdulmedia.com](https://abdulmedia.com)
