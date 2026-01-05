import { beforeEach, describe, expect, it } from "vitest";
import { JavaGenerator } from "../src/generators/index";
import type { SQLQuery } from "../src/sql-query";
import { StructType } from "../src/sql-query";
import type { SqlQueryPart } from "../src/sqltool";

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
