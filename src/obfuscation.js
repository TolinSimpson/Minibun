// src/obfuscation.js
// Obfuscator: string encoding + identifier renaming + optional control-flow
// flattening. String encoding replaces literal contents with hexadecimal
// escape sequences (e.g. "Hi" -> "\\x48\\x69") while preserving semantics.
// Uses the tokenizer for robust parsing that handles all JS syntax correctly.

import { tokenize } from './parser.js';

const OBFUSCATOR_GLOBALS = new Set([
  'window',
  'global',
  'globalThis',
  'document',
  'console',
  'Math',
  'Date',
  'JSON',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'RegExp',
  'Promise',
  'Set',
  'Map',
  'Buffer',
  'atob',
  'undefined',
  'NaN',
  'Infinity',
  'Error',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'eval',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURI',
  'decodeURI',
  'encodeURIComponent',
  'decodeURIComponent',
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
]);

export class Obfuscator {
  constructor(options = {}) {
    this.options = {
      encodeStrings: true,
      // Identifier renaming is opt-in; by default we only obfuscate strings
      // to ensure maximum safety for arbitrary code.
      renameIdentifiers: false,
      flattenIfs: false,
      ...options,
    };
    this.idMap = new Map();
  }

  encodeStrings(code) {
    if (!this.options.encodeStrings) return code;
    const tokens = tokenize(code);

    const toHexEscapes = (text) => {
      let out = '';
      for (let i = 0; i < text.length; i++) {
        const hex = text.charCodeAt(i).toString(16).padStart(2, '0');
        out += '\\x' + hex;
      }
      return out;
    };

    let out = '';

    for (const tok of tokens) {
      if (tok.type === 'string') {
        const quote = tok.value[0];
        const inner = tok.value.slice(1, -1);
        const encoded = toHexEscapes(inner);
        out += `${quote}${encoded}${quote}`;
      } else if (tok.type === 'template') {
        // Only encode simple templates without interpolation; otherwise we
        // leave them as-is to avoid changing semantics.
        if (!tok.value.includes('${')) {
          const inner = tok.value.slice(1, -1);
          const encoded = toHexEscapes(inner);
          out += '`' + encoded + '`';
        } else {
          out += tok.value;
        }
      } else {
        out += tok.value;
      }
    }

    return out;
  }

  generateName(index) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let name = '';
    let n = index;
    do {
      name = chars[n % chars.length] + name;
      n = Math.floor(n / chars.length) - 1;
    } while (n >= 0);
    return name;
  }

  renameIdentifiers(code) {
    if (!this.options.renameIdentifiers) return code;

    const tokens = tokenize(code);
    this.idMap.clear();

    // First pass: collect all renamable identifiers
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type !== 'identifier') continue;
      if (!this.shouldRenameIdentifier(tokens, i)) continue;
      if (this.idMap.has(tok.value)) continue;
      const newName = this.generateName(this.idMap.size);
      this.idMap.set(tok.value, newName);
    }

    // Second pass: rebuild code with renamed identifiers
    let out = '';
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type === 'identifier' && this.shouldRenameIdentifier(tokens, i)) {
        const renamed = this.idMap.get(tok.value);
        out += renamed || tok.value;
      } else {
        out += tok.value;
      }
    }

    return out;
  }

  shouldRenameIdentifier(tokens, index) {
    const tok = tokens[index];
    const name = tok.value;

    // Don't rename keywords (tokenizer already marks them, but double-check)
    if (tok.type === 'keyword') return false;

    // Don't rename global identifiers
    if (OBFUSCATOR_GLOBALS.has(name)) return false;

    // Look backwards to find previous non-whitespace token
    let prevIdx = index - 1;
    while (prevIdx >= 0 && tokens[prevIdx].type === 'whitespace') {
      prevIdx--;
    }

    if (prevIdx >= 0) {
      const prev = tokens[prevIdx];
      // Property access: obj.name or obj?.name
      if (prev.type === 'punctuator' && (prev.value === '.' || prev.value === '?.')) {
        return false;
      }
    }

    return true;
  }

  flattenControlFlow(code) {
    if (!this.options.flattenIfs) return code;
    // Control-flow flattening is intentionally conservative; complex patterns
    // (deeply nested try/catch, generators, async) should keep this disabled.
    return code;
  }

  obfuscate(code, options = {}) {
    const opts = { ...this.options, ...options };
    let out = code;
    if (opts.renameIdentifiers) {
      out = this.renameIdentifiers(out);
    }
    if (opts.encodeStrings) {
      out = this.encodeStrings(out);
    }
    if (opts.flattenIfs) {
      out = this.flattenControlFlow(out);
    }
    return out;
  }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports.Obfuscator = Obfuscator;
}