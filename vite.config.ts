import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const rawBase = process.env.VITE_BASE_PATH?.trim();
  const strippedBase = rawBase ? rawBase.replace(/^\/+|\/+$/g, '') : '';
  const normalizedBase = !rawBase
    ? './'
    : strippedBase.length > 0
      ? `/${strippedBase}/`
      : '/';

  return {
    // Uses exact GitHub Pages repo base path (e.g. /Print3D-Maker/) in CI,
    // and relative './' locally so assets always load without 404s.
    base: normalizedBase,
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds, and creates 404.html + .nojekyll for GitHub Pages.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
          if (fs.existsSync(distDir)) {
            const indexHtml = path.resolve(distDir, 'index.html');
            const notFoundHtml = path.resolve(distDir, '404.html');
            const noJekyll = path.resolve(distDir, '.nojekyll');
            if (fs.existsSync(indexHtml)) {
              fs.cpSync(indexHtml, notFoundHtml, {force: true});
            }
            fs.writeFileSync(noJekyll, '');
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
