// @ts-check

import node from "@astrojs/node";
import starlight from "@astrojs/starlight";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import starlightBlog from "starlight-blog";

import d2 from "astro-d2";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  site: 'https://sqg.dev',
  integrations: [
    starlight({
      title: "SQG - SQL Query Generator",
      plugins: [starlightBlog()],
      social: [
        { icon: "external", label: "Playground", href: "/playground/" },
        { icon: "github", label: "GitHub", href: "https://github.com/sqg-dev/sqg" },
      ],
      components: {
        Footer: "./src/components/Footer.astro",
      },
      editLink: {
        baseUrl: 'https://github.com/sqg-dev/sqg/edit/main/website/',
      },
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Installation", slug: "guides/getting-started" },
            { label: "SQL Syntax", slug: "guides/sql-syntax" },
          ],
        },
        {
          label: "Resources",
          items: [
            { label: "Playground", link: "/playground/" },
            { label: "FAQ", slug: "guides/faq" },
            { label: "Related Projects", slug: "guides/related-projects" },
          ],
        },
      ],
    }),
    svelte(),
    d2(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
