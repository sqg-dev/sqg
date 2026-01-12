import { readFileSync, writeFileSync } from "node:fs";
import consola from "consola";
import { camelCase, pascalCase } from "es-toolkit/string";
import Handlebars from "handlebars";
import typescriptPlugin from "prettier/parser-typescript";
import estree from "prettier/plugins/estree";
import prettier from "prettier/standalone";
import {
  type ColumnInfo,
  EnumType,
  ListType,
  MapType,
  type SQLQuery,
  StructType,
  type TableInfo,
} from "../sql-query.js";
import type { GeneratorConfig, SqlQueryHelper } from "../sqltool.js";
import { TypeScriptTypeMapper } from "../type-mapping.js";
import { BaseGenerator } from "./base-generator.js";
import { DbEngine } from "../constants.js";

export class TsGenerator extends BaseGenerator {
  constructor(template: string) {
    super(template, new TypeScriptTypeMapper());
  }

  getFunctionName(id: string): string {
    return camelCase(id);
  }

  isCompatibleWith(_engine: DbEngine): boolean {
    return true;
  }
  getFilename(sqlFileName: string) {
    return `${sqlFileName}.ts`;
  }
  getClassName(name: string) {
    return pascalCase(name);
  }

  async beforeGenerate(
    _projectDir: string,
    _gen: GeneratorConfig,
    _queries: SQLQuery[],
    _tables: TableInfo[],
  ): Promise<void> {
    Handlebars.registerHelper("quote", (value: string) => this.quote(value));

    // Map SQL types to DuckDB appender method suffixes
    // Note: DuckDB Node.js appender API uses type-specific methods
    Handlebars.registerHelper("appendMethod", (column: ColumnInfo) => {
      const typeStr = column.type?.toString().toUpperCase() || "";
      // INTEGER types -> appendInteger (JS number)
      if (typeStr === "INTEGER" || typeStr === "INT" || typeStr === "INT4" || typeStr === "SIGNED") {
        return "Integer";
      }
      if (typeStr === "SMALLINT" || typeStr === "INT2" || typeStr === "SHORT") {
        return "SmallInt";
      }
      if (typeStr === "TINYINT" || typeStr === "INT1") {
        return "TinyInt";
      }
      // BIGINT types -> appendBigInt (JS bigint)
      if (typeStr === "BIGINT" || typeStr === "INT8" || typeStr === "LONG") {
        return "BigInt";
      }
      if (typeStr === "HUGEINT" || typeStr === "INT128") {
        return "HugeInt";
      }
      // Unsigned integer types
      if (typeStr === "UINTEGER" || typeStr === "UINT4") {
        return "UInteger";
      }
      if (typeStr === "USMALLINT" || typeStr === "UINT2") {
        return "USmallInt";
      }
      if (typeStr === "UTINYINT" || typeStr === "UINT1") {
        return "UTinyInt";
      }
      if (typeStr === "UBIGINT" || typeStr === "UINT8") {
        return "UBigInt";
      }
      // Float types
      if (typeStr === "DOUBLE" || typeStr === "FLOAT8" || typeStr === "NUMERIC" || typeStr === "DECIMAL") {
        return "Double";
      }
      if (typeStr === "FLOAT" || typeStr === "FLOAT4" || typeStr === "REAL") {
        return "Float";
      }
      // Boolean
      if (typeStr === "BOOLEAN" || typeStr === "BOOL" || typeStr === "LOGICAL") {
        return "Boolean";
      }
      // Date/Time types - check TIMESTAMP before TIME since "TIMESTAMP" contains "TIME"
      if (typeStr === "DATE") {
        return "Date";
      }
      if (typeStr === "TIMESTAMP" || typeStr.includes("TIMESTAMP")) {
        return "Timestamp";
      }
      if (typeStr === "TIME" || typeStr.includes("TIME")) {
        return "Time";
      }
      // Binary
      if (typeStr === "BLOB" || typeStr === "BYTEA" || typeStr === "BINARY" || typeStr === "VARBINARY") {
        return "Blob";
      }
      // UUID
      if (typeStr === "UUID") {
        return "Uuid";
      }
      // Interval
      if (typeStr === "INTERVAL") {
        return "Interval";
      }
      // Default to Varchar for text types and unknown types
      return "Varchar";
    });

    // Type helper for appender row types - includes nullability
    Handlebars.registerHelper("tsTypeForAppender", (column: ColumnInfo) => {
      const typeStr = column.type?.toString().toUpperCase() || "";
      let baseType: string;

      // Map SQL types to TypeScript types for appender row interface
      if (typeStr === "INTEGER" || typeStr === "INT" || typeStr === "INT4" ||
          typeStr === "SMALLINT" || typeStr === "INT2" || typeStr === "TINYINT" || typeStr === "INT1" ||
          typeStr === "UINTEGER" || typeStr === "UINT4" || typeStr === "USMALLINT" || typeStr === "UINT2" ||
          typeStr === "UTINYINT" || typeStr === "UINT1" ||
          typeStr === "DOUBLE" || typeStr === "FLOAT8" || typeStr === "FLOAT" || typeStr === "FLOAT4" || typeStr === "REAL") {
        baseType = "number";
      } else if (typeStr === "BIGINT" || typeStr === "INT8" || typeStr === "HUGEINT" || typeStr === "INT128" ||
                 typeStr === "UBIGINT" || typeStr === "UINT8") {
        baseType = "bigint";
      } else if (typeStr === "BOOLEAN" || typeStr === "BOOL") {
        baseType = "boolean";
      } else if (typeStr === "DATE") {
        baseType = "DuckDBDateValue";
      } else if (typeStr === "TIMESTAMP" || typeStr.includes("TIMESTAMP")) {
        // Check TIMESTAMP before TIME since "TIMESTAMP" contains "TIME"
        baseType = "DuckDBTimestampValue";
      } else if (typeStr === "TIME" || typeStr.includes("TIME")) {
        baseType = "DuckDBTimeValue";
      } else if (typeStr === "BLOB" || typeStr === "BYTEA") {
        baseType = "DuckDBBlobValue";
      } else if (typeStr === "UUID") {
        baseType = "string";
      } else {
        // Default to string for text types and unknown types
        baseType = "string";
      }

      // Add nullability if column is nullable
      if (column.nullable) {
        return `${baseType} | null`;
      }
      return baseType;
    });

    Handlebars.registerHelper("tsType", (column: ColumnInfo) => {
      const inlineType = (col: ColumnInfo): string => {
        const t = col.type;

        const withNullability = (base: string) => {
          if (!col.nullable) return base;
          // Avoid `T | null | null` etc.
          if (/\bnull\b/.test(base)) return base;
          return `${base} | null`;
        };

        if (t instanceof ListType) {
          // Plain arrays for SQLite/better-sqlite3
          const element = inlineType({ name: col.name, type: t.baseType, nullable: true });
          const elementWrapped = element.includes(" | ") ? `(${element})` : element;
          return withNullability(`${elementWrapped}[]`);
        }

        if (t instanceof MapType) {
          // Map type for SQLite
          const key = inlineType({ name: "key", type: t.keyType.type, nullable: false });
          const value = inlineType({ name: "value", type: t.valueType.type, nullable: true });
          return withNullability(`Map<${key}, ${value}>`);
        }

        if (t instanceof StructType) {
          // Plain object for SQLite
          const isValidIdent = (name: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
          const fields = t.fields
            .map((f) => {
              const key = isValidIdent(f.name) ? f.name : JSON.stringify(f.name);
              const valueType = inlineType({ name: f.name, type: f.type, nullable: true });
              return `${key}: ${valueType}`;
            })
            .join("; ");
          return withNullability(`{ ${fields} }`);
        }

        if (t instanceof EnumType) {
          // Generate a union type of literal strings for enums
          const unionType = t.values.map((v) => JSON.stringify(v)).join(" | ");
          return withNullability(unionType);
        }

        // primitives / unknown strings
        return this.typeMapper.getTypeName(col);
      };

      return inlineType(column);
    });
    Handlebars.registerHelper("declareTypes", (queryHelper: SqlQueryHelper) => {
      const typeMapper = queryHelper.typeMapper;

      const declarations = new Map<string, string>();

      const visit = (column: ColumnInfo) => {
        const t = column.type;
        if (t instanceof ListType) {
          // Lists keep the same "field name" for struct naming
          visit({ name: column.name, type: t.baseType, nullable: true });
          return;
        }
        if (t instanceof StructType) {
          const typeName = typeMapper.getTypeName(column);
          if (!declarations.has(typeName)) {
            declarations.set(typeName, typeMapper.getDeclarations(column));
          }
          for (const field of t.fields) {
            visit({ name: field.name, type: field.type, nullable: true });
          }
          return;
        }
        if (t instanceof MapType) {
          // We currently model maps as `Map` in TS, but still collect struct declarations
          visit({ name: column.name, type: t.keyType.type, nullable: true });
          visit({ name: column.name, type: t.valueType.type, nullable: true });
        }
      };

      if (queryHelper.isPluck) {
        const col = queryHelper.columns[0];
        visit({ name: col.name, type: col.type, nullable: true });
      } else {
        for (const col of queryHelper.columns) {
          visit({ name: col.name, type: col.type, nullable: true });
        }
      }

      return Array.from(declarations.values()).filter(Boolean).join("\n\n");
    });
  }

  async afterGenerate(outputPath: string): Promise<void> {
    try {
      consola.debug("Formatting file:", outputPath);
      const code = readFileSync(outputPath, "utf-8");
      const formattedCode = await prettier.format(code, {
        parser: "typescript",
        plugins: [typescriptPlugin, estree],
      });
      writeFileSync(outputPath, formattedCode);
    } catch (error) {
      consola.error("Failed to format file:", error);
    }
  }

  quote(value: string): string {
    return value.includes("\n") || value.includes("'") ? `\`${value}\`` : `'${value}'`;
  }
}
