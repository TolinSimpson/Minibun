## minibun-algorithms

Pure JavaScript reference implementations of core JS optimization algorithms:

- Tree-shaking (`TreeShaker`)
- Minification (`Minifier`)
- Bundling (`Bundler`)
- Module system (`ModuleSystem`)
- Obfuscation (`Obfuscator`)
- Tokenizing parser (`tokenize` / `findModuleSyntax`)

### Usage (ESM)

```js
import {
  TreeShaker,
  Minifier,
  Bundler,
  ModuleSystem,
  Obfuscator,
  Pipeline,
} from './src/index.js';
```

### Project Structure

- **`src/`** - Primary source code (modular, maintainable)
  - Edit files here when making changes
  - Tests import directly from `src/` modules
- **`dist/`** - Generated build artifacts (do not edit directly)
  - `dist/minibun.js` - Single-file bundle created by `npm run build`
  - Other variants are generated for testing purposes
  - Regenerate with `npm run build` after modifying `src/`

### Scope and limitations

- Algorithms are implemented in **pure JavaScript** with **regex-based parsing**.
- A lightweight **tokenizer** is used for module analysis and safe
  transformations; there is **no full AST**.
- They are suitable for **controlled ES6+ codebases** that avoid highly dynamic features:
  - No `eval`, `with`, or `Function(...)` constructors.
  - Only **static `import`/`export`** with literal module specifiers.
  - No reliance on subtle ASI (automatic semicolon insertion) edge cases.
- For general, arbitrary JavaScript on the web, use established tools (esbuild, Rollup, Terser) instead.
