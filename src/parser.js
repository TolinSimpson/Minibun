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
  'break','case','catch','class','const','continue','debugger','default','delete',
  'do','else','export','extends','finally','for','function','if','import','in',
  'instanceof','let','new','return','super','switch','this','throw','try','typeof',
  'var','void','while','with','yield','enum','await','async','of'
]);

const PUNCTUATORS = new Set([
  '{','}','(',')','[',']','.','; ',',',':','?','~',
  '<','>','<=','>=','==','!=','===','!==',
  '+','-','*','%','++','--','<<','>>','>>>',
  '&','|','^','!','&&','||','??',
  '=','+=','-=','*=','%=','<<=','>>=','>>>=',
  '&=','|=','^=','=>','**','**=','/?','/',
]);

function isIdentifierStart(ch) {
  return (
    (ch >= 'a' && ch <= 'z') ||
    (ch >= 'A' && ch <= 'Z') ||
    ch === '$' ||
    ch === '_'
  );
}

function isIdentifierPart(ch) {
  return isIdentifierStart(ch) || (ch >= '0' && ch <= '9');
}

function isDecimalDigit(ch) {
  return ch >= '0' && ch <= '9';
}

// Heuristic to decide if a slash starts a regex literal, based on previous token.
function isRegexAllowedAfter(prevToken) {
  if (!prevToken) return true;
  if (prevToken.type === 'keyword') {
    return ['return','case','throw','else','do','typeof','instanceof','in','of'].includes(
      prevToken.value
    );
  }
  // After these token types, we can start a regex.
  if (['punctuator'].includes(prevToken.type)) {
    return ['(','{','[',',',';','!','~','?','=',':','&&','||','??','+','-','*','/','%','&','|','^','<','>'].includes(
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
    if (type !== 'whitespace' && type !== 'comment') {
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
      push('whitespace', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Line comment //
    if (ch === '/' && code[i + 1] === '/') {
      let j = i + 2;
      while (j < len && code[j] !== '\n' && code[j] !== '\r') j++;
      push('comment', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Block comment /* */
    if (ch === '/' && code[i + 1] === '*') {
      let j = i + 2;
      while (j < len && !(code[j] === '*' && code[j + 1] === '/')) j++;
      j = Math.min(j + 2, len);
      push('comment', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // String literal ' " `
    if (ch === '\'' || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < len) {
        const c = code[j];
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === quote) {
          j++;
          break;
        }
        j++;
      }
      push('string', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Template literal (no interpolation parsing; we keep as a single token)
    if (ch === '`') {
      let j = i + 1;
      while (j < len) {
        const c = code[j];
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === '`') {
          j++;
          break;
        }
        // Skip ${...} sequences conservatively
        if (c === '$' && code[j + 1] === '{') {
          j += 2;
          let depth = 1;
          while (j < len && depth > 0) {
            const d = code[j];
            if (d === '\\') {
              j += 2;
              continue;
            }
            if (d === '{') depth++;
            else if (d === '}') depth--;
            j++;
          }
          continue;
        }
        j++;
      }
      push('template', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Number literal (simple decimal/hex)
    if (isDecimalDigit(ch) || (ch === '.' && isDecimalDigit(code[i + 1]))) {
      let j = i;
      if (ch === '0' && (code[i + 1] === 'x' || code[i + 1] === 'X')) {
        j += 2;
        while (j < len && /[0-9a-fA-F]/.test(code[j])) j++;
      } else {
        while (j < len && /[0-9]/.test(code[j])) j++;
        if (code[j] === '.' && /[0-9]/.test(code[j + 1])) {
          j++;
          while (j < len && /[0-9]/.test(code[j])) j++;
        }
      }
      push('number', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Identifier / keyword
    if (isIdentifierStart(ch)) {
      let j = i + 1;
      while (j < len && isIdentifierPart(code[j])) j++;
      const value = code.slice(i, j);
      const type = KEYWORDS.has(value) ? 'keyword' : 'identifier';
      push(type, value, i, j);
      i = j;
      continue;
    }

    // Regex literal vs division
    if (ch === '/' && isRegexAllowedAfter(prevSignificant)) {
      let j = i + 1;
      let inClass = false;
      while (j < len) {
        const c = code[j];
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === '[') {
          inClass = true;
        } else if (c === ']' && inClass) {
          inClass = false;
        } else if (c === '/' && !inClass) {
          j++;
          break;
        }
        j++;
      }
      // flags
      while (j < len && /[a-z]/i.test(code[j])) j++;
      push('regex', code.slice(i, j), i, j);
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
      push('punctuator', matched, i, i + matched.length);
      i += matched.length;
      continue;
    }

    // Unknown character: treat as punctuator to stay robust.
    push('punctuator', ch, i, i + 1);
    i += 1;
  }

  tokens.push({ type: 'eof', value: '', start: len, end: len });
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

  while (i < len) {
    const t = peek();
    if (t.type === 'keyword' && t.value === 'import') {
      const startIndex = i;
      consume(); // import
      let next = peek();
      // import "side-effect";
      if (next.type === 'string') {
        imports.push({ type: 'side-effect', source: next.value.slice(1, -1) });
        consume(); // string
      } else {
        // named/default/namespace imports until 'from'
        while (!(next.type === 'keyword' && next.value === 'from') && next.type !== 'eof') {
          consume();
          next = peek();
        }
        if (next.type === 'keyword' && next.value === 'from') {
          consume(); // from
          const srcTok = peek();
          if (srcTok.type === 'string') {
            imports.push({
              type: 'import',
              source: srcTok.value.slice(1, -1),
            });
            consume();
          }
        }
      }
      // skip to end of statement (semicolon or newline/punctuator heuristic)
      while (peek().type !== 'eof' && peek().value !== ';') consume();
      if (peek().value === ';') consume();
      continue;
    }

    if (t.type === 'keyword' && t.value === 'export') {
      consume(); // export
      const n = peek();
      if (n.type === 'punctuator' && n.value === '*') {
        consume(); // *
        let fromTok = peek();
        if (fromTok.type === 'keyword' && fromTok.value === 'from') {
          consume();
          const srcTok = peek();
          if (srcTok.type === 'string') {
            exports.push({
              type: 'all',
              source: srcTok.value.slice(1, -1),
            });
            consume();
          }
        } else {
          exports.push({ type: 'all' });
        }
        while (peek().type !== 'eof' && peek().value !== ';') consume();
        if (peek().value === ';') consume();
        continue;
      }

      if (n.type === 'keyword' && n.value === 'default') {
        exports.push({ type: 'default' });
        // skip rest of declaration/expression for our purposes
        while (peek().type !== 'eof' && peek().value !== ';') consume();
        if (peek().value === ';') consume();
        continue;
      }

      if (n.type === 'punctuator' && n.value === '{') {
        // export { a, b as c }
        consume(); // {
        const names = [];
        while (peek().type !== 'eof') {
          const tk = consume();
          if (tk.type === 'identifier') {
            names.push(tk.value);
          } else if (tk.type === 'punctuator' && tk.value === '}') {
            break;
          }
        }
        exports.push({ type: 'named', names });
        while (peek().type !== 'eof' && peek().value !== ';') consume();
        if (peek().value === ';') consume();
        continue;
      }

      // export const/let/var/function/class name ...
      if (n.type === 'keyword') {
        consume(); // const/let/var/function/class
        const idTok = peek();
        if (idTok.type === 'identifier') {
          exports.push({ type: 'named', names: [idTok.value] });
        }
        // Skip to semicolon or end of declaration heuristically
        while (peek().type !== 'eof' && peek().value !== ';') consume();
        if (peek().value === ';') consume();
        continue;
      }
    }

    consume();
  }

  return { imports, exports };
}

// CommonJS export for non-ESM environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports.tokenize = tokenize;
  module.exports.findModuleSyntax = findModuleSyntax;
}


