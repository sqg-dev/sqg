import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

/**
 * Prevents Tailwind from choking on @xyflow/svelte's CSS.
 * The Svelte plugin extracts virtual CSS modules (?svelte&type=style&lang.css)
 * from .svelte files. When these come from node_modules, Tailwind can't parse
 * them. This plugin intercepts those virtual modules and returns empty CSS.
 */
function fixNodeModulesSvelteCss(): Plugin {
  return {
    name: 'fix-node-modules-svelte-css',
    enforce: 'pre',
    load(id) {
      // Intercept virtual CSS extracted from node_modules .svelte files
      if (id.includes('node_modules') && id.includes('.svelte?') && id.includes('type=style')) {
        return { code: '/* node_modules svelte css skipped */', map: null };
      }
    },
    transform(code, id) {
      if (id.includes('node_modules') && id.endsWith('.svelte')) {
        return { code, map: null };
      }
    },
  };
}

export default defineConfig({
  plugins: [
    fixNodeModulesSvelteCss(),
    svelte(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/trpc': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ['@xyflow/svelte', '@tanstack/svelte-table'],
  },
  build: {
    chunkSizeWarningLimit: 2500,
  },
});
