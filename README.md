# Minibun 

A tiny javascript bundler implementation.

---

## Other Projects

### [Minirend](https://github.com/TolinSimpson/Minirend)
A cross-platform javascript runtime.

### [minima-js](https://github.com/TolinSimpson/minima-js)
A tiny, fully-featured, zero-dependency JavaScript framework. 


## Minibun features: 

- Tree-shaking (`TreeShaker`)
- Minification (`Minifier`)
- Bundling (`Bundler`)
- Module system (`ModuleSystem`)
- Obfuscation (`Obfuscator`)
- Tokenizing parser (`tokenize` / `findModuleSyntax`)

### Installation

Install from GitHub Packages:

```bash
npm install @tolinsimpson/minibun
```

**Note:** You'll need to authenticate with GitHub Packages. Create a `.npmrc` file in your project root:

```
@tolinsimpson:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Or set the `GITHUB_TOKEN` environment variable. You can create a Personal Access Token with `read:packages` permission at [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens).

### Usage (ESM)

```js
import {
  TreeShaker,
  Minifier,
  Bundler,
  ModuleSystem,
  Obfuscator,
  Pipeline,
} from '@tolinsimpson/minibun';
```

### Publishing

This package is published to GitHub Packages. To publish a new version:

1. **Manual Publishing:**
   ```bash
   npm login --registry=https://npm.pkg.github.com --scope=@tolinsimpson
   npm publish
   ```

2. **Automated Publishing:**
   - Create a GitHub Release, or
   - Use the "Publish to GitHub Packages" workflow from the Actions tab
   - The workflow will automatically build, test, and publish the package

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
