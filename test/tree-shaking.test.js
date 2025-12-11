import test from 'node:test';
import assert from 'node:assert/strict';

import { TreeShaker } from '../src/tree-shaking.js';

test('TreeShaker constructs dependency graph and returns module map', () => {
  const modules = new Map([
    [
      './entry.js',
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
      export function foo() { return 42; }
      export function unused() { return 0; }
      `,
    ],
    [
      './unused-module.js',
      `
      // not imported anywhere
      export const neverUsed = 1;
      `,
    ],
  ]);

  const shaker = new TreeShaker(modules);
  const result = shaker.shake('./entry.js');

  assert.ok(result instanceof Map);
  assert.ok(result.has('./entry.js'));
  assert.ok(result.has('./util.js'));
  assert.ok(result.has('./unused-module.js'));

  const entryCode = result.get('./entry.js');
  assert.ok(typeof entryCode === 'string' && entryCode.length > 0);
});

test('TreeShaker copes with default exports, re-exports, and side effects', () => {
  const modules = new Map([
    [
      './entry.js',
      `
      import def from './lib.js';
      import './side-effect.js';
      export function run() { return def(); }
      `,
    ],
    [
      './lib.js',
      `
      const value = 1;
      export default function () { return value; }
      `,
    ],
    [
      './reexport.js',
      `
      export * from './lib.js';
      `,
    ],
    [
      './side-effect.js',
      `
      console.log('side-effect');
      `,
    ],
  ]);

  const shaker = new TreeShaker(modules);
  const result = shaker.shake('./entry.js');

  assert.ok(result instanceof Map);
  assert.ok(result.has('./entry.js'));
  assert.ok(result.has('./lib.js'));
  assert.ok(result.has('./reexport.js'));
  assert.ok(result.has('./side-effect.js'));
});

