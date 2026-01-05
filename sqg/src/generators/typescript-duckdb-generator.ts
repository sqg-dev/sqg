import Handlebars from "handlebars";
import {
  type ColumnInfo,
  ColumnMapType,
  ColumnTypeEnum,
  ColumnTypeList,
  ColumnTypeStruct,
  type SQLQuery,
} from "../sql-query.js";
import type { GeneratorConfig } from "../sqltool.js";
import { TsGenerator } from "./typescript-generator.js";

/**
 * TypeScript generator for DuckDB.
 * DuckDB's Node API returns complex types as wrapper objects:
 * - Lists as { items: T[] }
 * - Structs as { entries: { field1: T1, ... } }
 * - Maps as { entries: { key: K, value: V }[] }
 */
export class TsDuckDBGenerator extends TsGenerator {
  constructor(template: string) {
    super(template);
  }

  async beforeGenerate(
    projectDir: string,
    gen: GeneratorConfig,
    queries: SQLQuery[],
  ): Promise<void> {
    // Call parent to register quote helper
    await super.beforeGenerate(projectDir, gen, queries);

    // Override tsType helper with DuckDB-specific wrapper types
    Handlebars.registerHelper("tsType", (column: ColumnInfo) => {
      const inlineType = (col: ColumnInfo): string => {
        const t = col.type;

        const withNullability = (base: string) => {
          if (!col.nullable) return base;
          if (/\bnull\b/.test(base)) return base;
          return `${base} | null`;
        };

        if (t instanceof ColumnTypeList) {
          // DuckDB returns arrays as { items: T[] }
          const element = inlineType({ name: col.name, type: t.baseType, nullable: true });
          const elementWrapped = element.includes(" | ") ? `(${element})` : element;
          return withNullability(`{ items: ${elementWrapped}[] }`);
        }

        if (t instanceof ColumnMapType) {
          // DuckDB returns maps as { entries: { key: K, value: V }[] }
          const key = inlineType({ name: "key", type: t.keyType.type, nullable: true });
          const value = inlineType({ name: "value", type: t.valueType.type, nullable: true });
          return withNullability(`{ entries: { key: ${key}; value: ${value} }[] }`);
        }

        if (t instanceof ColumnTypeStruct) {
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

        if (t instanceof ColumnTypeEnum) {
          const unionType = t.values.map((v) => JSON.stringify(v)).join(" | ");
          return withNullability(unionType);
        }

        return this.typeMapper.getTypeName(col);
      };

      return inlineType(column);
    });
  }
}
