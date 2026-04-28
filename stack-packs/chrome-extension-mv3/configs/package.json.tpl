{
  "name": "{{extension-slug|chrome-extension}}",
  "version": "{{extension-version|0.1.0}}",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "dev":       "vite build --watch --mode development",
    "build":     "vite build && node scripts/web-ext-lint.mjs dist/",
    "lint":      "eslint . && npx web-ext lint --source-dir=dist",
    "typecheck": "tsc --noEmit",
    "test":      "vitest run",
    "test:watch": "vitest",
    "package":   "node scripts/package-cws.mjs",
    "prepare":   "husky"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0",
    "@types/chrome": "^0.0.270",
    "@types/node":   "^22.0.0",
    "eslint":         "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser":        "^8.0.0",
    "typescript":     "^5.5.0",
    "vite":           "^5.4.0",
    "vitest":         "^2.0.0",
    "web-ext":        "^8.0.0",
    "husky":          "^9.0.0",
    "lint-staged":    "^15.0.0",
    "@commitlint/cli":                   "^19.0.0",
    "@commitlint/config-conventional":   "^19.0.0"
  }
}
