// src/tree-shaking.js
// Tree-shaker built on top of the tokenizer. It understands ES module
// imports/exports via `findModuleSyntax` and performs conservative
// side-effect detection using token streams.

import { tokenize, findModuleSyntax } from './parser.js';

export class TreeShaker {
  constructor(moduleMap) {
    // moduleMap: Map<string, string> or plain object { [name]: code }
    this.moduleMap = moduleMap instanceof Map ? moduleMap : new Map(Object.entries(moduleMap));
    this.dependencyGraph = new Map();
    this.exportMap = new Map(); // module -> Set(exportName | 'default' | '*')
    this.reexports = new Map(); // module -> Set<sourceModule>
    this.sideEffects = new Map(); // module -> boolean
  }

  buildDependencyGraph() {
    for (const [name, code] of this.moduleMap.entries()) {
      const imports = new Set();
      const exports = new Set();
      const reexports = new Set();

      const tokens = tokenize(code);
      const modSyntax = findModuleSyntax(tokens);

      for (const imp of modSyntax.imports) {
        if (imp.source) imports.add(imp.source);
      }

      for (const exp of modSyntax.exports) {
        if (exp.type === 'default') {
          exports.add('default');
        } else if (exp.type === 'named' && exp.names) {
          exp.names.forEach(n => exports.add(n));
        } else if (exp.type === 'all') {
          exports.add('*');
          if (exp.source) reexports.add(exp.source);
        }
      }

      // Conservative side-effect detection: look for any non-import/export
      // top-level call/new tokens.
      let hasSideEffects = false;
      for (const tok of tokens) {
        if (tok.type === 'identifier' && (tok.value === 'import' || tok.value === 'export')) {
          // skip
          continue;
        }
        if (tok.type === 'identifier' || tok.type === 'punctuator') {
          // crude heuristic: presence of "new" keyword or "()" pattern
          if (tok.type === 'identifier' && tok.value === 'new') {
            hasSideEffects = true;
            break;
          }
        }
      }

      this.dependencyGraph.set(name, imports);
      this.exportMap.set(name, exports);
      this.reexports.set(name, reexports);
      this.sideEffects.set(name, hasSideEffects);
    }
  }

  markReachable(entryModule) {
    const usedExports = new Map(); // module -> Set<exportName>
    const visited = new Set();
    const queue = [entryModule];

    while (queue.length) {
      const mod = queue.pop();
      if (visited.has(mod)) continue;
      visited.add(mod);

      const imports = this.dependencyGraph.get(mod) || new Set();
      const reexp = this.reexports.get(mod) || new Set();

      // If a module is imported, mark:
      // - its default export when using default import
      // - its named exports when using named import lists
      // For now we conservatively treat any import as using all exports, but
      // unused modules (never imported) can still be dropped.
      for (const dep of imports) {
        const depExports = this.exportMap.get(dep) || new Set();
        if (!usedExports.has(dep)) usedExports.set(dep, new Set());
        depExports.forEach(e => usedExports.get(dep).add(e));
        if (!visited.has(dep)) queue.push(dep);
      }

      // Re-export `*` from sources
      for (const dep of reexp) {
        if (!visited.has(dep)) queue.push(dep);
      }

      // Always keep entry module + side-effect modules
      if (!usedExports.has(mod)) usedExports.set(mod, new Set());
      if (this.sideEffects.get(mod)) {
        // Mark pseudo export "__side_effects__" to keep file
        usedExports.get(mod).add('__side_effects__');
      }
    }

    return usedExports;
  }

  eliminateDeadCodeForModule(code, moduleName, usedExports) {
    // If no exports are used and the module has no side effects, drop it
    // entirely by returning an empty string.
    const hasAnyUsed = usedExports && usedExports.size > 0;
    const hasSideEffects = this.sideEffects.get(moduleName);
    if (!hasAnyUsed && !hasSideEffects) {
      return '';
    }
    return code;
  }

  shake(entryModule) {
    this.buildDependencyGraph();
    const used = this.markReachable(entryModule);
    const output = new Map();

    for (const [name, code] of this.moduleMap.entries()) {
      const usedExports = used.get(name) || new Set();
      if (name === entryModule) {
        // Always keep the entry module body intact.
        output.set(name, code);
      } else {
        const cleaned = this.eliminateDeadCodeForModule(code, name, usedExports);
        output.set(name, cleaned);
      }
    }

    return output;
  }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports.TreeShaker = TreeShaker;
}