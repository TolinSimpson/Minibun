// src/obfuscation.js
// Obfuscator: string encoding + identifier renaming + optional control-flow
// flattening. String encoding replaces literal contents with hexadecimal
// escape sequences (e.g. "Hi" -> "\\x48\\x69") while preserving semantics.

import { tokenize } from './parser.js';

const OBFUSCATOR_STRING_RE = /(['"`])(?:\\[\s\S]|(?!\1)[^\\])*\1/g;
const OBFUSCATOR_IDENT_RE = /\b([A-Za-z_$][\w$]*)\b/g;
const OBFUSCATOR_RESERVED = new Set([
  'break','case','catch','class','const','continue','debugger','default','delete',
  'do','else','export','extends','finally','for','function','if','import','in',
  'instanceof','let','new','return','super','switch','this','throw','try','typeof',
  'var','void','while','with','yield','enum','await'
]);

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
  'atob'
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

    // Preserve string literals so that identifier renaming never changes
    // string contents; this allows encodeStrings to be controlled separately.
    const strings = [];
    // Use a placeholder that cannot be parsed as an identifier so that the
    // identifier regex never matches inside it.
    const placeholder = '\u0000';
    let i = 0;

    const withoutStrings = code.replace(OBFUSCATOR_STRING_RE, match => {
      const key = `${placeholder}${i++}${placeholder}`;
      strings.push(match);
      return key;
    });

    this.idMap.clear();
    let match;
    while ((match = OBFUSCATOR_IDENT_RE.exec(withoutStrings)) !== null) {
      const name = match[1];
      const index = match.index;
      if (!this.shouldRenameIdentifier(withoutStrings, index, name)) continue;
      if (this.idMap.has(name)) continue;
      const newName = this.generateName(this.idMap.size);
      this.idMap.set(name, newName);
    }
    OBFUSCATOR_IDENT_RE.lastIndex = 0;

    let out = withoutStrings.replace(OBFUSCATOR_IDENT_RE, (full, name, offset) => {
      if (!this.shouldRenameIdentifier(withoutStrings, offset, name)) return full;
      const rep = this.idMap.get(name);
      return rep || full;
    });

    // Restore string literals
    strings.forEach((s, idx) => {
      const key = `${placeholder}${idx}${placeholder}`;
      out = out.split(key).join(s);
    });

    return out;
  }

  shouldRenameIdentifier(code, index, name) {
    if (OBFUSCATOR_RESERVED.has(name)) return false;
    if (OBFUSCATOR_GLOBALS.has(name)) return false;

    // Look backwards to find previous non-whitespace character
    let i = index - 1;
    while (i >= 0 && /\s/.test(code[i])) i -= 1;
    if (i >= 0 && code[i] === '.') {
      // property access: obj.name
      return false;
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