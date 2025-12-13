// src/minification.js
// Token-based minifier: removes comments, collapses whitespace, and applies
// small boolean/null shortening while preserving strings, templates, and
// regex literals. This avoids the most common syntax traps of purely
// regex-based approaches.

import { tokenize } from './parser.js';

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
      if (t.type === 'comment') continue;

      if (t.type === 'identifier' || t.type === 'keyword') {
        if (t.value === 'true') {
          transformed.push({ ...t, type: 'code', value: '!0' });
          continue;
        }
        if (t.value === 'false') {
          transformed.push({ ...t, type: 'code', value: '!1' });
          continue;
        }
      }

      transformed.push(t);
    }

    // 2) Collapse whitespace safely: keep at most a single space only where
    // needed to separate two word-like tokens (identifiers/keywords/numbers)
    // so they don't merge into a different identifier.
    function isWordLike(tok) {
      return tok && (tok.type === 'identifier' || tok.type === 'keyword' || tok.type === 'number');
    }

    let out = '';
    let prevSignificant = null;

    for (let i = 0; i < transformed.length; i++) {
      const tok = transformed[i];
      if (tok.type === 'whitespace') {
        // Look ahead to the next non-whitespace token.
        let j = i + 1;
        let next = transformed[j];
        while (next && next.type === 'whitespace') {
          j += 1;
          next = transformed[j];
        }

        if (isWordLike(prevSignificant) && isWordLike(next)) {
          out += ' ';
        }
        continue;
      }

      out += tok.value;
      if (tok.type !== 'whitespace' && tok.type !== 'comment') {
        prevSignificant = tok;
      }
    }

    return out.trim();
  }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports.Minifier = Minifier;
}