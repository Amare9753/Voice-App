import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => {
  const base = process.env.PAGES_BASE ?? (command === 'build' ? '/Voice-App/' : '/');
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
        manifest: {
          name: 'Core Capture',
          short_name: 'Capture',
          description: 'Private bench notes that stay on this phone.',
          display: 'standalone',
          orientation: 'portrait',
          start_url: base,
          scope: base,
          background_color: '#F3F0E8',
          theme_color: '#0F6E56',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
          // The asyncify WASM is a bundler fallback. Runtime uses the smaller single-thread build in /ort.
          globIgnores: ['**/*asyncify*.wasm'],
          maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,mjs,gz,webmanifest}'],
        },
      }),
    ],
    resolve: {
      alias: {
        '@core': new URL('../src', import.meta.url).pathname,
      },
    },
    build: {
      target: 'es2022',
    },
  };
});
