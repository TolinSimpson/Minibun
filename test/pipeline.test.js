import test from 'node:test';
import assert from 'node:assert/strict';

import { Pipeline } from '../src/pipeline.js';

test('Pipeline bundles and minifies into dist/minibun.js (in-memory modules)', async () => {
  const modules = new Map([
    [
      './index.js',
      `
      import { foo } from './util.js';
      export function run() { return foo(); }
      `,
    ],
    [
      './util.js',
      `
      export function foo() { return 123; }
      `,
    ],
  ]);

  const pipeline = new Pipeline({
    entryFile: './index.js',
    modulesDir: './src', // unused because we provide withModules
    outputFile: '', // no file write
  })
    .withModules(modules)
    .useBundler()
    .useMinifier();

  const output = await pipeline.run();

  assert.ok(typeof output === 'string' && output.length > 0);
  assert.ok(output.includes('123'));
});

test('Pipeline.fromJSON builds a default bundle+minify pipeline', async () => {
  const modules = new Map([
    [
      './index.js',
      `
      export default function main() { return 5; }
      `,
    ],
  ]);

  const config = {
    entry: './index.js',
    modulesDir: './src', // ignored because we pass modules map
    output: '',
    pipeline: {}, // rely on defaulting to bundle+minify
  };

  const pipeline = Pipeline.fromJSON(config).withModules(modules);
  const output = await pipeline.run();

  assert.ok(typeof output === 'string' && output.length > 0);
  assert.ok(output.includes('main'));
});

test('Pipeline keeps inline HTML and CSS inside module strings', async () => {
  const modules = new Map([
    [
      './index.js',
      `
      export const html = '<div class="card"><span>Hi</span></div>';
      export const styles = \`
        .card {
          color: red;
          padding: 10px;
        }
      \`;
      `,
    ],
  ]);

  const pipeline = new Pipeline({
    entryFile: './index.js',
    modulesDir: './src',
    outputFile: '', // avoid filesystem writes
  })
    .withModules(modules)
    .useBundler()
    .useMinifier();

  const output = await pipeline.run();

  // Inline HTML should survive bundling + minification
  assert.ok(output.includes('<div class="card"><span>Hi</span></div>'));

  // Inline CSS template literal content should also survive
  assert.ok(output.includes('.card {'));
  assert.ok(output.includes('color: red;'));
  assert.ok(output.includes('padding: 10px;'));
});
