import { readFileSync, writeFileSync } from "node:fs";
import consola from "consola";
import { camelCase, pascalCase } from "es-toolkit/string";
import Handlebars from "handlebars";
import prettier from "prettier/standalone";
import prettierPluginJava from "prettier-plugin-java";
import type { ColumnInfo, SQLQuery } from "../sql-query.js";
import type { GeneratorConfig, SqlQueryHelper, SqlQueryPart } from "../sqltool.js";
import { JavaTypeMapper } from "../type-mapping.js";
import { BaseGenerator } from "./base-generator.js";

export class JavaGenerator extends BaseGenerator {
  constructor(public template: string) {
    super(template, new JavaTypeMapper());
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
