import { beforeEach, describe, expect, it } from "vitest";
import { JavaGenerator } from "../src/generators/index";
import type { SQLQuery } from "../src/sql-query";
import { ListType, StructType } from "../src/sql-query";
import { SqlQueryHelper, type SqlQueryPart } from "../src/sqltool";

describe("JavaGenerator", () => {
  let generator: JavaGenerator;

  beforeEach(() => {
    generator = new JavaGenerator("test-template");
  });

  describe("mapParameterType", () => {
    it("should delegate to mapType", () => {
      expect(generator.mapParameterType("INTEGER", false)).toMatchInlineSnapshot(`"Integer"`);
      expect(generator.mapParameterType("TEXT", true)).toMatchInlineSnapshot(`"String"`);
    });

    it("should map BIGINT to Long (not Integer)", () => {
      // BIGINT (DuckDB type name)
      expect(generator.mapParameterType("BIGINT", false)).toBe("Long");
      expect(generator.mapParameterType("BIGINT", true)).toBe("Long");

      // INT8 (PostgreSQL type name for BIGINT)
      expect(generator.mapParameterType("INT8", false)).toBe("Long");
      expect(generator.mapParameterType("INT8", true)).toBe("Long");

      // Lowercase variants (as may come from information_schema)
      expect(generator.mapParameterType("bigint", false)).toBe("Long");
      expect(generator.mapParameterType("int8", false)).toBe("Long");
    });

    it("should map PostgreSQL integer types correctly", () => {
      expect(generator.mapParameterType("INT2", false)).toBe("Short");
      expect(generator.mapParameterType("INT4", false)).toBe("Integer");
      expect(generator.mapParameterType("INT8", false)).toBe("Long");
      expect(generator.mapParameterType("SMALLINT", false)).toBe("Short");
      expect(generator.mapParameterType("INTEGER", false)).toBe("Integer");
      expect(generator.mapParameterType("BIGINT", false)).toBe("Long");
      expect(generator.mapParameterType("BIGSERIAL", false)).toBe("Long");
    });
  });

  describe("getFunctionName", () => {
    it("should convert to camelCase", () => {
      expect(generator.getFunctionName("get_user_by_id")).toMatchInlineSnapshot(`"getUserById"`);
      expect(generator.getFunctionName("CREATE_USER")).toMatchInlineSnapshot(`"createUser"`);
      expect(generator.getFunctionName("simple")).toMatchInlineSnapshot(`"simple"`);
    });
  });

  describe("getClassName", () => {
    it("should convert to PascalCase", () => {
      expect(generator.getClassName("user_result")).toMatchInlineSnapshot(`"UserResult"`);
      expect(generator.getClassName("CREATE_USER_RESULT")).toMatchInlineSnapshot(
        `"CreateUserResult"`,
      );
      expect(generator.getClassName("simple")).toMatchInlineSnapshot(`"Simple"`);
    });
  });

  describe("getFilename", () => {
    it("should convert to PascalCase with .java extension", () => {
      expect(generator.getFilename("user_queries")).toMatchInlineSnapshot(`"UserQueries.java"`);
      expect(generator.getFilename("CREATE_USER")).toMatchInlineSnapshot(`"CreateUser.java"`);
      expect(generator.getFilename("simple")).toMatchInlineSnapshot(`"Simple.java"`);
    });
  });

  describe("listType", () => {
    it("should wrap type in List<>", () => {
      expect(
        generator.listType({ name: "test", type: "varchar", nullable: false }),
      ).toMatchInlineSnapshot(`"List<String>"`);
      expect(
        generator.listType({ name: "test", type: "integer", nullable: false }),
      ).toMatchInlineSnapshot(`"List<Integer>"`);
      expect(
        generator.listType({ name: "user", type: new StructType([]), nullable: false }),
      ).toMatchInlineSnapshot(`"List<UserResult>"`);
    });
  });

  describe("functionReturnType", () => {
    it("should return rowType for single result queries", () => {
      const mockQuery: Partial<SQLQuery> = {
        isOne: true,
        columns: [{ name: "id", type: "INTEGER", nullable: false }],
      };

      const result = generator.functionReturnType(mockQuery as SQLQuery);
      expect(result).toMatchInlineSnapshot(`"UndefinedResult"`);
    });

    it("should return listType of rowType for multiple result queries", () => {
      const mockQuery: Partial<SQLQuery> = {
        isOne: false,
        id: "get_users",
        columns: [{ name: "id", type: "INTEGER", nullable: false }],
      };

      const result = generator.functionReturnType(mockQuery as SQLQuery);
      expect(result).toMatchInlineSnapshot(`"List<GetUsersResult>"`);
    });
  });

  describe("rowType", () => {
    it("should return mapped type for pluck queries", () => {
      const columns = [{ name: "name", type: "TEXT", nullable: false }];
      const mockQuery: Partial<SQLQuery> = {
        isPluck: true,
        columns,
        allColumns: { name: "name", type: new StructType(columns), nullable: false },
      };

      const result = generator.rowType(mockQuery as SQLQuery);
      expect(result).toMatchInlineSnapshot(`"String"`);
    });

    it("should return className for non-pluck queries", () => {
      const mockQuery: Partial<SQLQuery> = {
        isPluck: false,
        id: "get_user_by_id",
      };

      const result = generator.rowType(mockQuery as SQLQuery);
      expect(result).toMatchInlineSnapshot(`"GetUserByIdResult"`);
    });
  });

  describe("partsToString", () => {
    it("should handle string parts correctly", () => {
      const parts = ["SELECT * FROM ", "users", " WHERE id = ?"];
      const result = generator.partsToString(parts);
      expect(result).toMatchInlineSnapshot(`""SELECT * FROM users WHERE id = ?""`);
    });

    it("should handle parameter parts correctly", () => {
      const parts: SqlQueryPart[] = [
        "SELECT * FROM ",
        { name: "table_name", value: "users" },
        " WHERE id = ?",
      ];
      const result = generator.partsToString(parts);
      expect(result).toMatchInlineSnapshot(`""SELECT * FROM  '" + table_name + "' WHERE id = ?""`);
    });

    it("should handle multiline strings with triple quotes", () => {
      const parts = ["SELECT *\nFROM users\nWHERE id = ?"];
      const result = generator.partsToString(parts);
      expect(result).toMatchInlineSnapshot(`
        """"
        SELECT *
        FROM users
        WHERE id = ?""""
      `);
    });

    it("should handle strings with quotes using triple quotes", () => {
      const parts = ['SELECT "name" FROM users'];
      const result = generator.partsToString(parts);
      expect(result).toMatchInlineSnapshot(`
        """"
        SELECT "name" FROM users""""
      `);
    });

    it("should merge consecutive quoted parts", () => {
      const parts = ["SELECT ", "COUNT(*)", " FROM users"];
      const result = generator.partsToString(parts);
      expect(result).toMatchInlineSnapshot(`""SELECT COUNT(*) FROM users""`);
    });
  });

  describe("isCompatibleWith", () => {
    it("should be compatible with all engines by default", () => {
      expect(generator.isCompatibleWith("sqlite")).toBe(true);
      expect(generator.isCompatibleWith("duckdb")).toBe(true);
      expect(generator.isCompatibleWith("postgres")).toBe(true);
    });
  });
});

describe("SqlQueryHelper.parameters", () => {
  let generator: JavaGenerator;

  beforeEach(() => {
    generator = new JavaGenerator("test-template");
  });

  function createHelper(
    variables: Map<string, string>,
    parameterNames: string[],
    parameterTypes?: Map<string, any>,
  ): SqlQueryHelper {
    const query = {
      variables,
      parameterTypes,
    } as unknown as SQLQuery;
    const statement = {
      parameters: parameterNames.map((name) => ({ name, value: "test" })),
      sql: "SELECT 1",
      sqlParts: ["SELECT 1"],
    };
    return new SqlQueryHelper(query, generator, statement);
  }

  it("should detect DuckDB ListType array parameters", () => {
    const variables = new Map([
      ["name", "'test'"],
      ["tags", "['a','b']"],
    ]);
    const parameterTypes = new Map<string, any>([
      ["name", "VARCHAR"],
      ["tags", new ListType("VARCHAR")],
    ]);
    const helper = createHelper(variables, ["name", "tags"], parameterTypes);
    const params = helper.parameters;

    expect(params[0].name).toBe("name");
    expect(params[0].isArray).toBe(false);
    expect(params[0].arrayBaseType).toBeNull();

    expect(params[1].name).toBe("tags");
    expect(params[1].isArray).toBe(true);
    expect(params[1].arrayBaseType).toBe("VARCHAR");
  });

  it("should detect PostgreSQL underscore-prefixed array parameters", () => {
    const variables = new Map([
      ["title", "'test'"],
      ["tags", "ARRAY['a']"],
    ]);
    const parameterTypes = new Map<string, any>([
      ["title", "TEXT"],
      ["tags", "_TEXT"],
    ]);
    const helper = createHelper(variables, ["title", "tags"], parameterTypes);
    const params = helper.parameters;

    expect(params[0].name).toBe("title");
    expect(params[0].isArray).toBe(false);
    expect(params[0].arrayBaseType).toBeNull();

    expect(params[1].name).toBe("tags");
    expect(params[1].isArray).toBe(true);
    expect(params[1].arrayBaseType).toBe("TEXT");
  });

  it("should detect PostgreSQL integer array parameters", () => {
    const variables = new Map([["scores", "ARRAY[1]"]]);
    const parameterTypes = new Map<string, any>([["scores", "_INT4"]]);
    const helper = createHelper(variables, ["scores"], parameterTypes);
    const params = helper.parameters;

    expect(params[0].isArray).toBe(true);
    expect(params[0].arrayBaseType).toBe("INT4");
  });

  it("should handle queries without parameterTypes", () => {
    const variables = new Map([["name", "'test'"]]);
    const helper = createHelper(variables, ["name"], undefined);
    const params = helper.parameters;

    expect(params[0].isArray).toBe(false);
    expect(params[0].arrayBaseType).toBeNull();
  });

  it("should handle nested DuckDB list types", () => {
    const variables = new Map([["matrix", "[['a']]"]]);
    const parameterTypes = new Map<string, any>([
      ["matrix", new ListType(new ListType("VARCHAR"))],
    ]);
    const helper = createHelper(variables, ["matrix"], parameterTypes);
    const params = helper.parameters;

    expect(params[0].isArray).toBe(true);
    expect(params[0].arrayBaseType).toBe("VARCHAR[]");
  });
});
