import { readFileSync, writeFileSync } from "node:fs";
import consola from "consola";
import { camelCase, pascalCase } from "es-toolkit/string";
import Handlebars from "handlebars";
import typescriptPlugin from "prettier/parser-typescript";
import estree from "prettier/plugins/estree";
import prettier from "prettier/standalone";
import {
  type ColumnInfo,
  ColumnMapType,
  ColumnTypeList,
  ColumnTypeStruct,
  type SQLQuery,
} from "../sql-query.js";
import type { GeneratorConfig, SqlQueryHelper } from "../sqltool.js";
import { TypeScriptTypeMapper } from "../type-mapping.js";
import { BaseGenerator } from "./base-generator.js";

export class TsGenerator extends BaseGenerator {
  constructor(template: string) {
    super(template, new TypeScriptTypeMapper());
  }

  getFunctionName(id: string): string {
    return camelCase(id);
  }

  isCompatibleWith(_engine: string): boolean {
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
  ): Promise<void> {
    Handlebars.registerHelper("quote", (value: string) => this.quote(value));
    Handlebars.registerHelper("tsType", (column: ColumnInfo) => {
      const inlineType = (col: ColumnInfo): string => {
        const t = col.type;

        const withNullability = (base: string) => {
          if (!col.nullable) return base;
          // Avoid `T | null | null` etc.
          if (/\bnull\b/.test(base)) return base;
          return `${base} | null`;
        };

        if (t instanceof ColumnTypeList) {
          // DuckDB arrays can contain nulls
          const element = inlineType({ name: col.name, type: t.baseType, nullable: true });
          const elementWrapped = element.includes(" | ") ? `(${element})` : element;
          return withNullability(`${elementWrapped}[]`);
        }

        if (t instanceof ColumnMapType) {
          const key = inlineType({ name: "key", type: t.keyType.type, nullable: false });
          const value = inlineType({ name: "value", type: t.valueType.type, nullable: true });
          return withNullability(`Map<${key}, ${value}>`);
        }

        if (t instanceof ColumnTypeStruct) {
          const isValidIdent = (name: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
          const fields = t.fields
            .map((f) => {
              const key = isValidIdent(f.name) ? f.name : JSON.stringify(f.name);
              const valueType = inlineType({ name: f.name, type: f.type, nullable: true });
              return `${key}: ${valueType}`;
            })
            .join(", ");
          return withNullability(`{ ${fields} }`);
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
        if (t instanceof ColumnTypeList) {
          // Lists keep the same "field name" for struct naming
          visit({ name: column.name, type: t.baseType, nullable: true });
          return;
        }
        if (t instanceof ColumnTypeStruct) {
          const typeName = typeMapper.getTypeName(column);
          if (!declarations.has(typeName)) {
            declarations.set(typeName, typeMapper.getDeclarations(column));
          }
          for (const field of t.fields) {
            visit({ name: field.name, type: field.type, nullable: true });
          }
          return;
        }
        if (t instanceof ColumnMapType) {
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
