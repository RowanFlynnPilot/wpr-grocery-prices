import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base ('./') keeps every asset path relative so the same build works
// from a GitHub Pages project subpath (/wpr-grocery-prices/) AND inside a
// WordPress <iframe> embed, with no rebuild needed per host.
//
// publicDir points at the repo's data/ directory so the canonical
// data/prices.json that fetch.py writes is copied verbatim into the build
// output as /prices.json — there is no second copy to keep in sync.
export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: 'data',
})
