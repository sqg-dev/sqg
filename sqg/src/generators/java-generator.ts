import { readFileSync, writeFileSync } from "node:fs";
import consola from "consola";
import { camelCase, pascalCase } from "es-toolkit/string";
import Handlebars from "handlebars";
import prettier from "prettier/standalone";
import prettierPluginJava from "prettier-plugin-java";
import type { DbEngine } from "../constants.js";
import type { ColumnInfo, SQLQuery, TableInfo } from "../sql-query.js";
import { EnumType } from "../sql-query.js";
import type { GeneratorConfig, SqlQueryHelper, SqlQueryPart } from "../sqltool.js";
import { JavaTypeMapper } from "../type-mapping.js";
import { BaseGenerator } from "./base-generator.js";

export class JavaGenerator extends BaseGenerator {
  constructor(public template: string) {
    super(template, new JavaTypeMapper());
  }

  override supportsAppenders(engine: DbEngine): boolean {
    return engine === "duckdb";
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
    return this.typeMapper.parseValue(column, `rs.getObject(${index + 1})`, path);
  }

  async beforeGenerate(
    _projectDir: string,
    _gen: GeneratorConfig,
    _queries: SQLQuery[],
    _tables: TableInfo[],
  ): Promise<void> {
    Handlebars.registerHelper("partsToString", (parts: SqlQueryPart[]) =>
      this.partsToString(parts),
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
