// src/bundling.js
// Bundler: builds dependency graph, topologically sorts, concatenates modules
// into a CommonJS-style bundle. The dependency graph is built using the
// tokenizer for robust import detection that handles all ES module syntax.

import { tokenize, findModuleSyntax } from './parser.js';

export class Bundler {
  constructor(moduleMap) {
    this.moduleMap = moduleMap instanceof Map ? moduleMap : new Map(Object.entries(moduleMap));
    this.graph = new Map(); // module -> Set<dependency>
  }

  extractImports(code) {
    const deps = new Set();
    const tokens = tokenize(code);
    const { imports } = findModuleSyntax(tokens);
    for (const imp of imports) {
      if (imp.source) {
        deps.add(imp.source);
      }
    }
    return deps;
  }

  buildDependencyGraph() {
    for (const [name, code] of this.moduleMap.entries()) {
      this.graph.set(name, this.extractImports(code));
    }
  }

  detectCircularDependencies() {
    const visited = new Set();
    const stack = new Set();
    const cycles = [];

    const dfs = (node) => {
      if (stack.has(node)) {
        cycles.push(node);
        return;
      }
      if (visited.has(node)) return;
      visited.add(node);
      stack.add(node);
      const deps = this.graph.get(node) || new Set();
      for (const dep of deps) {
        if (this.graph.has(dep)) dfs(dep);
      }
      stack.delete(node);
    };

    for (const node of this.graph.keys()) {
      dfs(node);
    }
    return cycles;
  }

  topologicalSort(entryModule) {
    // Depth-first ordering that ensures dependencies appear before the modules
    // that import them and still emits all modules even in the presence of
    // circular dependencies.
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    const visit = (mod) => {
      if (visited.has(mod)) return;
      if (visiting.has(mod)) {
        // Part of a cycle already being processed; skip to avoid infinite recursion.
        return;
      }
      visiting.add(mod);
      const deps = this.graph.get(mod) || new Set();
      for (const dep of deps) {
        if (this.moduleMap.has(dep)) {
          visit(dep);
        }
      }
      visiting.delete(mod);
      visited.add(mod);
      order.push(mod);
    };

    if (this.moduleMap.has(entryModule)) {
      visit(entryModule);
    }

    // Include any remaining modules that were not reachable from the entry
    // point so that the bundle always contains every defined module.
    for (const mod of this.moduleMap.keys()) {
      if (!visited.has(mod)) {
        visit(mod);
      }
    }

    return order;
  }

  wrapModule(name, code) {
    // We emit a CommonJS-compatible wrapper. The module body is left as-is;
    // ES module syntax should have been compiled away by the toolchain that
    // feeds this bundler. For safety, we still isolate scope and expose a
    // per-module `require`, `module`, and `exports`.
    return `
/* Module: ${name} */
(function (modules, moduleName) {
  var module = { exports: {} };
  var exports = module.exports;
  (function (require, module, exports) {
${code}
  })(function (id) { return modules[id]; }, module, exports);
  modules[moduleName] = module.exports;
})(__modules__, '${name}');
`.trim();
  }

  bundle(entryModule) {
    this.buildDependencyGraph();
    const cycles = this.detectCircularDependencies();
    if (cycles.length) {
      // Circular dependencies are detected and reported; callers can decide how to handle them.
      // eslint-disable-next-line no-console
      console.warn('Circular dependencies detected:', cycles);
    }

    const order = this.topologicalSort(entryModule);
    const parts = [];

    parts.push('var __modules__ = {};');
    for (const name of order) {
      const code = this.moduleMap.get(name);
      parts.push(this.wrapModule(name, code));
    }
    parts.push(`var __entry__ = __modules__['${entryModule}'];`);

    return parts.join('\n\n');
  }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports.Bundler = Bundler;
}