// src/index.js

export { TreeShaker } from './tree-shaking.js';
export { Minifier } from './minification.js';
export { Bundler } from './bundling.js';
export { ModuleSystem } from './modules.js';
export { Obfuscator } from './obfuscation.js';
export { Pipeline } from './pipeline.js';

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  const exported = {
    TreeShaker: require('./tree-shaking.js').TreeShaker,
    Minifier: require('./minification.js').Minifier,
    Bundler: require('./bundling.js').Bundler,
    ModuleSystem: require('./modules.js').ModuleSystem,
    Obfuscator: require('./obfuscation.js').Obfuscator,
    Pipeline: require('./pipeline.js').Pipeline,
  };
  module.exports = exported;
}