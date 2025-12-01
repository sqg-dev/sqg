import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import consola from "consola";
import Handlebars from "handlebars";
import YAML from "yaml";
import { z } from "zod";
import { getDatabaseEngine } from "./database.js";
import { type Generator, getGenerator } from "./generator.js";
import type { ColumnInfo, SQLQuery } from "./sql-query.js";
import { ColumnTypeStruct, parseSQLQueries } from "./sql-query.js";
import type { TypeMapper } from "./type-mapping.js";

const configSchema = z.object({
  result: z.record(z.string(), z.string()).optional(),
});

export class Config {
  constructor(public result: Map<string, ColumnInfo>) {}

  getColumnInfo(name: string): ColumnInfo | undefined {
    return this.result.get(name);
  }

  static fromYaml(name: string, filePath: string, configStr: string): Config {
    //consola.info("Config:", config);
    let configObj: unknown;
    try {
      configObj = YAML.parse(configStr);
      //consola.info("Config object:", configObj);
    } catch (e) {
      throw new Error(
        `Error parsing YAML config for query ${name} in ${filePath}: \n${configStr}\n ${e}`,
      );
    }
    const result = configSchema.safeParse(configObj);
    if (!result.success) {
      throw new Error(
        `Error parsing config for query ${name} in ${filePath}: \n${configStr}\n ${result.error}`,
      );
    }

    const columnMap = new Map<string, ColumnInfo>();
    for (const [name, info] of Object.entries(result.data.result ?? {})) {
      const parts = info
        .trim()
        .split(" ")
        .map((part) => part.trim());
      let type: string;
      let nullable = true;
      if (parts.length === 1) {
        type = parts[0];
      } else if (parts.length === 2) {
        type = parts[0];
        if (parts[1].toLocaleLowerCase() !== "null") {
          throw new Error(
            `Invalid config for column ${name} in ${filePath}: \n${configStr}\n ${info}`,
          );
        }
        nullable = true;
      } else if (parts.length === 3) {
        type = parts[0];
        if (parts[1].toLocaleLowerCase() !== "not" || parts[2].toLocaleLowerCase() !== "null") {
          throw new Error(
            `Invalid config for column ${name} in ${filePath}: \n${configStr}\n ${info}`,
          );
        }
        nullable = false;
      } else {
        throw new Error(
          `Invalid config for column ${name} in ${filePath}: \n${configStr}\n ${info}`,
        );
      }
      columnMap.set(name, {
        name,
        type,
        nullable,
      });
    }
    return new Config(columnMap);
  }
}

export type ParameterEntry = {
  name: string;
  value: string;
};

export type SqlQueryPart = string | ParameterEntry;

export type SqlQueryStatement = {
  sql: string; // for backwards compatibility, use sqlParts instead

  sqlParts: SqlQueryPart[];

  parameters: ParameterEntry[];
};

/** Util class to help generating a query with a given generator */
export class SqlQueryHelper {
  constructor(
    public query: SQLQuery,
    public generator: Generator,
    public statement: SqlQueryStatement,
  ) {}

  get id(): string {
    return this.query.id;
  }

  get isQuery(): boolean {
    return this.query.isQuery;
  }

  get isExec(): boolean {
    return this.query.isExec;
  }

  get isMigrate(): boolean {
    return this.query.isMigrate;
  }

  get isPluck(): boolean {
    return this.query.isPluck;
  }

  get isOne(): boolean {
    return this.query.isOne;
  }

  get parameterNames(): string[] {
    return this.statement.parameters.map((param) => param.name);
  }

  get skipGenerateFunction(): boolean {
    return this.query.skipGenerateFunction;
  }

  get parameters(): { name: string; type: string }[] {
    const vars = new Map(this.variables.map((param) => [param.name, param.type]));
    return this.statement.parameters.map((param) => ({
      name: param.name,
      type: vars.get(param.name)!,
    }));
  }

  get columns(): ColumnInfo[] {
    if (!(this.query.allColumns.type instanceof ColumnTypeStruct)) {
      throw new Error(`Expected ColumnTypeStruct ${this.query.allColumns.type}`);
    }
    return (this.query.allColumns.type as ColumnTypeStruct).fields;
  }

  get variables(): { name: string; type: string }[] {
    return Array.from(this.query.variables.entries()).map(([name, value]) => ({
      name,
      type: this.generator.mapParameterType(detectParameterType(value), false),
    }));
  }

  get sqlQuery(): string {
    return this.statement.sql;
  }

  get sqlQueryParts(): SqlQueryPart[] {
    return this.statement.sqlParts;
  }

  private get rowTypeStr(): string {
    return this.generator.rowType(this.query);
  }

  get functionReturnType(): string | Handlebars.SafeString {
    return new Handlebars.SafeString(this.generator.functionReturnType(this.query));
  }

  get rowType(): Handlebars.SafeString {
    return new Handlebars.SafeString(this.rowTypeStr);
  }

  get functionName(): string {
    return this.generator.getFunctionName(this.query.id);
  }

  get typeMapper(): TypeMapper {
    return this.generator.typeMapper;
  }
}

function generateSourceFile(
  name: string,
  queries: SQLQuery[],
  templatePath: string,
  generator: Generator,
  config?: any,
): string {
  const templateSrc = readFileSync(templatePath, "utf-8");

  const template = Handlebars.compile(templateSrc);
  Handlebars.registerHelper("mapType", (column: ColumnInfo) => generator.mapType(column));
  Handlebars.registerHelper("plusOne", (value: number) => value + 1);

  const migrations = queries
    .filter((q) => q.isMigrate)
    .map((q) => new SqlQueryHelper(q, generator, generator.getStatement(q)));
  const result = template(
    {
      migrations,
      queries: queries.map((q) => new SqlQueryHelper(q, generator, generator.getStatement(q))),
      className: generator.getClassName(name),
      config,
    },
    {
      allowProtoPropertiesByDefault: true,
      allowProtoMethodsByDefault: true,
    },
  );

  return result;
}

const ProjectSchema = z.object({
  version: z.number(),
  name: z.string(),
  sql: z.array(
    z.object({
      engine: z.string(),
      files: z.array(z.string()),
      gen: z.array(
        z.object({
          generator: z.string(),
          name: z.string().optional(),
          template: z.string().optional(),
          output: z.string(),
          config: z.any().optional(),
        }),
      ),
    }),
  ),
  sources: z
    .array(
      z.object({
        path: z.string(),
        name: z.string().optional(),
      }),
    )
    .optional(),
});

type Project = z.infer<typeof ProjectSchema>;
type Source = NonNullable<z.infer<typeof ProjectSchema.shape.sources>>[number];

export class ExtraVariable {
  constructor(
    public name: string,
    public value: string,
  ) {}
}

export function createExtraVariables(sources: Source[]): ExtraVariable[] {
  return sources.map((source) => {
    const path = source.path;
    const resolvedPath = path.replace("$HOME", homedir());
    const name = source.name ?? basename(path, extname(resolvedPath));
    const varName = `sources_${name.replace(/\s+/g, "_")}`;
    consola.info("Extra variable:", varName, resolvedPath);
    return new ExtraVariable(varName, `'${resolvedPath}'`);
  });
}

export function parseProjectConfig(filePath: string): Project {
  const content = readFileSync(filePath, "utf-8");
  const result = ProjectSchema.safeParse(YAML.parse(content));
  if (!result.success) {
    const prettyError = z.prettifyError(result.error);
    throw new Error(`Error parsing project file ${filePath}:\n${prettyError}`);
  }
  return result.data;
}

function detectParameterType(value: string): string {
  const num = Number(value);
  if (!Number.isNaN(num)) {
    if (Number.isInteger(num)) {
      return "INTEGER";
    }
    return "REAL";
  }
  if (value.toLowerCase() === "true" || value.toLowerCase() === "false") {
    return "BOOLEAN";
  }
  return "TEXT";
}

export interface GeneratorConfig {
  generator: string;
  output: string;
  template?: string;
  config?: any;
  name?: string;
}

export function getOutputPath(
  projectDir: string,
  sqlFileName: string,
  gen: { generator: string; output: string },
  generator: Generator,
) {
  const pathParts: string[] = [];
  if (!gen.output.startsWith("/")) {
    pathParts.push(projectDir);
  }
  if (gen.output.endsWith("/")) {
    const name = generator.getFilename(sqlFileName);
    pathParts.push(gen.output, name);
  } else {
    pathParts.push(gen.output);
  }
  const outputPath = join(...pathParts);
  mkdirSync(dirname(outputPath), { recursive: true });
  return outputPath;
}

export function validateQueries(queries: SQLQuery[]) {
  for (const query of queries) {
    if (query.isQuery && query.isPluck && query.columns.length !== 1) {
      throw new Error(
        `Query ${query.id} in ${query.filename} has the ':pluck: option, must have exactly one column, but has ${query.columns.length} columns`,
      );
    }
    const columns = query.columns.map((col) => {
      const configColumn = query.config?.getColumnInfo(col.name);
      if (configColumn) {
        return configColumn;
      }
      return col;
    });
    query.allColumns = {
      name: query.id,
      nullable: false,
      type: new ColumnTypeStruct(columns),
    };
  }
}

export async function writeGeneratedFile(
  projectDir: string,
  gen: GeneratorConfig,
  generator: Generator,
  file: string,
  queries: SQLQuery[],
) {
  await generator.beforeGenerate(projectDir, gen, queries);
  const templateDir = dirname(new URL(import.meta.url).pathname);
  const templatePath = join(templateDir, gen.template ?? generator.template);
  const name = gen.name ?? basename(file, extname(file));
  const sourceFile = generateSourceFile(name, queries, templatePath, generator, gen.config);
  const outputPath = getOutputPath(projectDir, name, gen, generator);
  writeFileSync(outputPath, sourceFile);
  consola.success(`Generated ${outputPath}`);
  await generator.afterGenerate(outputPath);
  return outputPath;
}

export async function processProject(projectPath: string) {
  const projectDir = resolve(dirname(projectPath));
  const project = parseProjectConfig(projectPath);

  const extraVariables = createExtraVariables(project.sources ?? []);
  if (extraVariables.length > 0) {
    consola.info("Extra variables:", extraVariables);
  }

  const files = [] as string[];

  for (const sql of project.sql) {
    for (const sqlFile of sql.files) {
      let queries: SQLQuery[];
      try {
        queries = parseSQLQueries(join(projectDir, sqlFile), extraVariables);
        const dbEngine = getDatabaseEngine(sql.engine);
        await dbEngine.initializeDatabase(queries);
        await dbEngine.executeQueries(queries);

        validateQueries(queries);
        await dbEngine.close();
      } catch (e) {
        consola.error(`Error processing SQL file ${sqlFile}: ${e}`);
        throw e;
      }

      for (const gen of sql.gen) {
        const generator = getGenerator(gen.generator);
        if (!generator.isCompatibleWith(sql.engine)) {
          throw new Error(
            `File ${sqlFile}: Generator ${gen.generator} is not compatible with engine ${sql.engine}`,
          );
        }
        const outputPath = await writeGeneratedFile(projectDir, gen, generator, sqlFile, queries);
        files.push(outputPath);
      }
    }
  }
  return files;
}
