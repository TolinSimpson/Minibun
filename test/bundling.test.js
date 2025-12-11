import test from 'node:test';
import assert from 'node:assert/strict';

import { Bundler } from '../src/bundling.js';

test('Bundler produces a bundle string containing each module', () => {
  const modules = new Map([
    [
      './index.js',
      `
      import { foo } from './util.js';
      export function run() {
        return foo();
      }
      `,
    ],
    [
      './util.js',
      `
      export function foo() {
        return 123;
      }
      `,
    ],
  ]);

  const bundler = new Bundler(modules);
  const bundle = bundler.bundle('./index.js');

  assert.ok(typeof bundle === 'string' && bundle.length > 0);
  assert.ok(bundle.includes('/* Module: ./index.js */'));
  assert.ok(bundle.includes('/* Module: ./util.js */'));
});


test('Bundler orders dependencies before the entry module', () => {
  const modules = new Map([
    [
      './index.js',
      `
      import { foo } from './util.js';
      console.log(foo());
      `,
    ],
    [
      './util.js',
      `
      export function foo() {
        return 1;
      }
      `,
    ],
  ]);

  const bundler = new Bundler(modules);
  const bundle = bundler.bundle('./index.js');

  const indexPos = bundle.indexOf('/* Module: ./index.js */');
  const utilPos = bundle.indexOf('/* Module: ./util.js */');

  assert.ok(indexPos !== -1 && utilPos !== -1);
  assert.ok(utilPos < indexPos, 'dependency module should appear before entry module');
});

test('Bundler detects circular dependencies but still emits a bundle', () => {
  const modules = new Map([
    [
      './a.js',
      `
      import { b } from './b.js';
      export const a = () => b + 1;
      `,
    ],
    [
      './b.js',
      `
      import { a } from './a.js';
      export const b = a();
      `,
    ],
  ]);

  const bundler = new Bundler(modules);

  let warned = false;
  const originalWarn = console.warn;
  try {
    console.warn = (...args) => {
      warned = true;
      originalWarn.apply(console, args);
    };

    const bundle = bundler.bundle('./a.js');
    assert.ok(typeof bundle === 'string' && bundle.length > 0);
    assert.ok(bundle.includes('/* Module: ./a.js */'));
    assert.ok(bundle.includes('/* Module: ./b.js */'));
    assert.equal(warned, true);
  } finally {
    console.warn = originalWarn;
  }
});


