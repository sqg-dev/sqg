import { beforeEach, describe, expect, it } from "vitest";
import { TsGenerator } from "../src/generators/index";
import type { SQLQuery } from "../src/sql-query";
import { StructType, ListType, MapType } from "../src/sql-query";
import type { SqlQueryPart } from "../src/sqltool";

describe("TsGenerator", () => {
  let generator: TsGenerator;

  beforeEach(() => {
    generator = new TsGenerator("test-template");
  });

  describe("mapParameterType", () => {
    it("should delegate to mapType", () => {
      expect(generator.mapParameterType("INTEGER", false)).toMatchInlineSnapshot(`"number"`);
      expect(generator.mapParameterType("TEXT", true)).toMatchInlineSnapshot(`"string | null"`);
      expect(generator.mapParameterType("BOOLEAN", false)).toMatchInlineSnapshot(`"boolean"`);
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
    it("should convert to filename with .ts extension", () => {
      expect(generator.getFilename("user_queries")).toMatchInlineSnapshot(`"user_queries.ts"`);
      expect(generator.getFilename("CREATE_USER")).toMatchInlineSnapshot(`"CREATE_USER.ts"`);
      expect(generator.getFilename("simple")).toMatchInlineSnapshot(`"simple.ts"`);
    });
  });

  describe("listType", () => {
    it("should wrap type in array syntax", () => {
      expect(
        generator.listType({ name: "test", type: "TEXT", nullable: false }),
      ).toMatchInlineSnapshot(`"{ items: (string)[] }"`);
      expect(
        generator.listType({ name: "test", type: "INTEGER", nullable: false }),
      ).toMatchInlineSnapshot(`"{ items: (number)[] }"`);
      expect(
        generator.listType({ name: "user", type: new StructType([]), nullable: false }),
      ).toMatchInlineSnapshot(`"{ items: (UserStruct)[] }"`);
    });
  });

  describe("functionReturnType", () => {
    it("should return rowType for single result queries", () => {
      const mockQuery: Partial<SQLQuery> = {
        isOne: true,
        isPluck: false,
        id: "get_user",
        columns: [{ name: "id", type: "INTEGER", nullable: false }],
      };

      const result = generator.functionReturnType(mockQuery as SQLQuery);
      expect(result).toMatchInlineSnapshot(`"GetUserResult"`);
    });

    it("should return array type for multiple result queries", () => {
      const mockQuery: Partial<SQLQuery> = {
        isOne: false,
        id: "get_users",
        columns: [{ name: "id", type: "INTEGER", nullable: false }],
      };

      const result = generator.functionReturnType(mockQuery as SQLQuery);
      expect(result).toMatchInlineSnapshot(`"{ items: (GetUsersResult)[] }"`);
    });

    it("should return pluck type for pluck queries", () => {
      const mockQuery: Partial<SQLQuery> = {
        isOne: true,
        isPluck: true,
        id: "get_user_name",
        columns: [{ name: "name", type: "TEXT", nullable: false }],
      };

      const result = generator.functionReturnType(mockQuery as SQLQuery);
      expect(result).toMatchInlineSnapshot(`"string"`);
    });
  });

  describe("rowType", () => {
    it("should return mapped type for pluck queries", () => {
      const columns = [{ name: "name", type: "TEXT", nullable: false }];
      const mockQuery: Partial<SQLQuery> = {
        isPluck: true,
        id: "get_name",
        columns,
      };

      const result = generator.rowType(mockQuery as SQLQuery);
      expect(result).toMatchInlineSnapshot(`"string"`);
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

  describe("mapType", () => {
    it("should map INTEGER to number", () => {
      expect(generator.mapType({ name: "id", type: "INTEGER", nullable: false })).toBe("number");
    });

    it("should map TEXT to string", () => {
      expect(generator.mapType({ name: "name", type: "TEXT", nullable: false })).toBe("string");
    });

    it("should map BOOLEAN to boolean", () => {
      expect(generator.mapType({ name: "active", type: "BOOLEAN", nullable: false })).toBe(
        "boolean",
      );
    });

    it("should handle nullable types", () => {
      expect(generator.mapType({ name: "email", type: "TEXT", nullable: true })).toBe(
        "string | null",
      );
    });

    it("should handle StructType", () => {
      const structType = new StructType([
        { name: "role", type: "TEXT", nullable: false },
        { name: "active", type: "BOOLEAN", nullable: false },
      ]);
      const result = generator.mapType({ name: "metadata", type: structType, nullable: false });
      // StructType returns the struct type name, not the inline type
      expect(result).toBe("MetadataStruct");
    });

    it("should handle ListType", () => {
      const listType = new ListType("TEXT");
      const result = generator.mapType({ name: "tags", type: listType, nullable: false });
      // ListType uses formatListType which wraps in { items: ... }
      expect(result).toContain("items");
    });

    it("should handle MapType", () => {
      const mapType = new MapType(
        { name: "key", type: "TEXT", nullable: false },
        { name: "value", type: "INTEGER", nullable: true },
      );
      const result = generator.mapType({ name: "scores", type: mapType, nullable: false });
      // MapType returns { entries: { key: ...; value: ... }[] }
      expect(result).toContain("entries");
    });
  });

  describe("quote", () => {
    it("should quote simple strings with single quotes", () => {
      expect(generator.quote("SELECT * FROM users")).toBe("'SELECT * FROM users'");
    });

    it("should use backticks for strings with newlines", () => {
      expect(generator.quote("SELECT *\nFROM users")).toBe("`SELECT *\nFROM users`");
    });

    it("should use backticks for strings with single quotes", () => {
      expect(generator.quote("SELECT 'name' FROM users")).toBe("`SELECT 'name' FROM users`");
    });
  });

  describe("isCompatibleWith", () => {
    it("should be compatible with all engines", () => {
      expect(generator.isCompatibleWith("sqlite")).toBe(true);
      expect(generator.isCompatibleWith("duckdb")).toBe(true);
      expect(generator.isCompatibleWith("postgres")).toBe(true);
    });
  });

  describe("supportsAppenders", () => {
    it("should not support appenders by default", () => {
      expect(generator.supportsAppenders("sqlite")).toBe(false);
      expect(generator.supportsAppenders("duckdb")).toBe(false);
    });
  });
});

