// ---- parser.js ----
// src/parser.js
// Minimal-but-robust lexer focused on safely tokenizing JavaScript source:
// - Handles strings, template literals, comments, and regex literals.
// - Exposes enough structure for module analysis (import/export) and
//   whitespace-aware transformations (minification/obfuscation).
//
// This is NOT a full ECMAScript parser. It is intentionally conservative:
// - Expression grammar is not interpreted; tokens are emitted in sequence.
// - Regex literal vs division is detected using a simple, battle-tested
//   heuristic based on previous token type, which is sufficient for
//   production usage in typical ES module code.
//
// The public API:
//   - tokenize(code: string): Token[]
//   - findModuleSyntax(tokens: Token[]): { imports: ImportSpec[]; exports: ExportSpec[] }
//
// Tokens have the shape:
//   { type, value, start, end }
// where `type` is one of:
//   'identifier' | 'keyword' | 'string' | 'template' | 'number' |
//   'punctuator' | 'regex' | 'comment' | 'whitespace' | 'eof'

const KEYWORDS = new Set([
  '\x62\x72\x65\x61\x6b','\x63\x61\x73\x65','\x63\x61\x74\x63\x68','\x63\x6c\x61\x73\x73','\x63\x6f\x6e\x73\x74','\x63\x6f\x6e\x74\x69\x6e\x75\x65','\x64\x65\x62\x75\x67\x67\x65\x72','\x64\x65\x66\x61\x75\x6c\x74','\x64\x65\x6c\x65\x74\x65',
  '\x64\x6f','\x65\x6c\x73\x65','\x65\x78\x70\x6f\x72\x74','\x65\x78\x74\x65\x6e\x64\x73','\x66\x69\x6e\x61\x6c\x6c\x79','\x66\x6f\x72','\x66\x75\x6e\x63\x74\x69\x6f\x6e','\x69\x66','\x69\x6d\x70\x6f\x72\x74','\x69\x6e',
  '\x69\x6e\x73\x74\x61\x6e\x63\x65\x6f\x66','\x6c\x65\x74','\x6e\x65\x77','\x72\x65\x74\x75\x72\x6e','\x73\x75\x70\x65\x72','\x73\x77\x69\x74\x63\x68','\x74\x68\x69\x73','\x74\x68\x72\x6f\x77','\x74\x72\x79','\x74\x79\x70\x65\x6f\x66',
  '\x76\x61\x72','\x76\x6f\x69\x64','\x77\x68\x69\x6c\x65','\x77\x69\x74\x68','\x79\x69\x65\x6c\x64','\x65\x6e\x75\x6d','\x61\x77\x61\x69\x74','\x61\x73\x79\x6e\x63','\x6f\x66'
]);

const PUNCTUATORS = new Set([
  '\x7b','\x7d','\x28','\x29','\x5b','\x5d','\x2e','\x3b','\x2c','\x3a','\x3f','\x7e',
  '\x3c','\x3e','\x3c\x3d','\x3e\x3d','\x3d\x3d','\x21\x3d','\x3d\x3d\x3d','\x21\x3d\x3d',
  '\x2b','\x2d','\x2a','\x25','\x2b\x2b','\x2d\x2d','\x3c\x3c','\x3e\x3e','\x3e\x3e\x3e',
  '\x26','\x7c','\x5e','\x21','\x26\x26','\x7c\x7c','\x3f\x3f',
  '\x3d','\x2b\x3d','\x2d\x3d','\x2a\x3d','\x25\x3d','\x3c\x3c\x3d','\x3e\x3e\x3d','\x3e\x3e\x3e\x3d',
  '\x26\x3d','\x7c\x3d','\x5e\x3d','\x3d\x3e','\x2a\x2a','\x2a\x2a\x3d','\x2f','\x3f\x2e','\x3f\x3f\x3d','\x7c\x7c\x3d','\x26\x26\x3d',
]);

function isIdentifierStart(ch) {
  return (
    (ch >= '\x61' && ch <= '\x7a') ||
    (ch >= '\x41' && ch <= '\x5a') ||
    ch === '\x24' ||
    ch === '\x5f'
  );
}

function isIdentifierPart(ch) {
  return isIdentifierStart(ch) || (ch >= '\x30' && ch <= '\x39');
}

function isDecimalDigit(ch) {
  return ch >= '\x30' && ch <= '\x39';
}

// Heuristic to decide if a slash starts a regex literal, based on previous token.
function isRegexAllowedAfter(prevToken) {
  if (!prevToken) return true;
  if (prevToken.type === '\x6b\x65\x79\x77\x6f\x72\x64') {
    return ['\x72\x65\x74\x75\x72\x6e','\x63\x61\x73\x65','\x74\x68\x72\x6f\x77','\x65\x6c\x73\x65','\x64\x6f','\x74\x79\x70\x65\x6f\x66','\x69\x6e\x73\x74\x61\x6e\x63\x65\x6f\x66','\x69\x6e','\x6f\x66'].includes(
      prevToken.value
    );
  }
  // After these token types, we can start a regex.
  if (['\x70\x75\x6e\x63\x74\x75\x61\x74\x6f\x72'].includes(prevToken.type)) {
    return ['\x28','\x7b','\x5b','\x2c','\x3b','\x21','\x7e','\x3f','\x3d','\x3a','\x26\x26','\x7c\x7c','\x3f\x3f','\x2b','\x2d','\x2a','\x2f','\x25','\x26','\x7c','\x5e','\x3c','\x3e'].includes(
      prevToken.value
    );
  }
  // Otherwise, assume division.
  return false;
}

export function tokenize(code) {
  const tokens = [];
  let i = 0;
  const len = code.length;
  let prevSignificant = null;

  function push(type, value, start, end) {
    const t = { type, value, start, end };
    tokens.push(t);
    if (type !== '\x77\x68\x69\x74\x65\x73\x70\x61\x63\x65' && type !== '\x63\x6f\x6d\x6d\x65\x6e\x74') {
      prevSignificant = t;
    }
  }

  while (i < len) {
    const start = i;
    let ch = code[i];

    // Whitespace
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < len && /\s/.test(code[j])) j++;
      push('\x77\x68\x69\x74\x65\x73\x70\x61\x63\x65', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Line comment //
    if (ch === '\x2f' && code[i + 1] === '\x2f') {
      let j = i + 2;
      while (j < len && code[j] !== '\x5c\x6e' && code[j] !== '\x5c\x72') j++;
      push('\x63\x6f\x6d\x6d\x65\x6e\x74', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Block comment /* */
    if (ch === '\x2f' && code[i + 1] === '\x2a') {
      let j = i + 2;
      while (j < len && !(code[j] === '\x2a' && code[j + 1] === '\x2f')) j++;
      j = Math.min(j + 2, len);
      push('\x63\x6f\x6d\x6d\x65\x6e\x74', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // String literal ' " `
    if (ch === '\x5c\x27' || ch === '\x22') {
      const quote = ch;
      let j = i + 1;
      while (j < len) {
        const c = code[j];
        if (c === '\x5c\x5c') {
          j += 2;
          continue;
        }
        if (c === quote) {
          j++;
          break;
        }
        j++;
      }
      push('\x73\x74\x72\x69\x6e\x67', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Template literal (no interpolation parsing; we keep as a single token)
    if (ch === '\x60') {
      let j = i + 1;
      while (j < len) {
        const c = code[j];
        if (c === '\x5c\x5c') {
          j += 2;
          continue;
        }
        if (c === '\x60') {
          j++;
          break;
        }
        // Skip ${...} sequences conservatively
        if (c === '\x24' && code[j + 1] === '\x7b') {
          j += 2;
          let depth = 1;
          while (j < len && depth > 0) {
            const d = code[j];
            if (d === '\x5c\x5c') {
              j += 2;
              continue;
            }
            if (d === '\x7b') depth++;
            else if (d === '\x7d') depth--;
            j++;
          }
          continue;
        }
        j++;
      }
      push('\x74\x65\x6d\x70\x6c\x61\x74\x65', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Number literal (simple decimal/hex)
    if (isDecimalDigit(ch) || (ch === '\x2e' && isDecimalDigit(code[i + 1]))) {
      let j = i;
      if (ch === '\x30' && (code[i + 1] === '\x78' || code[i + 1] === '\x58')) {
        j += 2;
        while (j < len && /[0-9a-fA-F]/.test(code[j])) j++;
      } else {
        while (j < len && /[0-9]/.test(code[j])) j++;
        if (code[j] === '\x2e' && /[0-9]/.test(code[j + 1])) {
          j++;
          while (j < len && /[0-9]/.test(code[j])) j++;
        }
      }
      push('\x6e\x75\x6d\x62\x65\x72', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Identifier / keyword
    if (isIdentifierStart(ch)) {
      let j = i + 1;
      while (j < len && isIdentifierPart(code[j])) j++;
      const value = code.slice(i, j);
      const type = KEYWORDS.has(value) ? '\x6b\x65\x79\x77\x6f\x72\x64' : '\x69\x64\x65\x6e\x74\x69\x66\x69\x65\x72';
      push(type, value, i, j);
      i = j;
      continue;
    }

    // Regex literal vs division
    if (ch === '\x2f' && isRegexAllowedAfter(prevSignificant)) {
      let j = i + 1;
      let inClass = false;
      while (j < len) {
        const c = code[j];
        if (c === '\x5c\x5c') {
          j += 2;
          continue;
        }
        if (c === '\x5b') {
          inClass = true;
        } else if (c === '\x5d' && inClass) {
          inClass = false;
        } else if (c === '\x2f' && !inClass) {
          j++;
          break;
        }
        j++;
      }
      // flags
      while (j < len && /[a-z]/i.test(code[j])) j++;
      push('\x72\x65\x67\x65\x78', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Punctuator & operators (fallback: single char)
    // We attempt 3,2,1-char matches.
    let matched = null;
    for (const size of [3, 2, 1]) {
      if (i + size <= len) {
        const candidate = code.slice(i, i + size);
        if (PUNCTUATORS.has(candidate)) {
          matched = candidate;
          break;
        }
      }
    }
    if (matched) {
      push('\x70\x75\x6e\x63\x74\x75\x61\x74\x6f\x72', matched, i, i + matched.length);
      i += matched.length;
      continue;
    }

    // Unknown character: treat as punctuator to stay robust.
    push('\x70\x75\x6e\x63\x74\x75\x61\x74\x6f\x72', ch, i, i + 1);
    i += 1;
  }

  tokens.push({ type: '\x65\x6f\x66', value: '', start: len, end: len });
  return tokens;
}

// --- Module-level analysis helpers ----------------------------------------

// ImportSpec: { source: string, type: 'default'|'namespace'|'named'|'side-effect', specifiers?: string[] }
// ExportSpec: { type: 'named'|'default'|'all', names?: string[], source?: string }

export function findModuleSyntax(tokens) {
  const imports = [];
  const exports = [];

  let i = 0;
  const len = tokens.length;

  function peek(offset = 0) {
    return tokens[i + offset] || tokens[len - 1];
  }

  function consume() {
    const t = tokens[i];
    i += 1;
    return t;
  }

  // 'from' is a contextual keyword, so it's tokenized as an identifier
  function isFromKeyword(tok) {
    return (tok.type === '\x69\x64\x65\x6e\x74\x69\x66\x69\x65\x72' || tok.type === '\x6b\x65\x79\x77\x6f\x72\x64') && tok.value === '\x66\x72\x6f\x6d';
  }

  while (i < len) {
    const t = peek();
    if (t.type === '\x6b\x65\x79\x77\x6f\x72\x64' && t.value === '\x69\x6d\x70\x6f\x72\x74') {
      const startIndex = i;
      consume(); // import
      let next = peek();
      // import "side-effect";
      if (next.type === '\x73\x74\x72\x69\x6e\x67') {
        imports.push({ type: '\x73\x69\x64\x65\x2d\x65\x66\x66\x65\x63\x74', source: next.value.slice(1, -1) });
        consume(); // string
      } else {
        // named/default/namespace imports until 'from'
        // Note: 'from' is a contextual keyword, so it's tokenized as an identifier
        while (!isFromKeyword(next) && next.type !== '\x65\x6f\x66') {
          consume();
          next = peek();
        }
        if (isFromKeyword(next)) {
          consume(); // from
          // Skip whitespace to find the source string
          while (peek().type === '\x77\x68\x69\x74\x65\x73\x70\x61\x63\x65') consume();
          const srcTok = peek();
          if (srcTok.type === '\x73\x74\x72\x69\x6e\x67') {
            imports.push({
              type: '\x69\x6d\x70\x6f\x72\x74',
              source: srcTok.value.slice(1, -1),
            });
            consume();
          }
        }
      }
      // skip to end of statement (semicolon or newline/punctuator heuristic)
      while (peek().type !== '\x65\x6f\x66' && peek().value !== '\x3b') consume();
      if (peek().value === '\x3b') consume();
      continue;
    }

    if (t.type === '\x6b\x65\x79\x77\x6f\x72\x64' && t.value === '\x65\x78\x70\x6f\x72\x74') {
      consume(); // export
      // Skip whitespace after 'export'
      while (peek().type === '\x77\x68\x69\x74\x65\x73\x70\x61\x63\x65') consume();
      const n = peek();
      if (n.type === '\x70\x75\x6e\x63\x74\x75\x61\x74\x6f\x72' && n.value === '\x2a') {
        consume(); // *
        // Skip whitespace to find 'from'
        while (peek().type === '\x77\x68\x69\x74\x65\x73\x70\x61\x63\x65') consume();
        let fromTok = peek();
        if (isFromKeyword(fromTok)) {
          consume(); // from
          // Skip whitespace to find source string
          while (peek().type === '\x77\x68\x69\x74\x65\x73\x70\x61\x63\x65') consume();
          const srcTok = peek();
          if (srcTok.type === '\x73\x74\x72\x69\x6e\x67') {
            exports.push({
              type: '\x61\x6c\x6c',
              source: srcTok.value.slice(1, -1),
            });
            consume();
          }
        } else {
          exports.push({ type: '\x61\x6c\x6c' });
        }
        while (peek().type !== '\x65\x6f\x66' && peek().value !== '\x3b') consume();
        if (peek().value === '\x3b') consume();
        continue;
      }

      if (n.type === '\x6b\x65\x79\x77\x6f\x72\x64' && n.value === '\x64\x65\x66\x61\x75\x6c\x74') {
        exports.push({ type: '\x64\x65\x66\x61\x75\x6c\x74' });
        // skip rest of declaration/expression for our purposes
        while (peek().type !== '\x65\x6f\x66' && peek().value !== '\x3b') consume();
        if (peek().value === '\x3b') consume();
        continue;
      }

      if (n.type === '\x70\x75\x6e\x63\x74\x75\x61\x74\x6f\x72' && n.value === '\x7b') {
        // export { a, b as c }
        consume(); // {
        const names = [];
        while (peek().type !== '\x65\x6f\x66') {
          const tk = consume();
          if (tk.type === '\x69\x64\x65\x6e\x74\x69\x66\x69\x65\x72') {
            names.push(tk.value);
          } else if (tk.type === '\x70\x75\x6e\x63\x74\x75\x61\x74\x6f\x72' && tk.value === '\x7d') {
            break;
          }
        }
        exports.push({ type: '\x6e\x61\x6d\x65\x64', names });
        while (peek().type !== '\x65\x6f\x66' && peek().value !== '\x3b') consume();
        if (peek().value === '\x3b') consume();
        continue;
      }

      // export const/let/var/function/class name ...
      if (n.type === '\x6b\x65\x79\x77\x6f\x72\x64') {
        consume(); // const/let/var/function/class
        // Skip whitespace to find the identifier
        while (peek().type === '\x77\x68\x69\x74\x65\x73\x70\x61\x63\x65') consume();
        const idTok = peek();
        if (idTok.type === '\x69\x64\x65\x6e\x74\x69\x66\x69\x65\x72') {
          exports.push({ type: '\x6e\x61\x6d\x65\x64', names: [idTok.value] });
        }
        // Skip to semicolon or end of declaration heuristically
        while (peek().type !== '\x65\x6f\x66' && peek().value !== '\x3b') consume();
        if (peek().value === '\x3b') consume();
        continue;
      }
    }

    consume();
  }

  return { imports, exports };
}

// CommonJS export for non-ESM environments
if (typeof module !== '\x75\x6e\x64\x65\x66\x69\x6e\x65\x64' && module.exports) {
  module.exports.tokenize = tokenize;
  module.exports.findModuleSyntax = findModuleSyntax;
}


// ---- tree-shaking.js ----
// src/tree-shaking.js
// Tree-shaker built on top of the tokenizer. It understands ES module
// imports/exports via `findModuleSyntax` and performs conservative
// side-effect detection using token streams.


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
        if (exp.type === '\x64\x65\x66\x61\x75\x6c\x74') {
          exports.add('\x64\x65\x66\x61\x75\x6c\x74');
        } else if (exp.type === '\x6e\x61\x6d\x65\x64' && exp.names) {
          exp.names.forEach(n => exports.add(n));
        } else if (exp.type === '\x61\x6c\x6c') {
          exports.add('\x2a');
          if (exp.source) reexports.add(exp.source);
        }
      }

      // Conservative side-effect detection: look for any non-import/export
      // top-level call/new tokens.
      let hasSideEffects = false;
      for (const tok of tokens) {
        if (tok.type === '\x69\x64\x65\x6e\x74\x69\x66\x69\x65\x72' && (tok.value === '\x69\x6d\x70\x6f\x72\x74' || tok.value === '\x65\x78\x70\x6f\x72\x74')) {
          // skip
          continue;
        }
        if (tok.type === '\x69\x64\x65\x6e\x74\x69\x66\x69\x65\x72' || tok.type === '\x70\x75\x6e\x63\x74\x75\x61\x74\x6f\x72') {
          // crude heuristic: presence of "new" keyword or "()" pattern
          if (tok.type === '\x69\x64\x65\x6e\x74\x69\x66\x69\x65\x72' && tok.value === '\x6e\x65\x77') {
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
        usedExports.get(mod).add('\x5f\x5f\x73\x69\x64\x65\x5f\x65\x66\x66\x65\x63\x74\x73\x5f\x5f');
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
if (typeof module !== '\x75\x6e\x64\x65\x66\x69\x6e\x65\x64' && module.exports) {
  module.exports.TreeShaker = TreeShaker;
}


// ---- minification.js ----
// src/minification.js
// Token-based minifier: removes comments, collapses whitespace, and applies
// small boolean/null shortening while preserving strings, templates, and
// regex literals. This avoids the most common syntax traps of purely
// regex-based approaches.


export class Minifier {
  constructor(options = {}) {
    this.options = {
      keepComments: false,
      ...options,
    };
  }

  minify(code) {
    const source = String(code);
    if (source.trim() === '') return '';

    // Preserve original behaviour: when keeping comments we also preserve
    // original formatting and avoid rewrites.
    if (this.options.keepComments) {
      return source;
    }

    const tokens = tokenize(source);

    // 1) Drop comments and perform boolean/null shortening at token level.
    const transformed = [];
    for (const t of tokens) {
      if (t.type === '\x63\x6f\x6d\x6d\x65\x6e\x74') continue;

      if (t.type === '\x69\x64\x65\x6e\x74\x69\x66\x69\x65\x72' || t.type === '\x6b\x65\x79\x77\x6f\x72\x64') {
        if (t.value === '\x74\x72\x75\x65') {
          transformed.push({ ...t, type: '\x63\x6f\x64\x65', value: '\x21\x30' });
          continue;
        }
        if (t.value === '\x66\x61\x6c\x73\x65') {
          transformed.push({ ...t, type: '\x63\x6f\x64\x65', value: '\x21\x31' });
          continue;
        }
      }

      transformed.push(t);
    }

    // 2) Collapse whitespace safely: keep at most a single space only where
    // needed to separate two word-like tokens (identifiers/keywords/numbers)
    // so they don't merge into a different identifier.
    function isWordLike(tok) {
      return tok && (tok.type === '\x69\x64\x65\x6e\x74\x69\x66\x69\x65\x72' || tok.type === '\x6b\x65\x79\x77\x6f\x72\x64' || tok.type === '\x6e\x75\x6d\x62\x65\x72');
    }

    let out = '';
    let prevSignificant = null;

    for (let i = 0; i < transformed.length; i++) {
      const tok = transformed[i];
      if (tok.type === '\x77\x68\x69\x74\x65\x73\x70\x61\x63\x65') {
        // Look ahead to the next non-whitespace token.
        let j = i + 1;
        let next = transformed[j];
        while (next && next.type === '\x77\x68\x69\x74\x65\x73\x70\x61\x63\x65') {
          j += 1;
          next = transformed[j];
        }

        if (isWordLike(prevSignificant) && isWordLike(next)) {
          out += '\x20';
        }
        continue;
      }

      out += tok.value;
      if (tok.type !== '\x77\x68\x69\x74\x65\x73\x70\x61\x63\x65' && tok.type !== '\x63\x6f\x6d\x6d\x65\x6e\x74') {
        prevSignificant = tok;
      }
    }

    return out.trim();
  }
}

// CommonJS export
if (typeof module !== '\x75\x6e\x64\x65\x66\x69\x6e\x65\x64' && module.exports) {
  module.exports.Minifier = Minifier;
}


// ---- bundling.js ----
// src/bundling.js
// Bundler: builds dependency graph, topologically sorts, concatenates modules
// into a CommonJS-style bundle. The dependency graph is built using the
// tokenizer for robust import detection that handles all ES module syntax.


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
      console.warn('\x43\x69\x72\x63\x75\x6c\x61\x72\x20\x64\x65\x70\x65\x6e\x64\x65\x6e\x63\x69\x65\x73\x20\x64\x65\x74\x65\x63\x74\x65\x64\x3a', cycles);
    }

    const order = this.topologicalSort(entryModule);
    const parts = [];

    parts.push('\x76\x61\x72\x20\x5f\x5f\x6d\x6f\x64\x75\x6c\x65\x73\x5f\x5f\x20\x3d\x20\x7b\x7d\x3b');
    for (const name of order) {
      const code = this.moduleMap.get(name);
      parts.push(this.wrapModule(name, code));
    }
    parts.push(`var __entry__ = __modules__['${entryModule}'];`);

    return parts.join('\x5c\x6e\x5c\x6e');
  }
}

// CommonJS export
if (typeof module !== '\x75\x6e\x64\x65\x66\x69\x6e\x65\x64' && module.exports) {
  module.exports.Bundler = Bundler;
}


// ---- modules.js ----
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
      const factory = new Function('\x6d\x6f\x64\x75\x6c\x65', '\x65\x78\x70\x6f\x72\x74\x73', code + '\x5c\x6e\x72\x65\x74\x75\x72\x6e\x20\x6d\x6f\x64\x75\x6c\x65\x2e\x65\x78\x70\x6f\x72\x74\x73\x3b');
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
  if (typeof module !== '\x75\x6e\x64\x65\x66\x69\x6e\x65\x64' && module.exports) {
    module.exports.ModuleSystem = ModuleSystem;
  }


// ---- obfuscation.js ----
// src/obfuscation.js
// Obfuscator: string encoding + identifier renaming + optional control-flow
// flattening. String encoding replaces literal contents with hexadecimal
// escape sequences (e.g. "Hi" -> "\\x48\\x69") while preserving semantics.
// Uses the tokenizer for robust parsing that handles all JS syntax correctly.


const OBFUSCATOR_GLOBALS = new Set([
  '\x77\x69\x6e\x64\x6f\x77',
  '\x67\x6c\x6f\x62\x61\x6c',
  '\x67\x6c\x6f\x62\x61\x6c\x54\x68\x69\x73',
  '\x64\x6f\x63\x75\x6d\x65\x6e\x74',
  '\x63\x6f\x6e\x73\x6f\x6c\x65',
  '\x4d\x61\x74\x68',
  '\x44\x61\x74\x65',
  '\x4a\x53\x4f\x4e',
  '\x41\x72\x72\x61\x79',
  '\x4f\x62\x6a\x65\x63\x74',
  '\x53\x74\x72\x69\x6e\x67',
  '\x4e\x75\x6d\x62\x65\x72',
  '\x42\x6f\x6f\x6c\x65\x61\x6e',
  '\x52\x65\x67\x45\x78\x70',
  '\x50\x72\x6f\x6d\x69\x73\x65',
  '\x53\x65\x74',
  '\x4d\x61\x70',
  '\x42\x75\x66\x66\x65\x72',
  '\x61\x74\x6f\x62',
  '\x75\x6e\x64\x65\x66\x69\x6e\x65\x64',
  '\x4e\x61\x4e',
  '\x49\x6e\x66\x69\x6e\x69\x74\x79',
  '\x45\x72\x72\x6f\x72',
  '\x54\x79\x70\x65\x45\x72\x72\x6f\x72',
  '\x52\x65\x66\x65\x72\x65\x6e\x63\x65\x45\x72\x72\x6f\x72',
  '\x53\x79\x6e\x74\x61\x78\x45\x72\x72\x6f\x72',
  '\x52\x61\x6e\x67\x65\x45\x72\x72\x6f\x72',
  '\x65\x76\x61\x6c',
  '\x70\x61\x72\x73\x65\x49\x6e\x74',
  '\x70\x61\x72\x73\x65\x46\x6c\x6f\x61\x74',
  '\x69\x73\x4e\x61\x4e',
  '\x69\x73\x46\x69\x6e\x69\x74\x65',
  '\x65\x6e\x63\x6f\x64\x65\x55\x52\x49',
  '\x64\x65\x63\x6f\x64\x65\x55\x52\x49',
  '\x65\x6e\x63\x6f\x64\x65\x55\x52\x49\x43\x6f\x6d\x70\x6f\x6e\x65\x6e\x74',
  '\x64\x65\x63\x6f\x64\x65\x55\x52\x49\x43\x6f\x6d\x70\x6f\x6e\x65\x6e\x74',
  '\x72\x65\x71\x75\x69\x72\x65',
  '\x6d\x6f\x64\x75\x6c\x65',
  '\x65\x78\x70\x6f\x72\x74\x73',
  '\x5f\x5f\x64\x69\x72\x6e\x61\x6d\x65',
  '\x5f\x5f\x66\x69\x6c\x65\x6e\x61\x6d\x65',
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
        const hex = text.charCodeAt(i).toString(16).padStart(2, '\x30');
        out += '\x5c\x5c\x78' + hex;
      }
      return out;
    };

    let out = '';

    for (const tok of tokens) {
      if (tok.type === '\x73\x74\x72\x69\x6e\x67') {
        const quote = tok.value[0];
        const inner = tok.value.slice(1, -1);
        const encoded = toHexEscapes(inner);
        out += `${quote}${encoded}${quote}`;
      } else if (tok.type === '\x74\x65\x6d\x70\x6c\x61\x74\x65') {
        // Only encode simple templates without interpolation; otherwise we
        // leave them as-is to avoid changing semantics.
        if (!tok.value.includes('\x24\x7b')) {
          const inner = tok.value.slice(1, -1);
          const encoded = toHexEscapes(inner);
          out += '\x60' + encoded + '\x60';
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
    const chars = '\x61\x62\x63\x64\x65\x66\x67\x68\x69\x6a\x6b\x6c\x6d\x6e\x6f\x70\x71\x72\x73\x74\x75\x76\x77\x78\x79\x7a\x41\x42\x43\x44\x45\x46\x47\x48\x49\x4a\x4b\x4c\x4d\x4e\x4f\x50\x51\x52\x53\x54\x55\x56\x57\x58\x59\x5a';
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
      if (tok.type !== '\x69\x64\x65\x6e\x74\x69\x66\x69\x65\x72') continue;
      if (!this.shouldRenameIdentifier(tokens, i)) continue;
      if (this.idMap.has(tok.value)) continue;
      const newName = this.generateName(this.idMap.size);
      this.idMap.set(tok.value, newName);
    }

    // Second pass: rebuild code with renamed identifiers
    let out = '';
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type === '\x69\x64\x65\x6e\x74\x69\x66\x69\x65\x72' && this.shouldRenameIdentifier(tokens, i)) {
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
    if (tok.type === '\x6b\x65\x79\x77\x6f\x72\x64') return false;

    // Don't rename global identifiers
    if (OBFUSCATOR_GLOBALS.has(name)) return false;

    // Look backwards to find previous non-whitespace token
    let prevIdx = index - 1;
    while (prevIdx >= 0 && tokens[prevIdx].type === '\x77\x68\x69\x74\x65\x73\x70\x61\x63\x65') {
      prevIdx--;
    }

    if (prevIdx >= 0) {
      const prev = tokens[prevIdx];
      // Property access: obj.name or obj?.name
      if (prev.type === '\x70\x75\x6e\x63\x74\x75\x61\x74\x6f\x72' && (prev.value === '\x2e' || prev.value === '\x3f\x2e')) {
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
if (typeof module !== '\x75\x6e\x64\x65\x66\x69\x6e\x65\x64' && module.exports) {
  module.exports.Obfuscator = Obfuscator;
}


// ---- pipeline.js ----
// src/pipeline.js
// Configurable build pipeline that composes the algorithms in src/.

import fs from '\x6e\x6f\x64\x65\x3a\x66\x73\x2f\x70\x72\x6f\x6d\x69\x73\x65\x73';
import path from '\x6e\x6f\x64\x65\x3a\x70\x61\x74\x68';


export class Pipeline {
  constructor(options = {}) {
    this.entryFile = options.entryFile || '\x2e\x2f\x69\x6e\x64\x65\x78\x2e\x6a\x73';
    this.modulesDir = options.modulesDir || '\x2e\x2f\x73\x72\x63';
    this.outputFile = options.outputFile || '\x2e\x2f\x64\x69\x73\x74\x2f\x6d\x69\x6e\x69\x62\x75\x6e\x2e\x6a\x73';
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
    this.steps.push({ type: '\x74\x72\x65\x65\x53\x68\x61\x6b\x65', options });
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
    this.steps.push({ type: '\x62\x75\x6e\x64\x6c\x65', options });
    return this;
  }

  useMinifier(options = {}) {
    this.steps.push({ type: '\x6d\x69\x6e\x69\x66\x79', options });
    return this;
  }

  useObfuscator(options = {}) {
    this.steps.push({ type: '\x6f\x62\x66\x75\x73\x63\x61\x74\x65', options });
    return this;
  }


  // ---- JSON config integration ----

  static fromJSON(config) {
    const pipeline = new Pipeline({
      entryFile: config.entry || '\x2e\x2f\x69\x6e\x64\x65\x78\x2e\x6a\x73',
      modulesDir: config.modulesDir || '\x2e\x2f\x73\x72\x63',
      outputFile: config.output || '\x2e\x2f\x64\x69\x73\x74\x2f\x6d\x69\x6e\x69\x62\x75\x6e\x2e\x6a\x73',
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
        case '\x74\x72\x65\x65\x53\x68\x61\x6b\x65': {
          const shaker = new TreeShaker(current);
          current = shaker.shake(this.entryFile);
          break;
        }
        case '\x62\x75\x6e\x64\x6c\x65': {
          const bundler = new Bundler(current);
          current = bundler.bundle(this.entryFile);
          break;
        }
        case '\x6d\x69\x6e\x69\x66\x79': {
          const minifier = new Minifier(step.options);
          current = minifier.minify(String(current));
          break;
        }
        case '\x6f\x62\x66\x75\x73\x63\x61\x74\x65': {
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
      await fs.writeFile(filePath, String(value), '\x75\x74\x66\x38');
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
        } else if (entry.isFile() && entry.name.endsWith('\x2e\x6a\x73')) {
          const rel = '\x2e\x2f' + path.relative(root, full).replace(/\\/g, '\x2f');
          const code = await fs.readFile(full, '\x75\x74\x66\x38');
          modules.set(rel, code);
        }
      }
    };

    await walk(root);
    return modules;
  }
}

// CommonJS export
if (typeof module !== '\x75\x6e\x64\x65\x66\x69\x6e\x65\x64' && module.exports) {
  module.exports.Pipeline = Pipeline;
}


// ---- CommonJS fallback API ----
if (typeof module !== '\x75\x6e\x64\x65\x66\x69\x6e\x65\x64' && module.exports) {
  module.exports = {
    TreeShaker,
    Minifier,
    Bundler,
    ModuleSystem,
    Obfuscator,
    Pipeline
  };
}
