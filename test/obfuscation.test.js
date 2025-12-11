import test from 'node:test';
import assert from 'node:assert/strict';

import { Obfuscator } from '../src/obfuscation.js';

// Polyfill atob in Node if needed
if (typeof globalThis.atob !== 'function') {
  globalThis.atob = function atobPolyfill(b64) {
    return Buffer.from(b64, 'base64').toString('binary');
  };
}

test('Obfuscator changes code but preserves runtime behavior', () => {
  const source = `
    const msg = "hello";
    function greet() { console.log(msg); }
    greet();
  `;

  const obfuscator = new Obfuscator();
  const obfuscated = obfuscator.obfuscate(source);

  assert.notEqual(obfuscated, source);
  assert.ok(!obfuscated.includes('"hello"'));

  // Ensure it still runs without throwing
  const fn = new Function(obfuscated);
  assert.doesNotThrow(() => {
    fn();
  });
});

test('Obfuscator can leave strings or identifiers unchanged via options', () => {
  const source = `
    const msg = "hello";
    function greet() { console.log(msg); }
  `;

  const noEncode = new Obfuscator({ encodeStrings: false, renameIdentifiers: true });
  const noEncodeResult = noEncode.obfuscate(source);
  assert.ok(noEncodeResult.includes('"hello"'), 'string should remain when encodeStrings is false');

  const noRename = new Obfuscator({ encodeStrings: true, renameIdentifiers: false });
  const noRenameResult = noRename.obfuscate(source);
  assert.ok(noRenameResult.includes('msg'));
  assert.ok(noRenameResult.includes('greet'));
});

test('Obfuscator does not rename reserved words, globals, or property names', () => {
  const source = `
    const consoleAlias = console;
    const obj = { value: 1 };
    function run() {
      consoleAlias.log(obj.value);
      return obj.value;
    }
  `;

  const obfuscator = new Obfuscator({ encodeStrings: false, renameIdentifiers: true });
  const out = obfuscator.obfuscate(source);

  // global console should remain
  assert.ok(out.includes('console'), 'global console should not be renamed');

  // property name should remain
  assert.ok(out.includes('.value'), 'property name should not be renamed via dot access');
});

test('Obfuscator handles inline HTML and CSS strings without syntax errors', () => {
  const source = `
    const html = '<div class="card"><span>Hi</span></div>';
    const css = \`
      .card {
        color: red;
        padding: 10px;
      }
    \`;
  `;

  const obfuscator = new Obfuscator();
  const obfuscated = obfuscator.obfuscate(source);

  // Strings should be transformed (encoded), so raw HTML/CSS fragments will likely disappear
  assert.ok(!obfuscated.includes('<div class="card">'), 'HTML literal should be encoded');
  assert.ok(!obfuscated.includes('.card {'), 'CSS literal should be encoded');

  // But the resulting code must still be valid JavaScript
  const fn = new Function(obfuscated);
  assert.doesNotThrow(() => {
    fn();
  });
});

test('Obfuscator encodes string contents using hexadecimal escape sequences', () => {
  const source = `
    const secret = "Hi";
  `;

  const obfuscator = new Obfuscator({ encodeStrings: true, renameIdentifiers: false });
  const out = obfuscator.obfuscate(source);

  // Original literal should be gone
  assert.ok(!out.includes('"Hi"'));

  // Encoded form should use \xNN escapes for ASCII characters
  assert.ok(/"\\x[0-9a-fA-F]{2}\\x[0-9a-fA-F]{2}"/.test(out));
});

