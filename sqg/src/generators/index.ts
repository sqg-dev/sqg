import { GENERATOR_NAMES, findSimilarGenerators } from "../constants.js";
import { InvalidGeneratorError } from "../errors.js";
import { JavaDuckDBArrowGenerator } from "./java-duckdb-arrow-generator.js";
import { JavaGenerator } from "./java-generator.js";
import type { Generator } from "./types.js";
import { TsDuckDBGenerator } from "./typescript-duckdb-generator.js";
import { TsGenerator } from "./typescript-generator.js";

export { BaseGenerator } from "./base-generator.js";
export { JavaDuckDBArrowGenerator } from "./java-duckdb-arrow-generator.js";
export { JavaGenerator } from "./java-generator.js";
export type { Generator } from "./types.js";
export { TsDuckDBGenerator } from "./typescript-duckdb-generator.js";
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
      return new TsDuckDBGenerator("templates/typescript-duckdb.hbs");
    default: {
      const similar = findSimilarGenerators(generator);
      throw new InvalidGeneratorError(
        generator,
        [...GENERATOR_NAMES],
        similar.length > 0 ? similar[0] : undefined,
      );
    }
  }
}
