// src/modules.js
// Simple module registry with sync/async loading and caching.

export class ModuleSystem {
    constructor() {
      this.registry = new Map(); // name -> { deps, factory }
      this.cache = new Map();    // name -> exports
    }
  
    define(name, dependencies, factory) {
      this.registry.set(name, { dependencies, factory });
    }
  
    resolveDependencies(deps) {
      return deps.map(d => this.require(d));
    }
  
    require(name) {
      if (this.cache.has(name)) {
        return this.cache.get(name);
      }
      const record = this.registry.get(name);
      if (!record) {
        throw new Error(`Module not defined: ${name}`);
      }
  
      const { dependencies, factory } = record;
      const module = { exports: {} };
      const exports = module.exports;
      const resolved = this.resolveDependencies(dependencies);
  
      const result = factory(...resolved, module, exports);
      const finalExports = result !== undefined ? result : module.exports;
  
      this.cache.set(name, finalExports);
      return finalExports;
    }
  
    async requireAsync(name) {
      return Promise.resolve().then(() => this.require(name));
    }
  
  async loadModule(path, name) {
    let code;
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to fetch module: ${response.status} ${response.statusText}`);
      }
      code = await response.text();
    } catch (err) {
      throw new Error(`Failed to load module "${name}" from "${path}": ${err.message}`);
    }

    try {
      const module = { exports: {} };
      const exports = module.exports;
      const factory = new Function('module', 'exports', code + '\nreturn module.exports;');
      const result = factory(module, exports);
      const finalExports = result !== undefined ? result : module.exports;
      this.cache.set(name, finalExports);
      return finalExports;
    } catch (err) {
      throw new Error(`Failed to execute module "${name}": ${err.message}`);
    }
  }
  }
  
  // CommonJS export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports.ModuleSystem = ModuleSystem;
  }