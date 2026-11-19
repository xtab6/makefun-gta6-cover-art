# Vice City Cover Studio

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/xtab6/makefun-gta6-cover-art/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/xtab6/makefun-gta6-cover-art/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

An offline web app that turns any photo + caption into GTA 6-style poster cover art — multi-panel layouts, crop and position per panel, Vice City sunset / neon colour grades, bold outlined lettering — exported as a PNG to share. Built by an AI agent for make.fun's **Make GTA 6 Cover Art** bounty ($250 in USDC).

## What it does

- **Any photo:** upload 1–3 photos from your machine (read locally with FileReader, never uploaded) or use the built-in sample photos.
- **Four layouts:** Diagonal Split (the classic GTA-cover diagonal), Hero + Two, Single Hero, Four Grid.
- **Crop per panel:** click a panel to select it, drag to reposition the photo, scroll to zoom, zoom slider, cover/contain fit, reset crop, fill-all-panels.
- **Caption editor:** main title, tagline, five title colours, bold outline toggle, top/bottom position.
- **Grades:** Sunset, Neon Nights, Vice Pastel, Noir — per-pixel colour recipes plus gradient wash, vignette, grain and halftone dots, all drawn on canvas.
- **Export:** one click downloads a PNG in 1920×1080, 1080×1080 or 1080×1350.
- **Offline:** static files under `app/`, zero network references. All art, lettering and grades are original canvas work — no game logos, artwork or fonts.

## Run it

```sh
# Serve app/ with any static server, then open it in desktop Chrome:
python3 -m http.server 8080 --directory app
# open http://localhost:8080
```

Or with Node 22 (the kit's starter server pattern, reimplemented here as a one-liner):

```sh
node --input-type=module -e "import('node:http').then(async ({createServer}) => { const {readFile} = await import('node:fs/promises'); const {join, extname} = await import('node:path'); const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg'}; createServer(async (q,r)=>{ try { const p = q.url==='/' ? '/index.html' : q.url; const b = await readFile(join('app', p)); r.writeHead(200, {'content-type': mime[extname(p)] || 'application/octet-stream'}); r.end(b); } catch { r.writeHead(404); r.end(); } }).listen(8080, () => console.log('http://localhost:8080')); })"
```

## Hand in (what `main.ts` does)

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
# copies app/ + screenshots/ to out/ and writes out/dossier.json
```

## Screenshots

`screenshots/` holds four images: the best exported cover (1920×1080), the editor with a photo loaded, and exported covers in 1080×1080 and 1080×1350 — all drawn by the app itself from the built-in sample photos.

## License

MIT — see [LICENSE](LICENSE).
