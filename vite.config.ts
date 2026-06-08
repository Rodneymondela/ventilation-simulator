import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The 3D view is the only consumer of three.js and is dynamically imported,
    // so three lands in its own async chunk. Split the three vendor code out of
    // our View3D app code into a stable `three` chunk: it only downloads when the
    // user opens the 3D view, and its hash stays put across our own redeploys
    // (better long-term caching). Its ~500kB is the WebGLRenderer + shader library
    // floor of a three.js scene and cannot be tree-shaken away — so we raise the
    // size-warning limit to match this one expected, intentional vendor chunk.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
        },
      },
    },
  },
})
