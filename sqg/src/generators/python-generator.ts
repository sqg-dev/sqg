import { execSync } from "node:child_process";
import consola from "consola";
import { pascalCase, snakeCase } from "es-toolkit/string";
import Handlebars from "handlebars";
import type { DbEngine } from "../constants.js";
import {
  type ColumnInfo,
  ListType,
  MapType,
  type SQLQuery,
  StructType,
  type TableInfo,
} from "../sql-query.js";
import type { GeneratorConfig, SqlQueryHelper, SqlQueryStatement } from "../sqltool.js";
import { PythonTypeMapper } from "../type-mapping.js";
import { BaseGenerator } from "./base-generator.js";

export class PythonGenerator extends BaseGenerator {
  private engine: "sqlite" | "duckdb" | "postgres";

  constructor(template: string, engine: "sqlite" | "duckdb" | "postgres") {
    super(template, new PythonTypeMapper());
    this.engine = engine;
  }

  get isDuckDB(): boolean {
    return this.engine === "duckdb";
  }

  get isPostgres(): boolean {
    return this.engine === "postgres";
  }

  getFunctionName(id: string): string {
    return snakeCase(id);
  }

  getFilename(sqlFileName: string): string {
    return `${snakeCase(sqlFileName)}.py`;
  }

  getClassName(name: string): string {
    return pascalCase(name);
  }

  override rowType(query: SQLQuery): string {
    if (query.isPluck) {
      return this.mapType({ ...query.columns[0], name: query.id });
    }
    return this.getClassName(`${query.id}_row`);
  }

  override getStatement(q: SQLQuery): SqlQueryStatement {
    if (this.isDuckDB) return q.queryPositional;
    if (this.isPostgres) {
      // psycopg3 uses %s placeholders — transform from anonymous ? placeholders
      const anon = q.queryAnonymous;
      return {
        ...anon,
        sql: anon.sql.replace(/\?/g, "%s"),
      };
    }
    return q.queryAnonymous;
  }

  override supportsAppenders(_engine: DbEngine): boolean {
    return this.engine === "duckdb" || this.engine === "postgres";
  }

  async beforeGenerate(
    _projectDir: string,
    _gen: GeneratorConfig,
    _queries: SQLQuery[],
    _tables: TableInfo[],
  ): Promise<void> {
    const pyMapper = this.typeMapper as PythonTypeMapper;

    // Register engine helpers as context variables
    Handlebars.registerHelper("isDuckDB", () => this.isDuckDB);
    Handlebars.registerHelper("isPostgres", () => this.isPostgres);

    // Connection type helper
    Handlebars.registerHelper("connType", () => {
      if (this.isDuckDB) return "duckdb.DuckDBPyConnection";
      if (this.isPostgres) return "psycopg.Connection";
      return "sqlite3.Connection";
    });

    // Quote helper: triple-quote for multiline, single-quote otherwise
    Handlebars.registerHelper("quote", (value: string) => {
      if (value.includes("\n") || value.includes("'") || value.includes('"')) {
        return `"""\\\n${value}"""`;
      }
      return `"${value}"`;
    });

    // Python type annotation from column
    Handlebars.registerHelper("pyType", (column: ColumnInfo) => {
      return this.getPyType(column);
    });

    // Declare dataclass types for a query
    Handlebars.registerHelper("declareTypes", (queryHelper: SqlQueryHelper) => {
      const query = queryHelper.query;
      if (queryHelper.isPluck) {
        return "";
      }
      const columns = queryHelper.columns;
      const rowTypeName = this.getClassName(`${query.id}_row`);

      // Collect nested struct declarations
      const nestedDecls: string[] = [];
      for (const col of columns) {
        const decl = this.typeMapper.getDeclarations(col);
        if (decl) {
          nestedDecls.push(decl);
        }
      }

      const fields = columns
        .map((col) => {
          const pyType = this.getPyType(col);
          return `    ${pyMapper.varName(col.name)}: ${pyType}`;
        })
        .join("\n");

      let result = "";
      if (nestedDecls.length > 0) {
        result += `${nestedDecls.join("\n\n")}\n\n`;
      }
      result += `@dataclass(frozen=True)\nclass ${rowTypeName}:\n${fields}`;
      return new Handlebars.SafeString(result);
    });

    // Construct row from tuple
    Handlebars.registerHelper("constructRow", (queryHelper: SqlQueryHelper) => {
      const query = queryHelper.query;
      const columns = queryHelper.columns;
      const rowTypeName = this.getClassName(`${query.id}_row`);

      const assignments = columns
        .map((col, i) => {
          const pyName = pyMapper.varName(col.name);
          const value = `row[${i}]`;
          const parsed = this.typeMapper.parseValue(col, value, "");
          return `${pyName}=${parsed}`;
        })
        .join(", ");

      return `${rowTypeName}(${assignments})`;
    });

    // Python type that's always nullable (deduplicates | None)
    Handlebars.registerHelper("pyTypeOrNone", (column: ColumnInfo) => {
      const t = this.getPyType(column);
      if (t.endsWith(" | None")) return t;
      return `${t} | None`;
    });

    // Variable name helper for Python reserved words
    Handlebars.registerHelper("pyVarName", (name: string) => {
      return pyMapper.varName(name);
    });

    // Check if any query column type contains a substring (for conditional imports)
    Handlebars.registerHelper("needsDatetime", (queries: SqlQueryHelper[]) =>
      this.queryColumnsContainType(queries, "datetime."),
    );
    Handlebars.registerHelper("needsDecimal", (queries: SqlQueryHelper[]) =>
      this.queryColumnsContainType(queries, "Decimal"),
    );
  }

  private queryColumnsContainType(queries: SqlQueryHelper[], substring: string): boolean {
    for (const qh of queries) {
      if (!qh.isQuery || qh.skipGenerateFunction) continue;
      for (const col of qh.columns) {
        if (this.getPyType(col).includes(substring)) return true;
      }
    }
    return false;
  }

  private getPyType(column: ColumnInfo): string {
    const t = column.type;

    if (t instanceof ListType) {
      const elementType = this.getPyType({
        name: column.name,
        type: t.baseType,
        nullable: true,
      });
      const base = `list[${elementType}]`;
      return column.nullable ? `${base} | None` : base;
    }

    if (t instanceof MapType) {
      const keyType = this.getPyType({
        name: "key",
        type: t.keyType.type,
        nullable: false,
      });
      const valueType = this.getPyType({
        name: "value",
        type: t.valueType.type,
        nullable: true,
      });
      const base = `dict[${keyType}, ${valueType}]`;
      return column.nullable ? `${base} | None` : base;
    }

    if (t instanceof StructType) {
      const structName = `${pascalCase(column.name)}Struct`;
      return column.nullable ? `${structName} | None` : structName;
    }

    return this.typeMapper.getTypeName(column);
  }

  async afterGenerate(outputPath: string): Promise<void> {
    try {
      execSync(`ruff format "${outputPath}"`, { stdio: "ignore" });
    } catch {
      // ruff not available, skip formatting silently
      consola.debug("ruff not available, skipping format for:", outputPath);
    }
  }
}
