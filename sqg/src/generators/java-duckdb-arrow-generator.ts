import consola from "consola";
import { ListType, MapType, StructType, type ColumnInfo, type ColumnType, type SQLQuery, type TableInfo } from "../sql-query.js";
import { type GeneratorConfig, writeGeneratedFile } from "../sqltool.js";
import { JavaTypeMapper } from "../type-mapping.js";
import { BaseGenerator } from "./base-generator.js";
import { JavaGenerator } from "./java-generator.js";
import type { Generator } from "./types.js";
import { DbEngine } from "../constants.js";

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
    writeGeneratedFile(
      projectDir,
      {
        name,
        generator: "java/jdbc",
        output: gen.output,
        config: gen.config,
      },
      this.javaGenerator,
      name,
      q,
      tables,
      "duckdb",
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
    return this.getClassName(`${query.id}_Result`);
  }
}
