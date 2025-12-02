import { describe, it, beforeEach } from "vitest";
import { handleProject } from "./sqltool.test";

describe("sqg-pg", () => {


  describe("processProjectPostgres", () => {
    it("handle postgres correctly", async () => {
      await handleProject("tests/test-pg.yaml", ["TestPg.java"]);
    });
  });


});
