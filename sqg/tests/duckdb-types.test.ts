import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { describe, expect, it, beforeAll, afterAll } from "vitest";

// Import the generated class
const { TestDuckdb } = await import("./__generated__/test-duckdb");

describe("DuckDB test_all_types", () => {
  let db: DuckDBInstance;
  let conn: DuckDBConnection;
  let queries: InstanceType<typeof TestDuckdb>;

  beforeAll(async () => {
    db = await DuckDBInstance.create(":memory:");
    conn = await db.connect();
    queries = new TestDuckdb(conn);

    // Run migrations
    for (const migration of TestDuckdb.getMigrations()) {
      await conn.run(migration);
    }
  });

  afterAll(() => {
    conn.closeSync();
  });

  it("should return all DuckDB types with correct values and types", async () => {
    const results = await queries.testAllTypes();
    expect(results).toHaveLength(3); // test_all_types returns 3 rows

    const row = results[0]; // First row has min/boundary values

    // Boolean
    expect(row.bool).toBe(false);

    // Integer types
    expect(row.tinyint).toBe(-128);
    expect(row.smallint).toBe(-32768);
    expect(row.int).toBe(-2147483648);
    expect(row.bigint).toBe(-9223372036854775808n);
    expect(row.hugeint).toBe(-170141183460469231731687303715884105728n);

    // Unsigned integer types
    expect(row.uhugeint).toBe(0n);
    expect(row.utinyint).toBe(0);
    expect(row.usmallint).toBe(0);
    expect(row.uint).toBe(0);
    expect(row.ubigint).toBe(0n);

    // BigNum (arbitrary precision) - returned as bigint
    expect(typeof row.bignum).toBe("bigint");

    // Date - returned as { days: number }
    expect(row.date).toEqual({ days: -2147483646 });

    // Time - returned as { micros: bigint }
    expect(row.time).toEqual({ micros: 0n });

    // Timestamp variants - returned with their respective units
    expect(row.timestamp).toHaveProperty("micros");
    expect(typeof row.timestamp?.micros).toBe("bigint");
    expect(row.timestamp_s).toHaveProperty("seconds");
    expect(typeof row.timestamp_s?.seconds).toBe("bigint");
    expect(row.timestamp_ms).toHaveProperty("millis");
    expect(typeof row.timestamp_ms?.millis).toBe("bigint");
    expect(row.timestamp_ns).toHaveProperty("nanos");
    expect(typeof row.timestamp_ns?.nanos).toBe("bigint");

    // Time with timezone - { micros: bigint, offset: number }
    expect(row.time_tz).toHaveProperty("micros");
    expect(row.time_tz).toHaveProperty("offset");
    expect(row.time_tz?.offset).toBe(57599);

    // Timestamp with timezone - { micros: bigint }
    expect(row.timestamp_tz).toHaveProperty("micros");

    // Floating point
    expect(row.float).toBe(-3.4028234663852886e38);
    expect(row.double).toBe(-1.7976931348623157e308);

    // Decimal types - returned as { width, scale, value }
    expect(row.dec_4_1).toEqual({ width: 4, scale: 1, value: -9999n });
    expect(row.dec_9_4).toEqual({ width: 9, scale: 4, value: -999999999n });
    expect(row.dec_18_6).toEqual({ width: 18, scale: 6, value: -999999999999999999n });
    expect(row.dec38_10).toHaveProperty("width");
    expect(row.dec38_10).toHaveProperty("scale");
    expect(row.dec38_10).toHaveProperty("value");

    // UUID - returned as { hugeint: bigint }
    expect(row.uuid).toHaveProperty("hugeint");
    expect(typeof row.uuid?.hugeint).toBe("bigint");

    // Interval - { months, days, micros }
    expect(row.interval).toEqual({ months: 0, days: 0, micros: 0n });

    // String types
    expect(row.varchar).toBe("🦆🦆🦆🦆🦆🦆");

    // Blob - returned as { bytes: Uint8Array }
    expect(row.blob).toHaveProperty("bytes");
    expect(row.blob?.bytes).toBeInstanceOf(Uint8Array);

    // Bit - returned as { data: Uint8Array }
    expect(row.bit).toHaveProperty("data");
    expect(row.bit?.data).toBeInstanceOf(Uint8Array);

    // Enum types - returned as string
    expect(row.small_enum).toBe("DUCK_DUCK_ENUM");
    expect(row.medium_enum).toBe("enum_0");
    expect(row.large_enum).toBe("enum_0");

    // Array types - returned as { items: T[] }
    expect(row.int_array).toEqual({ items: [] });
    expect(row.double_array).toEqual({ items: [] });
    expect(row.date_array).toEqual({ items: [] });
    expect(row.timestamp_array).toEqual({ items: [] });
    expect(row.timestamptz_array).toEqual({ items: [] });
    expect(row.varchar_array).toEqual({ items: [] });
    expect(row.nested_int_array).toEqual({ items: [] });

    // Struct types - returned as { entries: {...} }
    expect(row.struct).toEqual({ entries: { a: null, b: null } });
    expect(row.struct_of_arrays).toEqual({
      entries: { a: null, b: null },
    });

    // Array of structs - { items: { entries: {...} }[] }
    expect(row.array_of_structs).toEqual({ items: [] });

    // Map - returned as { entries: { key, value }[] }
    expect(row.map).toEqual({ entries: [] });

    // Union type - { tag: string, value: unknown }
    expect(row.union).toEqual({ tag: "name", value: "Frank" });

    // Fixed-size arrays - returned as { items: T[] }
    expect(row.fixed_int_array).toEqual({ items: [null, 2, 3] });
    expect(row.fixed_varchar_array).toEqual({ items: ["a", null, "c"] });
    expect(row.fixed_nested_int_array).toEqual({
      items: [{ items: [null, 2, 3] }, null, { items: [null, 2, 3] }],
    });
    expect(row.fixed_nested_varchar_array).toEqual({
      items: [{ items: ["a", null, "c"] }, null, { items: ["a", null, "c"] }],
    });

    // Fixed struct array
    expect(row.fixed_struct_array).toEqual({
      items: [
        { entries: { a: null, b: null } },
        { entries: { a: 42, b: "🦆🦆🦆🦆🦆🦆" } },
        { entries: { a: null, b: null } },
      ],
    });

    // Struct of fixed array
    expect(row.struct_of_fixed_array).toEqual({
      entries: {
        a: { items: [null, 2, 3] },
        b: { items: ["a", null, "c"] },
      },
    });

    // Fixed array of int list
    expect(row.fixed_array_of_int_list).toEqual({
      items: [{ items: [] }, { items: [42, 999, null, null, -42] }, { items: [] }],
    });

    // List of fixed int array
    expect(row.list_of_fixed_int_array).toEqual({
      items: [{ items: [null, 2, 3] }, { items: [4, 5, 6] }, { items: [null, 2, 3] }],
    });
  });

  it("should return correct values for second row (max values)", async () => {
    const results = await queries.testAllTypes();
    const row = results[1]; // Second row has max/boundary values

    // Boolean
    expect(row.bool).toBe(true);

    // Integer types - max values
    expect(row.tinyint).toBe(127);
    expect(row.smallint).toBe(32767);
    expect(row.int).toBe(2147483647);
    expect(row.bigint).toBe(9223372036854775807n);

    // Unsigned integer types - max values
    expect(row.utinyint).toBe(255);
    expect(row.usmallint).toBe(65535);
    expect(row.uint).toBe(4294967295);
    expect(row.ubigint).toBe(18446744073709551615n);

    // String (contains null character)
    expect(row.varchar).toBe("goo\0se");

    // Enum
    expect(row.small_enum).toBe("GOOSE");
    expect(row.medium_enum).toBe("enum_299");
    expect(row.large_enum).toBe("enum_69999");

    // Arrays with values in second row
    expect(row.int_array).toEqual({ items: [42, 999, null, null, -42] });
    expect(row.varchar_array).toEqual({ items: ["🦆🦆🦆🦆🦆🦆", "goose", null, ""] });
  });

  it("should return null values for third row", async () => {
    const results = await queries.testAllTypes();
    const row = results[2]; // Third row has null values

    expect(row.bool).toBeNull();
    expect(row.tinyint).toBeNull();
    expect(row.smallint).toBeNull();
    expect(row.int).toBeNull();
    expect(row.bigint).toBeNull();
    expect(row.varchar).toBeNull();
    expect(row.small_enum).toBeNull();
    expect(row.date).toBeNull();
    expect(row.time).toBeNull();
    expect(row.timestamp).toBeNull();
    expect(row.uuid).toBeNull();
    expect(row.interval).toBeNull();
    expect(row.blob).toBeNull();
    expect(row.union).toBeNull();
  });
});
