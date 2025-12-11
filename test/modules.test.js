import test from 'node:test';
import assert from 'node:assert/strict';

import { ModuleSystem } from '../src/modules.js';

test('ModuleSystem defines and requires modules with caching', () => {
  const ms = new ModuleSystem();

  ms.define('math', [], (module, exports) => {
    exports.add = (a, b) => a + b;
    return exports;
  });

  ms.define('calc', ['math'], (math, module, exports) => {
    exports.sum = (...nums) => nums.reduce((acc, n) => math.add(acc, n), 0);
    return exports;
  });

  const calc1 = ms.require('calc');
  const calc2 = ms.require('calc');

  assert.strictEqual(calc1, calc2, 'require should return cached instance');
  assert.equal(calc1.sum(1, 2, 3), 6);
});

test('ModuleSystem requireAsync resolves to module value', async () => {
  const ms = new ModuleSystem();

  ms.define('value', [], (module, exports) => {
    exports.v = 10;
    return exports;
  });

  const mod = await ms.requireAsync('value');
  assert.equal(mod.v, 10);
});

test('ModuleSystem throws when requiring an undefined module', () => {
  const ms = new ModuleSystem();

  assert.throws(
    () => {
      ms.require('missing');
    },
    /Module not defined: missing/
  );
});

test('ModuleSystem uses factory return value when provided', () => {
  const ms = new ModuleSystem();

  ms.define('factory-returns', [], (module, exports) => {
    exports.ignored = true;
    return { value: 42 };
  });

  const result = ms.require('factory-returns');
  assert.deepEqual(result, { value: 42 });

  // Ensure cache is keyed by module name and returns same object
  const again = ms.require('factory-returns');
  assert.strictEqual(result, again);
});

