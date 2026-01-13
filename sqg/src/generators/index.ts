import { GENERATOR_NAMES, SHORT_GENERATOR_NAMES, findSimilarGenerators, parseGenerator, resolveGenerator } from "../constants.js";
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

/**
 * Get a generator instance for the given generator.
 * Accepts both short (language/engine) and full (language/engine/driver) formats.
 */
export function getGenerator(generator: string): Generator {
  const fullGenerator = resolveGenerator(generator);

  try {
    const info = parseGenerator(generator);

    // Select generator class based on language and driver
    const key = `${info.language}/${info.driver}`;
    switch (key) {
      case "typescript/better-sqlite3":
        return new TsGenerator(`templates/${info.template}`);
      case "typescript/node-api":
        return new TsDuckDBGenerator(`templates/${info.template}`);
      case "java/jdbc":
        return new JavaGenerator(`templates/${info.template}`);
      case "java/arrow":
        return new JavaDuckDBArrowGenerator(`templates/${info.template}`);
      default:
        // This shouldn't happen if GENERATORS is properly configured
        throw new Error(`No generator class for ${key}`);
    }
  } catch {
    const similar = findSimilarGenerators(generator);
    const validGenerators = [...SHORT_GENERATOR_NAMES, ...GENERATOR_NAMES];
    throw new InvalidGeneratorError(fullGenerator, validGenerators, similar.length > 0 ? similar[0] : undefined);
  }
}
