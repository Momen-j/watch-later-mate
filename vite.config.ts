import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The output directory for the build.
    outDir: 'dist',
    // Ensures the dist directory is cleared before each build.
    emptyOutDir: true,
    // Vite's options for the underlying Rollup bundler.
    rollupOptions: {
      // Define the entry points for your extension.
      input: {
        // Your popup's HTML file in the project root.
        popup: resolve(__dirname, 'popup.html'),

        // Your background script.
        background: resolve(__dirname, 'src/background/background.ts'),

        // Your content script.
        // Note: This assumes the path is 'src/content/content.ts'.
        content: resolve(__dirname, 'src/content/content.ts'),
      },
      // Configure how the output files are generated.
      output: {
        // We use '[name].js' for predictable file names.
        // This will create 'popup.js', 'background.js', etc.
        entryFileNames: '[name].js',
      },
    },
  },
})