// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';
import starlight from '@astrojs/starlight';

import d2 from 'astro-d2';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [starlight({
    title: 'SQG',
    social: [
      { icon: 'github', label: 'GitHub', href: 'https://github.com/sqg-dev/sqg' },
    ],
    components: {
      Footer: './src/components/Footer.astro',
    },
    sidebar: [
      {
        label: 'Getting Started',
        items: [
          { label: 'Installation', slug: 'guides/getting-started' },
          { label: 'SQL Syntax', slug: 'guides/sql-syntax' },
        ],
      },
      {
        label: 'Resources',
        items: [
          { label: 'Playground', link: '/playground/' },
          { label: 'FAQ', slug: 'guides/faq' },
          { label: 'Related Projects', slug: 'guides/related-projects' },
        ],
      },
    ],
  }), svelte(), tailwind({ applyBaseStyles: false }), d2()],
});