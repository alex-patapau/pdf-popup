import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index-lightbox.html')
      },
      // Не обрабатывать pdf.min.mjs как внешнюю зависимость
      external: []
    }
  },
  server: {
    port: 3000,
    open: true
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'assets/*',
          dest: 'assets'
        },
        {
          src: '*.pdf',
          dest: '.'
        }
      ]
    })
  ],
  assetsInclude: ['**/*.pdf', '**/*.mjs'],
  optimizeDeps: {
    exclude: ['../assets/pdf.min.mjs']
  }
});

