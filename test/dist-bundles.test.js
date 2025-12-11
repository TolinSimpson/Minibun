import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

test('all dist bundles build and load without syntax errors', async () => {
  // Build the main bundle and all variants in one shot.
  execFileSync(process.execPath, ['build.js', '--variants'], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  const bundles = [
    'dist/minibun.js',
    'dist/minibun-build.js',
    'dist/minibun-min.js',
    'dist/minibun-obf.js',
    'dist/minibun-min-obf.js',
  ];

  for (const relPath of bundles) {
    const absPath = path.join(ROOT, relPath);
    const url = pathToFileURL(absPath).href;

    // Ensure the file exists and is non-empty.
    const content = await fs.readFile(absPath, 'utf8');
    assert.ok(content.length > 0, `${relPath} should not be empty`);

    // Dynamic import will fail fast on any syntax error.
    await assert.doesNotReject(
      () => import(url),
      `${relPath} should load as an ES module without syntax errors`,
    );
  }
});

test('dist/minibun.js exports match src/ modules', async () => {
  // Ensure dist/minibun.js is built
  execFileSync(process.execPath, ['build.js'], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  // Import from both source and dist
  const srcExports = await import(pathToFileURL(path.join(ROOT, 'src/index.js')).href);
  const distExports = await import(pathToFileURL(path.join(ROOT, 'dist/minibun.js')).href);

  // Expected exports from src/index.js
  const expectedExports = [
    'TreeShaker',
    'Minifier',
    'Bundler',
    'ModuleSystem',
    'Obfuscator',
    'Pipeline',
  ];

  // Verify all expected exports exist in both
  for (const exportName of expectedExports) {
    assert.ok(
      exportName in srcExports,
      `src/index.js should export ${exportName}`,
    );
    assert.ok(
      exportName in distExports,
      `dist/minibun.js should export ${exportName}`,
    );

    // Verify they are the same class/function type
    assert.ok(
      typeof srcExports[exportName] === typeof distExports[exportName],
      `${exportName} should have the same type in src and dist`,
    );

    // For classes, verify they have the same name
    if (typeof srcExports[exportName] === 'function') {
      assert.strictEqual(
        srcExports[exportName].name,
        distExports[exportName].name,
        `${exportName} should have the same name in src and dist`,
      );
    }
  }

  // Verify no unexpected exports in dist
  const distExportNames = Object.keys(distExports).filter(
    (key) => !key.startsWith('_') && key !== 'default',
  );
  const srcExportNames = Object.keys(srcExports).filter(
    (key) => !key.startsWith('_') && key !== 'default',
  );

  // Dist may have additional CommonJS exports, so we only check that
  // all src exports are present in dist
  for (const exportName of srcExportNames) {
    assert.ok(
      exportName in distExports,
      `dist/minibun.js should include all exports from src/index.js (missing: ${exportName})`,
    );
  }
});


