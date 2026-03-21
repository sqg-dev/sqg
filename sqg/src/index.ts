/**
 * @sqg/sqg - Programmatic API
 *
 * This module exports the core SQG functionality for use as a library.
 * For CLI usage, use the `sqg` binary directly.
 */

// Configuration & project management
export {
  parseProjectConfig,
  validateProject,
  validateProjectFromConfig,
  processProject,
  processProjectFromConfig,
  buildProjectFromCliOptions,
  createExtraVariables,
  validateQueries,
  getOutputPath,
  writeGeneratedFile,
  GENERATED_FILE_COMMENT,
  Config,
  SqlQueryHelper,
  TableHelper,
  ExtraVariable,
} from "./sqltool.js";
export type {
  Project,
  GeneratorConfig,
  ValidationResult,
  CliProjectOptions,
  SqlQueryPart,
  SqlQueryStatement,
  ParameterEntry,
} from "./sqltool.js";

// SQL parsing
export {
  SQLQuery,
  TableInfo,
  parseSQLQueries,
  ListType,
  StructType,
  MapType,
  EnumType,
} from "./sql-query.js";
export type { ColumnInfo, ColumnType, IsColumnType, ParseResult } from "./sql-query.js";

// Constants & generator definitions
export {
  DB_ENGINES,
  LANGUAGES,
  GENERATORS,
  DEFAULT_DRIVERS,
  GENERATOR_NAMES,
  SHORT_GENERATOR_NAMES,
  resolveGenerator,
  parseGenerator,
  isValidGenerator,
  getGeneratorEngine,
  getGeneratorLanguage,
  findSimilarGenerators,
  formatGeneratorsHelp,
  formatGeneratorsList,
} from "./constants.js";
export type { DbEngine, Language, GeneratorInfo } from "./constants.js";

// Database adapters
export { getDatabaseEngine } from "./db/index.js";
export type { DatabaseEngine } from "./db/types.js";
export { initializeDatabase } from "./db/types.js";

// Generators
export {
  getGenerator,
  BaseGenerator,
  TsGenerator,
  TsDuckDBGenerator,
  JavaGenerator,
  JavaDuckDBArrowGenerator,
  PythonGenerator,
} from "./generators/index.js";
export type { Generator } from "./generators/types.js";

// Type mapping
export {
  TypeMapper,
  JavaTypeMapper,
  TypeScriptTypeMapper,
  PythonTypeMapper,
} from "./type-mapping.js";

// Error handling
export {
  SqgError,
  ConfigError,
  InvalidGeneratorError,
  DatabaseError,
  SqlExecutionError,
  TypeMappingError,
  FileNotFoundError,
  formatErrorForOutput,
} from "./errors.js";
export type { SqgErrorCode, ErrorContext } from "./errors.js";

// Project scaffolding
export { initProject } from "./init.js";
export type { InitOptions } from "./init.js";
