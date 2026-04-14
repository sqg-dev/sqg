import { readFileSync, writeFileSync } from "node:fs";
import consola from "consola";
import { camelCase, pascalCase } from "es-toolkit/string";
import Handlebars from "handlebars";
import prettier from "prettier/standalone";
import prettierPluginJava from "prettier-plugin-java";
import type { DbEngine } from "../constants.js";
import type { ColumnInfo, SQLQuery, TableInfo } from "../sql-query.js";
import { EnumType, ListType, StructType } from "../sql-query.js";
import type { GeneratorConfig, SqlQueryHelper, SqlQueryPart } from "../sqltool.js";
import { JavaTypeMapper } from "../type-mapping.js";
import { BaseGenerator } from "./base-generator.js";

export class JavaGenerator extends BaseGenerator {
  private engine: DbEngine;

  constructor(public template: string, engine: DbEngine = "duckdb") {
    super(template, new JavaTypeMapper());
    this.engine = engine;
  }

  override supportsAppenders(engine: DbEngine): boolean {
    return engine === "duckdb" || engine === "postgres";
  }

  getFunctionName(id: string): string {
    return camelCase(id);
  }

  getFilename(sqlFileName: string) {
    return `${pascalCase(sqlFileName)}.java`;
  }
  getClassName(name: string) {
    return pascalCase(name);
  }

  partsToString(parts: SqlQueryPart[]): string {
    const stringParts: { str: string; quote: boolean }[] = [];

    function addPart(str: string, quote: boolean) {
      if (quote && stringParts.length > 0) {
        const last = stringParts[stringParts.length - 1];
        if (last.quote) {
          last.str += str;
          return;
        }
      }
      stringParts.push({ str, quote });
    }

    for (const part of parts) {
      if (typeof part === "string") {
        addPart(part, true);
      } else {
        addPart(" '", true);
        addPart(part.name, false);
        addPart("'", true);
      }
    }
    return stringParts
      .map((part) => {
        if (part.quote && (part.str.includes("\n") || part.str.includes('"'))) {
          return `"""\n${part.str}"""`;
        }
        if (part.quote) {
          return `"${part.str}"`;
        }
        return part.str;
      })
      .join(" + ");
  }

  private readColumn(column: ColumnInfo, index: number, path: string) {
    const idx = index + 1;
    const readExpr = jdbcReadExpression(column, idx, this.typeMapper as JavaTypeMapper);
    if (readExpr !== null) {
      return readExpr;
    }
    return this.typeMapper.parseValue(column, `rs.getObject(${idx})`, path);
  }

  async beforeGenerate(
    _projectDir: string,
    _gen: GeneratorConfig,
    _queries: SQLQuery[],
    _tables: TableInfo[],
  ): Promise<void> {
    Handlebars.registerHelper("isDuckDB", () => this.engine === "duckdb");
    Handlebars.registerHelper("isPostgres", () => this.engine === "postgres");
    Handlebars.registerHelper("pgBulkType", (column: ColumnInfo) => {
      return pgBulkInsertType(column.type.toString().toUpperCase());
    });
    Handlebars.registerHelper("pgBulkAccessor", (column: ColumnInfo) => {
      return pgBulkInsertAccessor(column.type.toString().toUpperCase());
    });
    Handlebars.registerHelper("javaVarName", (name: string) => {
      const n = camelCase(name);
      return JavaTypeMapper.javaReservedKeywords.has(n) ? `${n}_` : n;
    });
    Handlebars.registerHelper("partsToString", (parts: SqlQueryPart[]) =>
      this.partsToString(parts),
    );
    Handlebars.registerHelper("hasMultipleParams", (params: unknown[]) => params.length > 1);
    Handlebars.registerHelper(
      "jdbcSet",
      (javaType: string, index: number, expr: string) =>
        new Handlebars.SafeString(jdbcSetterStatement(javaType, index, expr)),
    );
    Handlebars.registerHelper("concat", (...args: unknown[]) =>
      args.slice(0, -1).join(""),
    );
    Handlebars.registerHelper("declareTypes", (queryHelper: SqlQueryHelper) => {
      const query = queryHelper.query;
      if (queryHelper.isPluck) {
        return queryHelper.typeMapper.getDeclarations({ ...query.columns[0], name: query.id }, " ");
      }
      return queryHelper.typeMapper.getDeclarations(query.allColumns);
    });
    Handlebars.registerHelper("appenderType", (column: ColumnInfo) => {
      return this.mapType(column);
    });
    Handlebars.registerHelper("declareEnums", (queryHelpers: SqlQueryHelper[]) => {
      const enumTypes = new Map<string, EnumType>();

      for (const qh of queryHelpers) {
        // Collect from columns
        for (const col of qh.query.columns) {
          if (col.type instanceof EnumType && col.type.name) {
            enumTypes.set(col.type.name, col.type);
          }
        }
        // Collect from parameter types
        if (qh.query.parameterTypes) {
          for (const colType of qh.query.parameterTypes.values()) {
            if (colType instanceof EnumType && colType.name) {
              enumTypes.set(colType.name, colType);
            }
          }
        }
      }

      if (enumTypes.size === 0) return "";

      const parts: string[] = [];
      for (const [, enumType] of enumTypes) {
        const enumName = pascalCase(enumType.name!);
        // Sanitize all values to Java identifiers first
        const sanitized = enumType.values.map((v) => {
          let ident = v.toUpperCase().replace(/[^A-Za-z0-9_]/g, "_");
          if (ident.length > 0 && /^[0-9]/.test(ident)) {
            ident = `_${ident}`;
          }
          if (ident.length === 0) {
            ident = "_EMPTY";
          }
          return ident;
        });
        // Disambiguate: for each collision, try _2, _3, ... (skipping any that are already taken)
        const usedIdents = new Set<string>();
        const finalIdents = sanitized.map((base) => {
          if (!usedIdents.has(base)) {
            usedIdents.add(base);
            return base;
          }
          let counter = 2;
          let candidate = `${base}_${counter}`;
          while (usedIdents.has(candidate)) {
            counter++;
            candidate = `${base}_${counter}`;
          }
          usedIdents.add(candidate);
          return candidate;
        });
        const entries = enumType.values.map((v, i) => `${finalIdents[i]}("${v}")`);

        parts.push(`public enum ${enumName} {
    ${entries.join(", ")};
    private final String value;
    private static final java.util.Map<String, ${enumName}> BY_VALUE =
        java.util.Map.ofEntries(java.util.Arrays.stream(values()).map(v -> java.util.Map.entry(v.value, v)).toArray(java.util.Map.Entry[]::new));
    ${enumName}(String value) { this.value = value; }
    public String getValue() { return value; }
    public static ${enumName} fromValue(String value) {
        ${enumName} result = BY_VALUE.get(value);
        if (result == null) throw new IllegalArgumentException("Unknown value: " + value);
        return result;
    }
}`);
      }

      return new Handlebars.SafeString(parts.join("\n\n    "));
    });
    Handlebars.registerHelper("readColumns", (queryHelper: SqlQueryHelper) => {
      const query = queryHelper.query;
      if (queryHelper.isPluck) {
        return this.readColumn({ ...query.columns[0], name: query.id }, 0, "");
      }
      const result = [] as string[];
      const rowType = this.rowType(queryHelper.query);
      for (let i = 0; i < queryHelper.columns.length; i++) {
        const column = queryHelper.columns[i];
        result.push(this.readColumn(column, i, `${rowType}.`));
      }
      return `new ${rowType}(${result.join(",\n")})`;
    });
  }

  async afterGenerate(outputPath: string): Promise<void> {
    try {
      consola.debug("Formatting file:", outputPath);
      const code = readFileSync(outputPath, "utf-8");
      const formattedCode = await prettier.format(code, {
        parser: "java",
        plugins: [prettierPluginJava],
        tabWidth: 4,
      });
      writeFileSync(outputPath, formattedCode);
    } catch (error) {
      consola.error("Failed to format Java file:", error);
    }
  }
}

// Maps Java target type → typed JDBC ResultSet getter. Using typed getters
// avoids the driver's generic Object path and unnecessary casts. Boxed
// primitives use the JDBC 4.2 getObject(int, Class) form so null is preserved.
const JDBC_GETTER_MAP: Record<string, (i: number) => string> = {
  String: (i) => `rs.getString(${i})`,
  "byte[]": (i) => `rs.getBytes(${i})`,
  BigDecimal: (i) => `rs.getBigDecimal(${i})`,
  Integer: (i) => `rs.getObject(${i}, Integer.class)`,
  Long: (i) => `rs.getObject(${i}, Long.class)`,
  Short: (i) => `rs.getObject(${i}, Short.class)`,
  Byte: (i) => `rs.getObject(${i}, Byte.class)`,
  Boolean: (i) => `rs.getObject(${i}, Boolean.class)`,
  Double: (i) => `rs.getObject(${i}, Double.class)`,
  Float: (i) => `rs.getObject(${i}, Float.class)`,
};

// SQL types that need helper-based conversion (date/time, JSON, arrays) — leave
// these on the generic getObject path so the existing wrapper helpers apply.
const OPAQUE_SQL_TYPES = new Set([
  "TIMESTAMP",
  "DATETIME",
  "TIMESTAMPTZ",
  "TIMESTAMP WITH TIME ZONE",
  "TIMESTAMP_S",
  "TIMESTAMP_MS",
  "TIMESTAMP_NS",
  "DATE",
  "TIME",
  "TIME WITH TIME ZONE",
  "JSON",
  "JSONB",
]);

function jdbcReadExpression(
  column: ColumnInfo,
  index: number,
  typeMapper: JavaTypeMapper,
): string | null {
  if (
    column.type instanceof EnumType ||
    column.type instanceof ListType ||
    column.type instanceof StructType
  ) {
    return null;
  }
  const upperType = column.type?.toString().toUpperCase() ?? "";
  if (OPAQUE_SQL_TYPES.has(upperType) || upperType.startsWith("_")) {
    return null;
  }
  const fieldType = typeMapper.getTypeName(column);
  const getter = JDBC_GETTER_MAP[fieldType];
  return getter ? getter(index) : null;
}

// Boxed Java parameter type → typed JDBC setter + java.sql.Types code for null.
// Anything not listed falls back to setObject (LocalDate, OffsetDateTime,
// BigDecimal, UUID, List<...>, etc.), where the driver inspects the value.
const JDBC_SETTER_MAP: Record<string, { setter: string; sqlType: string }> = {
  String: { setter: "setString", sqlType: "VARCHAR" },
  Integer: { setter: "setInt", sqlType: "INTEGER" },
  Long: { setter: "setLong", sqlType: "BIGINT" },
  Short: { setter: "setShort", sqlType: "SMALLINT" },
  Boolean: { setter: "setBoolean", sqlType: "BOOLEAN" },
  Double: { setter: "setDouble", sqlType: "DOUBLE" },
  Float: { setter: "setFloat", sqlType: "REAL" },
  "byte[]": { setter: "setBytes", sqlType: "VARBINARY" },
};

// Reference setters pass null through; boxed-primitive setters auto-unbox and NPE on null.
const NULL_SAFE_SETTERS = new Set(["setString", "setBytes"]);

function jdbcSetterStatement(javaType: string, index: number, expr: string): string {
  const entry = JDBC_SETTER_MAP[javaType];
  if (!entry) {
    return `stmt.setObject(${index}, ${expr});`;
  }
  if (NULL_SAFE_SETTERS.has(entry.setter)) {
    return `stmt.${entry.setter}(${index}, ${expr});`;
  }
  return `if (${expr} != null) stmt.${entry.setter}(${index}, ${expr}); else stmt.setNull(${index}, java.sql.Types.${entry.sqlType});`;
}

const PG_BULK_TYPE_MAP: Record<string, string> = {
  // information_schema.data_type names (uppercased)
  SMALLINT: "INT2",
  INTEGER: "INT4",
  BIGINT: "INT8",
  REAL: "FLOAT4",
  "DOUBLE PRECISION": "FLOAT8",
  BOOLEAN: "BOOLEAN",
  TEXT: "TEXT",
  "CHARACTER VARYING": "TEXT",
  CHARACTER: "TEXT",
  NUMERIC: "NUMERIC",
  DECIMAL: "NUMERIC",
  DATE: "DATE",
  "TIME WITHOUT TIME ZONE": "TIME",
  "TIMESTAMP WITHOUT TIME ZONE": "TIMESTAMP",
  "TIMESTAMP WITH TIME ZONE": "TIMESTAMPTZ",
  UUID: "UUID",
  BYTEA: "BYTEA",
  JSONB: "JSONB",
  JSON: "JSONB",
  // pg-types builtin names
  INT2: "INT2",
  INT4: "INT4",
  INT8: "INT8",
  FLOAT4: "FLOAT4",
  FLOAT8: "FLOAT8",
  BOOL: "BOOLEAN",
  VARCHAR: "TEXT",
  TIMESTAMP: "TIMESTAMP",
  TIMESTAMPTZ: "TIMESTAMPTZ",
};

function pgBulkInsertType(sqlType: string): string {
  // Handle PostgreSQL array types (e.g., _INT4 → array(INT4), _TEXT → array(TEXT))
  if (sqlType.startsWith("_")) {
    const baseType = sqlType.substring(1);
    const mapped = PG_BULK_TYPE_MAP[baseType] || "TEXT";
    return `array(PgBulkInsert.PostgresTypes.${mapped})`;
  }
  return PG_BULK_TYPE_MAP[sqlType] || "TEXT";
}

// PgBulkInsert uses different accessor methods for some types
// (e.g., TIMESTAMPTZ needs .offsetDateTime() instead of .from())
function pgBulkInsertAccessor(sqlType: string): string {
  if (sqlType === "TIMESTAMPTZ") return "offsetDateTime";
  return "from";
}
