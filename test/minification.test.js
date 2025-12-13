import test from 'node:test';
import assert from 'node:assert/strict';

import { Minifier } from '../src/minification.js';

test('Minifier removes comments and collapses whitespace', () => {
  const source = `
    // single-line comment
    /*
      multi-line
      comment
    */
    const x = 1;   // trailing comment
    if (true) {
      console.log(x);
    }
  `;

  const minifier = new Minifier();
  const output = minifier.minify(source);

  assert.ok(!output.includes('single-line comment'));
  assert.ok(!output.includes('multi-line'));
  assert.ok(!/\/\*/.test(output));
  assert.ok(!/\/\/.*/.test(output), 'no line comments should remain');
  assert.ok(!/\s{2,}/.test(output));
  assert.ok(output.includes('console.log'));
});

test('Minifier preserves strings that contain comment-like sequences', () => {
  const source = `
    const url = "http://example.com/path/*not-a-comment*/?q=1";
    const tmpl = 'value // still in string';
  `;

  const minifier = new Minifier();
  const output = minifier.minify(source);

  assert.ok(output.includes('http://example.com/path/*not-a-comment*/?q=1'));
  assert.ok(output.includes('value // still in string'));
});

test('Minifier can keep comments when keepComments option is true', () => {
  const source = `
    // keep me
    const x = 1; // and me
  `;

  const minifier = new Minifier({ keepComments: true });
  const output = minifier.minify(source);

  assert.ok(output.includes('// keep me'));
  assert.ok(output.includes('// and me'));
});

test('Minifier shortens boolean literals but preserves null', () => {
  const source = `
    if (true) { a = false; b = null; }
  `;

  const minifier = new Minifier();
  const output = minifier.minify(source);

  assert.ok(output.includes('!0'), 'true should be shortened to !0');
  assert.ok(output.includes('!1'), 'false should be shortened to !1');
  // Note: null is intentionally NOT transformed to void 0 because they have
  // different semantics (null === void 0 is false, and typeof null is 'object')
  assert.ok(output.includes('null'), 'null should be preserved as-is');
});

test('Minifier handles empty and whitespace-only input', () => {
  const minifier = new Minifier();
  assert.equal(minifier.minify(''), '');
  assert.equal(minifier.minify('   \n\t  '), '');
});

test('Minifier preserves inline HTML and CSS inside strings and templates', () => {
  const source = `
    const html = '<div class="card"><span>Hi</span></div>';
    const css = \`
      .card {
        color: red;
        padding: 10px;
      }
    \`;
  `;

  const minifier = new Minifier();
  const output = minifier.minify(source);

  // HTML markup should be untouched
  assert.ok(
    output.includes('<div class="card"><span>Hi</span></div>'),
    'inline HTML should be preserved inside strings'
  );

  // CSS template literal content should be preserved
  assert.ok(output.includes('.card {'), 'CSS selector should still be present');
  assert.ok(output.includes('color: red;'));
  assert.ok(output.includes('padding: 10px;'));
});

test('Minifier removes leading comments so executable code is not commented out', () => {
  const source = `
    // Header comment line 1
    // Header comment line 2

    const x = 1;
    function get() { return x; }
  `;

  const minifier = new Minifier();
  const output = minifier.minify(source);

  // No line comments should remain at all
  assert.ok(!/\/\/.*/.test(output));
  assert.ok(!/\/\*/.test(output), 'block comments should also be removed by default');

  // Minified code should still be executable and not commented out
  const fn = new Function(`${output}; return typeof get === 'function' ? get() : null;`);
  const result = fn();
  assert.equal(result, 1);
});

