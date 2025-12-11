// build.js
// Build script for Minibun.
// - Default: create a single-file distributable (dist/minibun.js) that contains
//   all algorithm implementations and exports them as both ESM and CommonJS.
// - With `--variants`: additionally build several test bundles derived from
//   dist/minibun.js:
//   - dist/minibun-build.js   (baseline bundle)
//   - dist/minibun-min.js     (minified using the library Minifier)
//   - dist/minibun-obf.js     (string-obfuscated using the library Obfuscator)
//   - dist/minibun-min-obf.js (minified + string-obfuscated)
//
// NOTE: Files in dist/ are generated automatically. Do not edit them directly.
// Make changes in src/ and run this build script to regenerate dist/ files.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Minifier } from './src/minification.js';
import { Obfuscator } from './src/obfuscation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPORT_NAMES = [
  'TreeShaker',
  'Minifier',
  'Bundler',
  'ModuleSystem',
  'Obfuscator',
  'Pipeline',
];

async function buildSingleFileBundle() {
  const srcDir = path.join(__dirname, 'src');
  const outPath = path.join(__dirname, 'dist', 'minibun.js');

  await fs.mkdir(path.dirname(outPath), { recursive: true });

  // Fixed order so dependencies are defined before use. `parser.js` must
  // come first so that tokenizing helpers are available to other modules.
  const filesInOrder = [
    'parser.js',
    'tree-shaking.js',
    'minification.js',
    'bundling.js',
    'modules.js',
    'obfuscation.js',
    'pipeline.js',
  ];

  const parts = [];

  for (const file of filesInOrder) {
    const abs = path.join(srcDir, file);
    let code = await fs.readFile(abs, 'utf8');

    // Remove only relative imports between source files; keep node: imports
    // intact. The single-file bundle exposes all symbols in a shared module
    // scope, so cross-file imports are unnecessary there.
    code = code.replace(
      /^import\s+[^;]+from\s+['"]\.\/[^'"]+['"];[ \t]*\r?\n?/gm,
      ''
    );

    parts.push(`// ---- ${file} ----\n${code.trim()}\n`);
  }

  // Add a unified CommonJS fallback. ESM exports are already declared via
  // `export class` / `export { ... }` in the source files.
  const exportBlock = `
// ---- CommonJS fallback API ----
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ${EXPORT_NAMES.join(',\n    ')}
  };
}
`.trim();

  const bundle = `${parts.join('\n\n')}\n\n${exportBlock}\n`;
  await fs.writeFile(outPath, bundle, 'utf8');
}

async function buildVariantBundles() {
  const distDir = path.join(__dirname, 'dist');
  await fs.mkdir(distDir, { recursive: true });

  const basePath = path.join(distDir, 'minibun.js');
  const baseCode = await fs.readFile(basePath, 'utf8');

  // Use the library's own Minifier and Obfuscator to produce the derived
  // bundles so that they reflect real-world usage and remain syntax-safe.
  const minifier = new Minifier();
  const minCode = minifier.minify(baseCode);

  const obfuscator = new Obfuscator();
  const obfCode = obfuscator.obfuscate(baseCode);
  const minObfCode = obfuscator.obfuscate(minCode);

  const variants = [
    {
      name: 'minibun-build.js',
      content: baseCode,
    },
    {
      name: 'minibun-min.js',
      content: minCode,
    },
    {
      name: 'minibun-obf.js',
      content: obfCode,
    },
    {
      name: 'minibun-min-obf.js',
      content: minObfCode,
    },
  ];

  for (const { name, content } of variants) {
    const outPath = path.join(distDir, name);
    await fs.writeFile(outPath, content, 'utf8');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const withVariants = args.includes('--variants');

  await buildSingleFileBundle();

  if (withVariants) {
    await buildVariantBundles();
  }
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Build failed:', err);
  process.exitCode = 1;
});


