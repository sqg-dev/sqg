import { readFileSync } from "node:fs";
import type { SyntaxNode } from "@lezer/common";
import consola from "consola";
import { parser } from "./parser/sql-parser.js";
import { Config, type ExtraVariable } from "./sqltool.js";

export interface ColumnInfo {
  name: string;
  type: ColumnType;
  nullable: boolean;
}

export type ColumnType = string | IsColumnType;

export interface IsColumnType {
  toString(): string;
}

export class ColumnTypeList implements IsColumnType {
  constructor(public baseType: ColumnType) {}

  toString(): string {
    return `${this.baseType.toString()}[]`;
  }
}

export class ColumnTypeStruct implements IsColumnType {
  constructor(public fields: ColumnInfo[]) {}

  toString(): string {
    return `STRUCT(${this.fields.map((f) => `"${f.name}" ${f.type.toString()}`).join(", ")})`;
  }
}
export class ColumnMapType implements IsColumnType {
  constructor(
    public keyType: ColumnInfo,
    public valueType: ColumnInfo,
  ) {}

  toString(): string {
    return `MAP(${this.keyType.toString()}, ${this.valueType.toString()})`;
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

export class SQLQuery {
  columns: ColumnInfo[];

  allColumns!: ColumnInfo;

  constructor(
    public filename: string,
    public id: string,
    public rawQuery: string,

    public queryAnonymous: SqlQueryStatement,
    public queryNamed: SqlQueryStatement,
    public queryPositional: SqlQueryStatement,

    public type: "EXEC" | "QUERY" | "MIGRATE" | "TESTDATA",
    public isOne: boolean,
    public isPluck: boolean,
    public variables: Map<string, string>,
    public config: Config | null,
  ) {
    this.columns = [];
  }

  get isQuery(): boolean {
    return this.type === "QUERY";
  }

  get isExec(): boolean {
    return this.type === "EXEC";
  }

  get isMigrate(): boolean {
    return this.type === "MIGRATE";
  }

  get isTestdata(): boolean {
    return this.type === "TESTDATA";
  }

  get skipGenerateFunction(): boolean {
    return this.isTestdata || this.isMigrate || this.id.startsWith("_");
  }

  validateVariables(): string[] {
    const missingVars: string[] = [];
    const varRegex = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    let match: RegExpExecArray | null;

    while (true) {
      match = varRegex.exec(this.rawQuery);
      if (match === null) break;
      const varName = match[1];
      if (!this.variables.has(varName)) {
        missingVars.push(varName);
      }
    }

    return missingVars;
  }
}

export function parseSQLQueries(filePath: string, extraVariables: ExtraVariable[]): SQLQuery[] {
  const content = readFileSync(filePath, "utf-8");
  consola.info(`Parsing SQL file: ${filePath}`);
  consola.debug(`File start: ${content.slice(0, 200)}`);
  const queries: SQLQuery[] = [];

  const tree = parser.parse(content);
  const cursor = tree.cursor();
  function getStr(nodeName: string, optional: true): string | undefined;
  function getStr(nodeName: string, optional?: false): string;

  function getStr(nodeName: string, optional = false): string | undefined {
    const node = cursor.node.getChild(nodeName);
    if (!node) {
      if (optional) {
        return undefined;
      }
      throw new Error(`${nodeName} not found`);
    }
    return nodeStr(node);
  }

  function nodeStr(node: SyntaxNode): string {
    return content.slice(node.from, node.to);
  }

  const queryNames = new Set<string>();

  do {
    if (cursor.name === "QueryBlock") {
      const queryTypeRaw =
        getStr("LineCommentStartSpecial", true) ?? getStr("BlockCommentStartSpecial");
      const queryType = queryTypeRaw.replace("--", "").replace("/*", "").trim();
      const name = getStr("Name").trim();
      const modifiers = cursor.node.getChildren("Modifiers").map((node) => nodeStr(node));
      const isOne = modifiers.includes(":one");
      const isPluck = modifiers.includes(":pluck");

      let configStr = getStr("Config", true);
      if (configStr?.endsWith("*/")) {
        configStr = configStr.slice(0, -"*/".length);
      }
      let config: Config | null = null;

      if (configStr) {
        config = Config.fromYaml(name, filePath, configStr);
      }

      const setVars = cursor.node.getChildren("SetVarLine");
      const variables = new Map<string, string>();

      for (const setVar of setVars) {
        const varName = nodeStr(setVar.getChild("Name")!);
        const value = nodeStr(setVar.getChild("Value")!);
        variables.set(varName, value.trim());
      }

      function getVariable(varName: string): string {
        if (variables.has(varName)) {
          return variables.get(varName)!;
        }
        for (const extraVariable of extraVariables) {
          if (extraVariable.name === varName) {
            // add the sources variables only when needed (used in the query)
            variables.set(varName, extraVariable.value);
            return extraVariable.value;
          }
        }
        throw error(`Variable '${varName}' not found`);
      }

      const sqlNode = cursor.node.getChild("SQLBlock");
      if (!sqlNode) {
        throw new Error(`'SQLBlock' not found`);
      }
      const sqlContentStr = nodeStr(sqlNode).trim();

      const sqlCursor = sqlNode.cursor();
      let from = -1;
      let to = -1;

      function error(message: string) {
        return new Error(`${message} in ${filePath} query '${name}': ${message}`);
      }

      class SQLQueryBuilder {
        sqlParts: SqlQueryPart[] = [];

        appendSql(sql: string) {
          this.sqlParts.push(sql);
        }

        appendVariable(varName: string, value: string) {
          this.sqlParts.push({ name: varName, value: value });
        }

        trim() {
          const lastPart =
            this.sqlParts.length > 0 ? this.sqlParts[this.sqlParts.length - 1] : null;
          if (lastPart && typeof lastPart === "string") {
            this.sqlParts[this.sqlParts.length - 1] = lastPart.trimEnd();
          }
        }

        parameters() {
          return this.sqlParts.filter(
            (part) => typeof part !== "string" && !part.name.startsWith("sources_"),
          ) as ParameterEntry[];
        }

        toSqlWithAnonymousPlaceholders() {
          let sql = "";
          const sqlParts: SqlQueryPart[] = [];
          for (const part of this.sqlParts) {
            if (typeof part === "string") {
              sql += part;
              sqlParts.push(part);
            } else {
              if (sql.length > 0) {
                const last = sql[sql.length - 1];
                if (last !== " " && last !== "=" && last !== ">" && last !== "<") {
                  sql += " ";
                }
              }
              sql += "?";
              if (part.name.startsWith("sources_")) {
                sqlParts.push(part);
              } else {
                sqlParts.push("?");
              }
            }
          }
          return {
            parameters: this.parameters(),
            sql: sql,
            sqlParts: sqlParts,
          };
        }

        toSqlWithPositionalPlaceholders() {
          const parameters: ParameterEntry[] = [];

          return {
            parameters,
            sqlParts: [], // TODO
            sql: this.sqlParts
              .map((part) => {
                if (typeof part === "string") {
                  return part;
                }
                const varName = part.name;
                const value = part.value;
                let pos = parameters.findIndex((p) => p.name === varName);
                if (pos < 0) {
                  parameters.push({ name: varName, value: value });
                  pos = parameters.length - 1;
                }
                return ` $${pos + 1} `;
              })
              .join("")
              .trim(),
          };
        }

        toSqlWithNamedPlaceholders() {
          return {
            parameters: this.parameters(),
            sqlParts: [], // TODO
            sql: this.sqlParts
              .map((part) => {
                if (typeof part === "string") {
                  return part;
                }
                return `$${part.name}`;
              })
              .join("")
              .trim(),
          };
        }
      }

      const sql = new SQLQueryBuilder();

      if (sqlCursor.firstChild()) {
        do {
          const child = sqlCursor.node;
          if (child.name === "BlockComment" || child.name === "LineComment") {
            if (to > from) {
              sql.appendSql(content.slice(from, to));
            }
            from = child.to;
            sql.appendSql(" ");
            continue;
          }
          if (child.name === "VarRef") {
            const varRef = nodeStr(child);
            if (!varRef.startsWith("${") || !varRef.endsWith("}")) {
              throw error(`Invalid variable reference: ${varRef}`);
            }
            const varName = varRef.replace("${", "").replace("}", "");
            const value = getVariable(varName);

            if (to > from) {
              sql.appendSql(content.slice(from, to));
            }
            from = child.to;
            sql.appendVariable(varName, value);
          } else {
            if (from < 0) {
              from = child.from;
            }
            to = child.to;
          }
        } while (sqlCursor.nextSibling());
        if (to > from) {
          sql.appendSql(content.slice(from, to));
        }
        sql.trim();
      }
      consola.debug("Parsed query:", {
        type: queryType,
        name: name,
        modifiers,
        variables: Object.fromEntries(variables),
        sqlContent: sqlContentStr,
        sql: sql,
        config: config,
      });

      const query = new SQLQuery(
        filePath,
        name,
        sqlContentStr,
        sql.toSqlWithAnonymousPlaceholders(),
        sql.toSqlWithNamedPlaceholders(),
        sql.toSqlWithPositionalPlaceholders(),
        queryType as "EXEC" | "QUERY" | "MIGRATE" | "TESTDATA",
        isOne,
        isPluck,
        variables,
        config,
      );

      if (queryNames.has(name)) {
        throw new Error(`Duplicate query name in ${filePath}: ${name}`);
      }
      queryNames.add(name);

      queries.push(query);

      consola.debug(`Added query: ${name} (${queryType})`);
    }
  } while (cursor.next());

  consola.info(`Total queries parsed: ${queries.length}`);
  consola.info(`Query names: ${queries.map((q) => q.id).join(", ")}`);

  return queries;
}
