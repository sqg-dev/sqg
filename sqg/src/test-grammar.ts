import { readFileSync } from "node:fs";
import { printTree } from "@lezer-unofficial/printer";
import { parser } from "./parser/sql-parser";

const test = readFileSync("test-null.sql", "utf-8");
parser.configure({
  strict: true,
});
console.log(printTree(parser.parse(test).topNode, test));
