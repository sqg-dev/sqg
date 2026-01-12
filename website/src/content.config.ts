import { defineCollection, z } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { blogSchema } from "starlight-blog/schema";

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: (context) => blogSchema(context),
    }),
  }),
  examples: defineCollection({
    type: "content",
    schema: z.object({
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      sql: z.string(),
      engine: z.enum(["sqlite", "duckdb"]).default("sqlite"),
      language: z.enum(["java-jdbc", "java-arrow", "typescript"]).default("java-jdbc"),
    }),
  }),
};
