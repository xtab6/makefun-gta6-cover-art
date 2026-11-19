// Vice City Cover Studio — make.fun entry program (Node 22, stdlib only).
// Copies app/ and screenshots/ from this repository into the output
// directory and writes /output/dossier.json with buildDossier from
// vendor/makefun-app.ts. Deterministic: two runs to two directories write
// byte-identical files (sorted copy order, no timestamps in any output).
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = dirname(fileURLToPath(new URL('./main.ts', import.meta.url)));
const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

function copyTreeSorted(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true, dereference: false });
}

function handInEntry(): void {
  const appSrc = join(repoRoot, 'app');
  const shotsSrc = join(repoRoot, 'screenshots');
  if (!existsSync(appSrc)) throw new Error('app/: no such directory in this repository');
  if (!existsSync(shotsSrc)) throw new Error('screenshots/: no such directory in this repository');
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
  copyTreeSorted(appSrc, join(outputDir, 'app'));
  copyTreeSorted(shotsSrc, join(outputDir, 'screenshots'));
  const dossier = buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  });
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
  console.log(`handed in: ${outputDir} (dossier.json ${dossier.length} bytes)`);
}

handInEntry();
