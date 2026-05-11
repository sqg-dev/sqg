/**
 * @sqg/sqg - Programmatic API
 *
 * This module exports the core SQG functionality for use as a library.
 * For CLI usage, use the `sqg` binary directly.
 */

export type { DbEngine, GeneratorInfo, Language } from "./constants.js";
// Constants & generator definitions
export {
  DB_ENGINES,
  DEFAULT_DRIVERS,
  findSimilarGenerators,
  formatGeneratorsHelp,
  formatGeneratorsList,
  GENERATOR_NAMES,
  GENERATORS,
  getGeneratorEngine,
  getGeneratorLanguage,
  isValidGenerator,
  LANGUAGES,
  parseGenerator,
  resolveGenerator,
  SHORT_GENERATOR_NAMES,
} from "./constants.js";
// Database adapters
export { getDatabaseEngine } from "./db/index.js";
export type { DatabaseEngine } from "./db/types.js";
export { initializeDatabase } from "./db/types.js";
export type { ErrorContext, SqgErrorCode } from "./errors.js";
// Error handling
export {
  ConfigError,
  DatabaseError,
  FileNotFoundError,
  formatErrorForOutput,
  InvalidGeneratorError,
  SqgError,
  SqlExecutionError,
  TypeMappingError,
} from "./errors.js";
// Generators
export {
  BaseGenerator,
  getGenerator,
  JavaDuckDBArrowGenerator,
  JavaGenerator,
  PythonGenerator,
  TsDuckDBGenerator,
  TsGenerator,
} from "./generators/index.js";
export type { Generator } from "./generators/types.js";
export type { InitOptions } from "./init.js";
// Project scaffolding
export { initProject } from "./init.js";
export type { ColumnInfo, ColumnType, IsColumnType, ParseResult } from "./sql-query.js";
// SQL parsing
export {
  EnumType,
  ListType,
  MapType,
  parseSQLQueries,
  SQLQuery,
  StructType,
  TableInfo,
} from "./sql-query.js";
export type {
  CliProjectOptions,
  GeneratorConfig,
  ParameterEntry,
  Project,
  SqlQueryPart,
  SqlQueryStatement,
  ValidationResult,
} from "./sqltool.js";
// Configuration & project management
export {
  buildProjectFromCliOptions,
  Config,
  createExtraVariables,
  ExtraVariable,
  GENERATED_FILE_COMMENT,
  getOutputPath,
  parseProjectConfig,
  processProject,
  processProjectFromConfig,
  SqlQueryHelper,
  TableHelper,
  validateProject,
  validateProjectFromConfig,
  validateQueries,
  writeGeneratedFile,
} from "./sqltool.js";
// Type mapping
export {
  JavaTypeMapper,
  PythonTypeMapper,
  TypeMapper,
  TypeScriptTypeMapper,
} from "./type-mapping.js";
