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

test('all dist variants are fully functional', async () => {
  // Build all variants first
  execFileSync(process.execPath, ['build.js', '--variants'], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  const variants = [
    'dist/minibun.js',
    'dist/minibun-min.js',
    'dist/minibun-obf.js',
    'dist/minibun-min-obf.js',
  ];

  for (const relPath of variants) {
    const absPath = path.join(ROOT, relPath);
    const url = pathToFileURL(absPath).href;

    // Import the variant
    const mod = await import(url);

    // Test Minifier functionality
    const minifier = new mod.Minifier();
    const minified = minifier.minify('const   x   =   1;  // comment');
    assert.ok(
      !minified.includes('// comment'),
      `${relPath}: Minifier should remove comments`,
    );
    assert.ok(
      !minified.includes('   '),
      `${relPath}: Minifier should collapse whitespace`,
    );

    // Test Bundler functionality
    const modules = new Map([
      ['./entry.js', "import { foo } from './util.js'; export const bar = foo;"],
      ['./util.js', 'export const foo = 42;'],
    ]);
    const bundler = new mod.Bundler(modules);
    const bundle = bundler.bundle('./entry.js');
    assert.ok(
      bundle.includes('/* Module: ./entry.js */'),
      `${relPath}: Bundler should include entry module`,
    );
    assert.ok(
      bundle.includes('/* Module: ./util.js */'),
      `${relPath}: Bundler should include dependency module`,
    );

    // Test TreeShaker functionality
    const shaker = new mod.TreeShaker(modules);
    const shaken = shaker.shake('./entry.js');
    assert.ok(
      shaken instanceof Map,
      `${relPath}: TreeShaker should return a Map`,
    );
    assert.ok(
      shaken.has('./entry.js'),
      `${relPath}: TreeShaker should include entry module`,
    );

    // Test ModuleSystem functionality
    const modSys = new mod.ModuleSystem();
    modSys.define('testMod', [], () => ({ value: 123 }));
    const result = modSys.require('testMod');
    assert.strictEqual(
      result.value,
      123,
      `${relPath}: ModuleSystem should resolve module correctly`,
    );

    // Test Obfuscator functionality
    const obfuscator = new mod.Obfuscator({ encodeStrings: true });
    const obfuscated = obfuscator.obfuscate('const msg = "hello";');
    assert.ok(
      obfuscated.includes('\\x'),
      `${relPath}: Obfuscator should encode strings to hex`,
    );
    assert.ok(
      !obfuscated.includes('"hello"'),
      `${relPath}: Obfuscator should not contain original string`,
    );

    // Test Pipeline functionality (in-memory)
    const pipeline = new mod.Pipeline({ outputFile: null });
    pipeline.withModules(modules).useBundler().useMinifier();
    const pipelineResult = await pipeline.run();
    assert.ok(
      typeof pipelineResult === 'string' && pipelineResult.length > 0,
      `${relPath}: Pipeline should produce output`,
    );
  }
});


