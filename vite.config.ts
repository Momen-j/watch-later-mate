import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Vite configuration
export default defineConfig({
  plugins: [react()], // The custom plugin is removed
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        background: resolve(__dirname, "src/background/background.ts"),
        content: resolve(__dirname, "src/content/content.ts"),
      },
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
});



// import { defineConfig, type PluginOption, loadEnv } from "vite";
// import react from "@vitejs/plugin-react";
// import { resolve } from "path";
// import fs from "fs";

// // Custom plugin to handle manifest generation
// function manifestPlugin(env: Record<string, string>): PluginOption {
//   return {
//     name: "make-manifest",
//     buildEnd() {
//       const manifestTemplate = fs.readFileSync(
//         resolve(__dirname, "public/manifest.json"),
//         "utf-8"
//       );

//       const manifestContent = manifestTemplate.replace(
//         '"__CLIENT_ID__"',
//         `"${env.VITE_CLIENT_ID}"`
//       );

//       const distDir = resolve(__dirname, "dist");
//       if (!fs.existsSync(distDir)) {
//         fs.mkdirSync(distDir);
//       }

//       fs.writeFileSync(resolve(distDir, "manifest.json"), manifestContent);
//     },
//   };
// }

// // Vite config
// export default defineConfig(({ mode }) => {
//   // Load environment variables for the current mode
//   const env = loadEnv(mode, process.cwd(), "");

//   return {
//     plugins: [react(), manifestPlugin(env)],
//     build: {
//       // The output directory for the build.
//       outDir: "dist",
//       // Ensures the dist directory is cleared before each build.
//       emptyOutDir: true,
//       // Vite's options for the underlying Rollup bundler.
//       rollupOptions: {
//         // Define the entry points for your extension.
//         input: {
//           // Your popup's HTML file in the project root.
//           popup: resolve(__dirname, "popup.html"),

//           // Your background script.
//           background: resolve(__dirname, "src/background/background.ts"),

//           // Your content script.
//           // Note: This assumes the path is 'src/content/content.ts'.
//           content: resolve(__dirname, "src/content/content.ts"),
//         },
//         // Configure how the output files are generated.
//         output: {
//           // We use '[name].js' for predictable file names.
//           // This will create 'popup.js', 'background.js', etc.
//           entryFileNames: "[name].js",
//         },
//       },
//     },
//   };
// });
