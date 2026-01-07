/**
 * SQG Error Handling - Structured errors with actionable context
 *
 * These error classes provide rich context for debugging and
 * machine-readable output for AI assistants and tooling.
 */

/** Error codes for machine-readable output */
export type SqgErrorCode =
  | "CONFIG_PARSE_ERROR"
  | "CONFIG_VALIDATION_ERROR"
  | "FILE_NOT_FOUND"
  | "INVALID_ENGINE"
  | "INVALID_GENERATOR"
  | "GENERATOR_ENGINE_MISMATCH"
  | "DATABASE_ERROR"
  | "DATABASE_NOT_INITIALIZED"
  | "SQL_PARSE_ERROR"
  | "SQL_EXECUTION_ERROR"
  | "TYPE_MAPPING_ERROR"
  | "DUPLICATE_QUERY"
  | "MISSING_VARIABLE"
  | "INVALID_MODIFIER"
  | "VALIDATION_ERROR"
  | "UNKNOWN_ERROR";

/** Context information for errors */
export interface ErrorContext {
  file?: string;
  line?: number;
  column?: number;
  query?: string;
  engine?: string;
  generator?: string;
  sql?: string;
  [key: string]: unknown;
}

/**
 * Base error class for SQG with structured information
 */
export class SqgError extends Error {
  constructor(
    message: string,
    public code: SqgErrorCode,
    public suggestion?: string,
    public context?: ErrorContext,
  ) {
    super(message);
    this.name = "SqgError";
  }

  /**
   * Create error with file context
   */
  static inFile(
    message: string,
    code: SqgErrorCode,
    file: string,
    options?: { line?: number; suggestion?: string; context?: ErrorContext },
  ): SqgError {
    const location = options?.line ? `${file}:${options.line}` : file;
    return new SqgError(`${message} in ${location}`, code, options?.suggestion, {
      file,
      line: options?.line,
      ...options?.context,
    });
  }

  /**
   * Create error with query context
   */
  static inQuery(
    message: string,
    code: SqgErrorCode,
    queryName: string,
    file: string,
    options?: { suggestion?: string; sql?: string; context?: ErrorContext },
  ): SqgError {
    return new SqgError(`${message} in query '${queryName}' (${file})`, code, options?.suggestion, {
      file,
      query: queryName,
      sql: options?.sql,
      ...options?.context,
    });
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      suggestion: this.suggestion,
      context: this.context,
    };
  }
}

/**
 * Error for configuration issues
 */
export class ConfigError extends SqgError {
  constructor(message: string, suggestion?: string, context?: ErrorContext) {
    super(message, "CONFIG_VALIDATION_ERROR", suggestion, context);
    this.name = "ConfigError";
  }
}

/**
 * Error for invalid generator names
 */
export class InvalidGeneratorError extends SqgError {
  constructor(generatorName: string, validGenerators: string[], suggestion?: string) {
    const similarMsg = suggestion ? ` Did you mean '${suggestion}'?` : "";
    super(
      `Invalid generator '${generatorName}'.${similarMsg} Valid generators: ${validGenerators.join(", ")}`,
      "INVALID_GENERATOR",
      suggestion ? `Use '${suggestion}' instead` : `Choose from: ${validGenerators.join(", ")}`,
      { generator: generatorName },
    );
    this.name = "InvalidGeneratorError";
  }
}

/**
 * Error for invalid engine names
 */
export class InvalidEngineError extends SqgError {
  constructor(engineName: string, validEngines: string[]) {
    super(
      `Invalid engine '${engineName}'. Valid engines: ${validEngines.join(", ")}`,
      "INVALID_ENGINE",
      `Choose from: ${validEngines.join(", ")}`,
      { engine: engineName },
    );
    this.name = "InvalidEngineError";
  }
}

/**
 * Error for generator/engine compatibility
 */
export class GeneratorEngineMismatchError extends SqgError {
  constructor(generator: string, engine: string, compatibleEngines: readonly string[]) {
    super(
      `Generator '${generator}' is not compatible with engine '${engine}'`,
      "GENERATOR_ENGINE_MISMATCH",
      `Generator '${generator}' works with: ${compatibleEngines.join(", ")}`,
      { generator, engine },
    );
    this.name = "GeneratorEngineMismatchError";
  }
}

/**
 * Error for database initialization/connection issues
 */
export class DatabaseError extends SqgError {
  constructor(message: string, engine: string, suggestion?: string, context?: ErrorContext) {
    super(message, "DATABASE_ERROR", suggestion, { engine, ...context });
    this.name = "DatabaseError";
  }
}

/**
 * Error for SQL execution issues
 */
export class SqlExecutionError extends SqgError {
  constructor(message: string, queryName: string, file: string, sql: string, originalError?: Error) {
    super(`Failed to execute query '${queryName}' in ${file}: ${message}`, "SQL_EXECUTION_ERROR", undefined, {
      query: queryName,
      file,
      sql,
      originalError: originalError?.message,
    });
    this.name = "SqlExecutionError";
  }
}

/**
 * Error for type mapping issues
 */
export class TypeMappingError extends SqgError {
  constructor(message: string, columnName: string, queryName?: string, file?: string) {
    const location = queryName && file ? ` in query '${queryName}' (${file})` : "";
    super(`Type mapping error for column '${columnName}'${location}: ${message}`, "TYPE_MAPPING_ERROR", undefined, {
      columnName,
      query: queryName,
      file,
    });
    this.name = "TypeMappingError";
  }
}

/**
 * Error for file not found
 */
export class FileNotFoundError extends SqgError {
  constructor(filePath: string, searchedFrom?: string) {
    const suggestion = searchedFrom
      ? `Check that the path is relative to ${searchedFrom}`
      : "Check that the file path is correct";
    super(`File not found: ${filePath}`, "FILE_NOT_FOUND", suggestion, { file: filePath });
    this.name = "FileNotFoundError";
  }
}

/**
 * Format any error for JSON output
 */
export function formatErrorForOutput(err: unknown): {
  status: "error";
  error: {
    code: SqgErrorCode;
    message: string;
    suggestion?: string;
    context?: ErrorContext;
  };
} {
  if (err instanceof SqgError) {
    return {
      status: "error",
      error: {
        code: err.code,
        message: err.message,
        suggestion: err.suggestion,
        context: err.context,
      },
    };
  }

  if (err instanceof Error) {
    return {
      status: "error",
      error: {
        code: "UNKNOWN_ERROR",
        message: err.message,
      },
    };
  }

  return {
    status: "error",
    error: {
      code: "UNKNOWN_ERROR",
      message: String(err),
    },
  };
}
