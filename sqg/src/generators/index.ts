import { JavaDuckDBArrowGenerator } from "./java-duckdb-arrow-generator.js";
import { JavaGenerator } from "./java-generator.js";
import type { Generator } from "./types.js";
import { TsGenerator } from "./typescript-generator.js";

export { BaseGenerator } from "./base-generator.js";
export { JavaDuckDBArrowGenerator } from "./java-duckdb-arrow-generator.js";
export { JavaGenerator } from "./java-generator.js";
export type { Generator } from "./types.js";
export { TsGenerator } from "./typescript-generator.js";

export function getGenerator(generator: string): Generator {
  switch (generator) {
    case "java/jdbc":
      return new JavaGenerator("templates/java-jdbc.hbs");
    case "java/duckdb-arrow":
      return new JavaDuckDBArrowGenerator("templates/java-duckdb-arrow.hbs");
    case "typescript/better-sqlite3":
      return new TsGenerator("templates/better-sqlite3.hbs");
    case "typescript/duckdb":
      return new TsGenerator("templates/typescript-duckdb.hbs");
    default:
      throw new Error(`Unsupported generator: ${generator}`);
  }
}
