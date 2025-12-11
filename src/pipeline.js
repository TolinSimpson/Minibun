// src/pipeline.js
// Configurable build pipeline that composes the algorithms in src/.

import fs from 'node:fs/promises';
import path from 'node:path';

import { TreeShaker } from './tree-shaking.js';
import { Minifier } from './minification.js';
import { Bundler } from './bundling.js';
import { Obfuscator } from './obfuscation.js';

export class Pipeline {
  constructor(options = {}) {
    this.entryFile = options.entryFile || './index.js';
    this.modulesDir = options.modulesDir || './src';
    this.outputFile = options.outputFile || './dist/minibun.js';
    this.modules = options.modules || null; // Optional in‑memory Map
    this.steps = [];
  }

  // ---- Fluent configuration API ----

  entry(entryFile) {
    this.entryFile = entryFile;
    return this;
  }

  modulesRoot(dir) {
    this.modulesDir = dir;
    return this;
  }

  output(outputFile) {
    this.outputFile = outputFile;
    return this;
  }

  withModules(moduleMap) {
    this.modules = moduleMap instanceof Map ? moduleMap : new Map(Object.entries(moduleMap));
    return this;
  }

  useTreeShaker(options = {}) {
    this.steps.push({ type: 'treeShake', options });
    return this;
  }

  /**
   * Convenience: run a full ES6+ production pipeline.
   * Order: tree-shake -> bundle -> minify -> obfuscate (optional).
   */
  useDefaultProductionPipeline(options = {}) {
    const {
      treeShake = true,
      obfuscate = false,
      obfuscatorOptions = {},
    } = options;

    if (treeShake) this.useTreeShaker();
    this.useBundler().useMinifier();
    if (obfuscate) this.useObfuscator(obfuscatorOptions);
    return this;
  }

  useBundler(options = {}) {
    this.steps.push({ type: 'bundle', options });
    return this;
  }

  useMinifier(options = {}) {
    this.steps.push({ type: 'minify', options });
    return this;
  }

  useObfuscator(options = {}) {
    this.steps.push({ type: 'obfuscate', options });
    return this;
  }


  // ---- JSON config integration ----

  static fromJSON(config) {
    const pipeline = new Pipeline({
      entryFile: config.entry || './index.js',
      modulesDir: config.modulesDir || './src',
      outputFile: config.output || './dist/minibun.js',
    });

    const p = config.pipeline || {};

    if (p.treeShake) pipeline.useTreeShaker(p.treeShake === true ? {} : p.treeShake);
    if (p.bundle !== false) pipeline.useBundler(p.bundle === true ? {} : p.bundle);
    if (p.minify) pipeline.useMinifier(p.minify === true ? {} : p.minify);
    if (p.obfuscate) pipeline.useObfuscator(p.obfuscate === true ? {} : p.obfuscate);

    // Reasonable default if no steps specified
    if (pipeline.steps.length === 0) {
      pipeline.useBundler().useMinifier();
    }

    return pipeline;
  }

  // ---- Execution ----

  async run() {
    let current = this.modules || (await this.loadModules());

    for (const step of this.steps) {
      switch (step.type) {
        case 'treeShake': {
          const shaker = new TreeShaker(current);
          current = shaker.shake(this.entryFile);
          break;
        }
        case 'bundle': {
          const bundler = new Bundler(current);
          current = bundler.bundle(this.entryFile);
          break;
        }
        case 'minify': {
          const minifier = new Minifier(step.options);
          current = minifier.minify(String(current));
          break;
        }
        case 'obfuscate': {
          const obfuscator = new Obfuscator(step.options);
          current = obfuscator.obfuscate(String(current));
          break;
        }
        default:
          throw new Error(`Unknown pipeline step: ${step.type}`);
      }
    }

    if (this.outputFile) {
      await this.writeOutput(current, this.outputFile);
    }

    return current;
  }

  async writeOutput(value, filePath) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    if (value instanceof Uint8Array) {
      await fs.writeFile(filePath, value);
    } else {
      await fs.writeFile(filePath, String(value), 'utf8');
    }
  }

  async loadModules() {
    const root = this.modulesDir;
    const modules = new Map();

    const walk = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          const rel = './' + path.relative(root, full).replace(/\\/g, '/');
          const code = await fs.readFile(full, 'utf8');
          modules.set(rel, code);
        }
      }
    };

    await walk(root);
    return modules;
  }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports.Pipeline = Pipeline;
}


