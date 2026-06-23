import { describe, expect, it } from "vitest";
import { getPostgresSources, parseProjectConfig } from "../src/sqltool";

describe("postgres source url resolution", () => {
  it("passes a literal DSN through unchanged", () => {
    const sources = getPostgresSources([
      { type: "postgres", name: "prod", url: "postgresql://u:p@host:5432/db" },
    ] as never);
    expect(sources[0].url).toBe("postgresql://u:p@host:5432/db");
  });

  it("reads $VAR and ${VAR} forms from the environment", () => {
    process.env.SQG_TEST_DSN = "postgresql://env-host/db";
    try {
      expect(getPostgresSources([{ type: "postgres", name: "a", url: "$SQG_TEST_DSN" }] as never)[0].url).toBe(
        "postgresql://env-host/db",
      );
      expect(
        getPostgresSources([{ type: "postgres", name: "b", url: "${SQG_TEST_DSN}" }] as never)[0].url,
      ).toBe("postgresql://env-host/db");
    } finally {
      delete process.env.SQG_TEST_DSN;
    }
  });

  it("throws a pointed error when the referenced env var is unset", () => {
    expect(() =>
      getPostgresSources([{ type: "postgres", name: "prod", url: "$SQG_DEFINITELY_UNSET" }] as never),
    ).toThrow(/SQG_DEFINITELY_UNSET.*not set/);
  });

  it("leaves a source without url undefined", () => {
    expect(getPostgresSources([{ type: "postgres", name: "prod" }] as never)[0].url).toBeUndefined();
  });
});

describe("config schema validation", () => {
  it("rejects an unknown key (misplaced 'sources') under an sql block with a pointed error", () => {
    // `sources` is a project-level key. Placing it under an sql[] item used to
    // be silently dropped, later surfacing as a misleading "${sources_x} not
    // defined" error. The strict schema now points at the misplaced key.
    let error: { code?: string; message?: string } | undefined;
    try {
      parseProjectConfig("tests/test-misplaced-sources.yaml");
    } catch (e) {
      error = e as { code?: string; message?: string };
    }
    expect(error).toBeDefined();
    expect(error?.code).toBe("CONFIG_VALIDATION_ERROR");
    expect(error?.message).toMatch(/Unrecognized key/);
    expect(error?.message).toMatch(/sources/);
    expect(error?.message).toMatch(/sql\[0\]/);
  });
});
