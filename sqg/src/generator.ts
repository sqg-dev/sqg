import { readFileSync, writeFileSync } from "node:fs";
import consola from "consola";
import { camelCase, pascalCase } from "es-toolkit/string";
import Handlebars from "handlebars";
import typescriptPlugin from "prettier/parser-typescript";
import estree from "prettier/plugins/estree";
import prettier from "prettier/standalone";
import prettierPluginJava from "prettier-plugin-java";
import {
  ColumnMapType,
  ColumnTypeList,
  ColumnTypeStruct,
  type ColumnInfo,
  type ColumnType,
  type SQLQuery,
} from "./sql-query.js";
import {
  type GeneratorConfig,
  type SqlQueryHelper,
  type SqlQueryPart,
  type SqlQueryStatement,
  writeGeneratedFile,
} from "./sqltool";
import { JavaTypeMapper, type TypeMapper, TypeScriptTypeMapper } from "./type-mapping.js";

export interface Generator {
  getStatement(q: SQLQuery): SqlQueryStatement;
  getFunctionName(id: string): string;
  rowType(query: SQLQuery): string;
  isCompatibleWith(engine: string): boolean;
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
  beforeGenerate(projectDir: string, gen: GeneratorConfig, queries: SQLQuery[]): Promise<void>;
  typeMapper: TypeMapper;
}

abstract class BaseGenerator implements Generator {
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
      consola.info("Formatting file:", outputPath);
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

class JavaDuckDBArrowGenerator extends BaseGenerator {
  private javaGenerator: Generator;
  constructor(public template: string) {
    super(template, new JavaTypeMapper());
    this.javaGenerator = getGenerator("java/jdbc");
  }
  getFunctionName(id: string): string {
    return this.javaGenerator.getFunctionName(id);
  }
  async beforeGenerate(
    projectDir: string,
    gen: GeneratorConfig,
    queries: SQLQuery[],
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
    );
  }

  isCompatibleWith(engine: string): boolean {
    return engine === "duckdb";
  }

  getFilename(sqlFileName: string) {
    return this.javaGenerator.getFilename(sqlFileName);
  }

  getClassName(name: string) {
    return this.javaGenerator.getClassName(name);
  }

  mapType(column: ColumnInfo): string {
    const { type, nullable } = column;
    // For DuckDB Arrow, we need special vector types
    if (typeof type === "string") {
      const typeMap: { [key: string]: string } = {
        INTEGER: "IntVector",
        BOOLEAN: "BitVector",
        DOUBLE: "Float8Vector",
        FLOAT: "Float4Vector",
        VARCHAR: "VarCharVector",
        TEXT: "VarCharVector",
      };
      const mappedType = typeMap[type.toUpperCase()];
      if (!mappedType) {
        consola.warn("(duckdb-arrow) Mapped type is unknown:", type);
      }
      return mappedType ?? "Object";
    }
    // For complex types, fall back to base TypeMapper
    const mockColumn = { name: "", type, nullable };
    return this.typeMapper.getTypeName(mockColumn);
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

class TsGenerator extends BaseGenerator {
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
      consola.info("Formatting file:", outputPath);
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

export function getGenerator(generator: string): Generator {
  switch (generator) {
    case "java/jdbc":
      return new JavaGenerator("templates/java-jdbc.hbs");
    case "java/duckdb-arrow":
      return new JavaDuckDBArrowGenerator("templates/java-duckdb-arrow.hbs");
    case "typescript/better-sqlite3":
      return new TsGenerator("templates/better-sqlite3.hbs");
    case "typescript/duckdb":
      return new TsGenerator("templates/typescript-duckdb.hbs");
    default:
      throw new Error(`Unsupported generator: ${generator}`);
  }
}
