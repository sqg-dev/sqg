import Handlebars from "handlebars";
import type { DbEngine } from "../constants.js";
import {
  type ColumnInfo,
  type ColumnType,
  EnumType,
  ListType,
  MapType,
  type SQLQuery,
  StructType,
  type TableInfo,
} from "../sql-query.js";
import type { GeneratorConfig, SqlQueryHelper } from "../sqltool.js";
import { resolveElementType, TsGenerator } from "./typescript-generator.js";

/**
 * Bind-compatible parameter types for DuckDB types whose *column* representation
 * is a wrapper object.
 *
 * `getRowObjects()` hands back `{ days }` for a DATE, `{ micros }` for a
 * TIMESTAMP and so on, which is the right type to read a row into -- but those
 * plain objects are not `DuckDBValue`s, so binding one throws
 * "Cannot create values of type ANY" and the generated code does not even
 * type-check. Every replacement below was verified to bind against
 * @duckdb/node-api; a string literal is accepted for all of them, which also
 * matches how the `@set` default is written.
 */
const BINDABLE_PARAMETER_TYPES: Record<string, string> = {
  DATE: "string",
  DATETIME: "string",
  TIME: "string",
  "TIME WITH TIME ZONE": "string",
  TIMESTAMP: "string",
  TIMESTAMP_S: "string",
  TIMESTAMP_MS: "string",
  TIMESTAMP_NS: "string",
  "TIMESTAMP WITH TIME ZONE": "string",
  INTERVAL: "string",
  UUID: "string",
  BIT: "string",
  BLOB: "DuckDBBlobValue | string",
};

/**
 * TypeScript generator for DuckDB.
 * DuckDB's Node API returns complex types as wrapper objects:
 * - Lists as { items: T[] }
 * - Structs as { entries: { field1: T1, ... } }
 * - Maps as { entries: { key: K, value: V }[] }
 */
export class TsDuckDBGenerator extends TsGenerator {
  constructor(template: string) {
    super(template, "duckdb");
  }

  override supportsAppenders(_engine: DbEngine): boolean {
    return true;
  }

  override mapParameterType(type: ColumnType, nullable: boolean): string {
    const bindable =
      typeof type === "string" ? BINDABLE_PARAMETER_TYPES[type.toUpperCase()] : undefined;
    if (!bindable) {
      return super.mapParameterType(type, nullable);
    }
    return nullable ? `${bindable} | null` : bindable;
  }

  async beforeGenerate(
    projectDir: string,
    gen: GeneratorConfig,
    queries: SQLQuery[],
    tables: TableInfo[],
  ): Promise<void> {
    // Call parent to register quote helper
    await super.beforeGenerate(projectDir, gen, queries, tables);

    // Check if a query has any list-typed parameters (needs prepared statement with explicit binds)
    Handlebars.registerHelper("hasListParams", (queryHelper: SqlQueryHelper) => {
      const paramTypes = queryHelper.query.parameterTypes;
      if (!paramTypes) return false;
      for (const [, colType] of paramTypes) {
        if (colType instanceof ListType) return true;
      }
      return false;
    });

    // Generate bind statements for prepared statement parameters
    Handlebars.registerHelper("bindStatements", (queryHelper: SqlQueryHelper) => {
      const paramNames = queryHelper.parameterNames;
      const paramTypes = queryHelper.query.parameterTypes;
      return paramNames
        .map((name, i) => {
          const colType = paramTypes?.get(name);
          if (colType instanceof ListType) {
            return `stmt.bindList(${i + 1}, ${name}.items, new DuckDBListType(${resolveElementType(colType.baseType)}));`;
          }
          return `stmt.bindValue(${i + 1}, ${name});`;
        })
        .join("\n        ");
    });

    // Override tsType helper with DuckDB-specific wrapper types
    Handlebars.registerHelper("tsType", (column: ColumnInfo) => {
      const inlineType = (col: ColumnInfo): string => {
        const t = col.type;

        const withNullability = (base: string) => {
          if (!col.nullable) return base;
          if (/\bnull\b/.test(base)) return base;
          return `${base} | null`;
        };

        if (t instanceof ListType) {
          // DuckDB returns arrays as { items: T[] }
          const element = inlineType({ name: col.name, type: t.baseType, nullable: true });
          const elementWrapped = element.includes(" | ") ? `(${element})` : element;
          return withNullability(`{ items: ${elementWrapped}[] }`);
        }

        if (t instanceof MapType) {
          // DuckDB returns maps as { entries: { key: K, value: V }[] }
          const key = inlineType({ name: "key", type: t.keyType.type, nullable: true });
          const value = inlineType({ name: "value", type: t.valueType.type, nullable: true });
          return withNullability(`{ entries: { key: ${key}; value: ${value} }[] }`);
        }

        if (t instanceof StructType) {
          // DuckDB returns structs as { entries: { field1: T1, ... } }
          const isValidIdent = (name: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
          const fields = t.fields
            .map((f) => {
              const key = isValidIdent(f.name) ? f.name : JSON.stringify(f.name);
              const valueType = inlineType({ name: f.name, type: f.type, nullable: true });
              return `${key}: ${valueType}`;
            })
            .join("; ");
          return withNullability(`{ entries: { ${fields} } }`);
        }

        if (t instanceof EnumType) {
          const unionType = t.values.map((v) => JSON.stringify(v)).join(" | ");
          return withNullability(unionType);
        }

        return this.typeMapper.getTypeName(col);
      };

      return inlineType(column);
    });
  }
}
