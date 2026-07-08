import type { DbEngine } from "../constants.js";
import type { ColumnInfo, ColumnType, SQLQuery, TableInfo } from "../sql-query.js";
import type { GeneratorConfig, SqlQueryStatement } from "../sqltool.js";
import type { TypeMapper } from "../type-mapping.js";

/** A support file emitted next to the main generated file. */
export interface AuxiliaryFile {
  filename: string;
  content: string;
}

export interface Generator {
  getStatement(q: SQLQuery): SqlQueryStatement;
  getFunctionName(id: string): string;
  rowType(query: SQLQuery): string;
  isCompatibleWith(engine: DbEngine): boolean;
  supportsAppenders(engine: DbEngine): boolean;
  template: string;
  getFilename(sqlFileName: string): string;
  getClassName(name: string): string;

  mapType(column: ColumnInfo): string;

  /**
   * @param type - the type of the parameter in the SQL file
   * @returns the type of the parameter in the generated code
   */
  mapParameterType(type: ColumnType, nullable: boolean): string;

  /**
   * @param type - the type of the column in the generated code
   * @returns the repeated / list / array type of the column in the generated code
   */
  listType(column: ColumnInfo): string;

  functionReturnType(query: SQLQuery): string;

  /**
   * @param outputPath - the path to the generated file
   */
  afterGenerate(outputPath: string): Promise<void>;

  /**
   * Extra support files to emit alongside the main generated file, into the
   * same output directory (e.g. a shared `SqgObserver.java` interface). Written
   * once per generation; identical content across SQL files is de-duplicated by
   * the caller. Returns an empty list by default.
   */
  auxiliaryFiles(gen: GeneratorConfig): AuxiliaryFile[];
  beforeGenerate(
    projectDir: string,
    gen: GeneratorConfig,
    queries: SQLQuery[],
    tables: TableInfo[],
  ): Promise<void>;
  typeMapper: TypeMapper;
}
