import type { ColumnInfo, ColumnType, SQLQuery, TableInfo } from "../sql-query.js";
import type { GeneratorConfig, SqlQueryStatement } from "../sqltool.js";
import type { TypeMapper } from "../type-mapping.js";
import type { Generator } from "./types.js";

export abstract class BaseGenerator implements Generator {
  constructor(
    public template: string,
    public typeMapper: TypeMapper,
  ) {}
  abstract getFilename(sqlFileName: string): string;
  abstract getClassName(name: string): string;
  abstract getFunctionName(id: string): string;

  mapType(column: ColumnInfo): string {
    return this.typeMapper.getTypeName(column);
  }

  mapParameterType(type: ColumnType, nullable: boolean): string {
    return this.mapType({ name: "", type, nullable });
  }

  listType(column: ColumnInfo): string {
    return this.typeMapper.listType(column);
  }
  abstract afterGenerate(outputPath: string): Promise<void>;
  async beforeGenerate(
    _projectDir: string,
    _gen: GeneratorConfig,
    _queries: SQLQuery[],
    _tables: TableInfo[],
  ): Promise<void> {}
  isCompatibleWith(_engine: string): boolean {
    return true;
  }
  functionReturnType(query: SQLQuery): string {
    if (query.isOne) {
      return this.rowType(query);
    }
    return this.typeMapper.formatListType(this.rowType(query));
  }
  rowType(query: SQLQuery): string {
    if (query.isPluck) {
      return this.mapType({ ...query.columns[0], name: query.id });
    }
    return this.getClassName(`${query.id}_Result`);
  }
  getStatement(q: SQLQuery): SqlQueryStatement {
    return q.queryAnonymous;
  }
}
