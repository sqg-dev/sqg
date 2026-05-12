import consola from "consola";
import Handlebars from "handlebars";
import type { DbEngine } from "../constants.js";
import {
  type ColumnInfo,
  type ColumnType,
  ListType,
  MapType,
  type SQLQuery,
  StructType,
  type TableInfo,
} from "../sql-query.js";
import { type GeneratorConfig, type SqlQueryHelper, writeGeneratedFile } from "../sqltool.js";
import { JavaTypeMapper } from "../type-mapping.js";
import { BaseGenerator } from "./base-generator.js";
import { JavaGenerator } from "./java-generator.js";
import type { Generator } from "./types.js";

export class JavaDuckDBArrowGenerator extends BaseGenerator {
  private javaGenerator: Generator;

  constructor(public template: string) {
    super(template, new JavaTypeMapper());
    this.javaGenerator = new JavaGenerator("templates/java-jdbc.hbs");
  }
  getFunctionName(id: string): string {
    return this.javaGenerator.getFunctionName(id);
  }
  async beforeGenerate(
    projectDir: string,
    gen: GeneratorConfig,
    queries: SQLQuery[],
    tables: TableInfo[],
  ): Promise<void> {
    const q = queries.filter((q) => (q.isQuery && q.isOne) || q.isMigrate);
    const name = `${gen.name}-jdbc`;
    await writeGeneratedFile(
      projectDir,
      {
        name,
        generator: "java/duckdb/jdbc",
        output: gen.output,
        config: gen.config,
        projectName: gen.projectName,
      },
      this.javaGenerator,
      name,
      q,
      tables,
      "duckdb",
    );

    // The Arrow template emits its own stream-wrapper records for !isOne
    // queries. Re-register shouldDeclareType for this generator so multiple
    // queries that share a `resultTypeName` (via dedup) only emit the record
    // once. The jdbc sub-render above also registered this helper, but its
    // owner set was for the jdbc context — we override it here for ours.
    const owners = new Set<string>();
    const seen = new Set<string>();
    for (const q of queries) {
      if (q.skipGenerateFunction) continue;
      // Arrow emits stream-wrapper records for every !isOne query (including
      // pluck — they wrap a single-column vector stream).
      if (!q.isQuery || q.isOne) continue;
      if (q.columns.length === 0) continue;
      const rowTypeName = this.rowType(q);
      if (seen.has(rowTypeName)) continue;
      seen.add(rowTypeName);
      owners.add(q.id);
    }
    Handlebars.registerHelper("shouldDeclareType", (queryHelper: SqlQueryHelper) =>
      owners.has(queryHelper.id),
    );
  }

  isCompatibleWith(engine: DbEngine): boolean {
    return engine === "duckdb";
  }

  override supportsAppenders(_engine: DbEngine): boolean {
    return true;
  }

  getFilename(sqlFileName: string) {
    return this.javaGenerator.getFilename(sqlFileName);
  }

  getClassName(name: string) {
    return this.javaGenerator.getClassName(name);
  }

  mapType(column: ColumnInfo): string {
    const { type } = column;
    // For DuckDB Arrow, we need special vector types
    if (typeof type === "string") {
      const typeMap: { [key: string]: string } = {
        INTEGER: "IntVector",
        BIGINT: "BigIntVector",
        BOOLEAN: "BitVector",
        DOUBLE: "Float8Vector",
        FLOAT: "Float4Vector",
        VARCHAR: "VarCharVector",
        TEXT: "VarCharVector",
        TIMESTAMP: "TimeStampVector",
        DATE: "DateDayVector",
        TIME: "TimeMicroVector",
      };
      const mappedType = typeMap[type.toUpperCase()];
      if (!mappedType) {
        consola.warn("(duckdb-arrow) Mapped type is unknown:", type);
      }
      return mappedType ?? "Object";
    }
    // For complex types, use Arrow vector types
    if (type instanceof ListType) {
      return "ListVector";
    }
    if (type instanceof StructType) {
      return "StructVector";
    }
    if (type instanceof MapType) {
      return "MapVector";
    }
    consola.warn("(duckdb-arrow) Unknown complex type:", type);
    return "Object";
  }

  mapParameterType(type: ColumnType, nullable: boolean): string {
    return this.typeMapper.getTypeName({ name: "", type, nullable });
  }

  listType(type: ColumnType): string {
    const mockColumn = { name: "", type, nullable: false };
    return this.typeMapper.listType(mockColumn);
  }

  async afterGenerate(outputPath: string): Promise<void> {
    return this.javaGenerator.afterGenerate(outputPath);
  }

  functionReturnType(query: SQLQuery): string {
    if (query.isOne) {
      return this.javaGenerator.rowType(query);
    }
    return this.rowType(query);
  }

  rowType(query: SQLQuery): string {
    if (query.isOne) {
      return this.javaGenerator.rowType(query);
    }
    // !isOne queries (including pluck) get an Arrow stream-wrapper record.
    // Honor `resultTypeName` so deduped queries share the wrapper class name.
    return this.getClassName(query.resultTypeName ?? `${query.id}_Result`);
  }
}
