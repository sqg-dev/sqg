import { camelCase, pascalCase } from "es-toolkit";
import { TypeMappingError } from "./errors.js";
import type { ColumnInfo } from "./sql-query";
import { ListType, MapType, StructType } from "./sql-query";

/**
 * Abstract base class for mapping SQL column types to target language types.
 * Subclasses implement language-specific type mappings (e.g., Java, TypeScript).
 */
export abstract class TypeMapper {
  /**
   * Returns the target language type name for a given SQL column.
   * Handles complex types (lists, structs, maps) by recursively resolving nested types.
   * @param column - The column information including name, type, and nullability
   * @param path - Optional prefix path for nested type references (e.g., "OuterStruct.")
   * @returns The fully qualified type name in the target language
   */
  getTypeName(column: ColumnInfo, path = ""): string {
    if (column.type instanceof ListType) {
      const elementType = this.getTypeName({
        name: column.name,
        type: column.type.baseType,
        nullable: true,
      });
      return path + this.formatListType(elementType);
    }
    if (column.type instanceof StructType) {
      return path + this.formatStructTypeName(column.name);
    }
    if (column.type instanceof MapType) {
      return path + this.formatMapTypeName(column.name);
    }
    if (!column.type) {
      throw new TypeMappingError("Missing type information", column.name);
    }
    return this.mapPrimitiveType(column.type.toString(), column.nullable);
  }

  /**
   * Wraps a column's type in the target language's list/array type.
   * @param column - The column whose type should be wrapped in a list
   * @returns The list type representation (e.g., "List<String>" for Java)
   */
  listType(column: ColumnInfo): string {
    const baseType = this.getTypeName(column);
    return this.formatListType(baseType);
  }

  /**
   * Generates type declarations for complex types (structs, nested lists).
   * For structs, generates a full type/interface declaration.
   * For lists, recursively processes the element type.
   * @param column - The column containing a complex type
   * @param path - Optional prefix path for nested type references
   * @returns Generated type declaration code, or empty string for primitive types
   */
  getDeclarations(column: ColumnInfo, path = ""): string {
    if (column.type instanceof StructType) {
      return this.generateStructDeclaration(column, path);
    }
    if (column.type instanceof ListType) {
      return this.getDeclarations(
        { name: column.name, type: column.type.baseType, nullable: true },
        path,
      );
    }
    return "";
  }

  /**
   * Maps a primitive SQL type to the target language's equivalent type.
   * @param type - The SQL type name (e.g., "INTEGER", "VARCHAR", "BOOLEAN")
   * @param nullable - Whether the column allows null values
   * @returns The target language type (e.g., "Integer" for Java, "number" for TypeScript)
   */
  protected abstract mapPrimitiveType(type: string, nullable: boolean): string;

  /**
   * Formats a list/array type wrapping the given element type.
   * @param elementType - The type of elements in the list
   * @returns The list type syntax (e.g., "List<String>" for Java, "{ items: string[] }" for TypeScript)
   */
  abstract formatListType(elementType: string): string;

  /**
   * Generates the type name for a struct based on its field name.
   * @param fieldName - The SQL column name containing the struct
   * @returns The generated struct type name (e.g., "UserResult" for Java, "UserStruct" for TypeScript)
   */
  protected abstract formatStructTypeName(fieldName: string): string;

  /**
   * Generates a complete struct/record type declaration.
   * @param column - The column containing the struct type with its field definitions
   * @param path - Prefix path for nested struct references
   * @returns The full type declaration code (e.g., Java record or TypeScript interface)
   */
  protected abstract generateStructDeclaration(column: ColumnInfo, path: string): string;

  /**
   * Generates the type name for a map type based on its field name.
   * @param fieldName - The SQL column name containing the map
   * @returns The map type name (e.g., "HashMap" for Java, "Map" for TypeScript)
   */
  protected abstract formatMapTypeName(fieldName: string): string;

  /**
   * Generates code to parse/convert a raw database value to the target type.
   * Used in generated code to transform query results into typed objects.
   * @param column - The column type information
   * @param value - The expression representing the raw value to parse
   * @param path - Prefix path for nested type references
   * @returns Code expression that converts the value to the correct type
   */
  abstract parseValue(column: ColumnInfo, value: string, path: string): string;
}

/**
 * Type mapper for generating Java types from SQL column types.
 * Maps SQL types to Java types (e.g., INTEGER -> Integer, VARCHAR -> String).
 * Generates Java records for struct types and handles Java reserved keywords.
 */
export class JavaTypeMapper extends TypeMapper {
  private typeMap: { [key: string]: string } = {
    INTEGER: "Integer",
    REAL: "Double",
    TEXT: "String",
    BLOB: "byte[]",
    BOOLEAN: "Boolean",
    DATE: "LocalDate",
    DATETIME: "LocalDateTime",
    TIMESTAMP: "LocalDateTime",
    NULL: "null",
    UNKNOWN: "Object",

    // DuckDB types
    DOUBLE: "Double",
    FLOAT: "Float",
    VARCHAR: "String",
    TINYINT: "Byte",
    SMALLINT: "Short",
    BIGINT: "Long",
    HUGEINT: "BigInteger",
    UHUGEINT: "BigInteger",
    UTINYINT: "Short",
    USMALLINT: "Integer",
    UINTEGER: "Long",
    UBIGINT: "BigInteger",
    TIME: "LocalTime",
    "TIME WITH TIME ZONE": "OffsetTime",
    TIMESTAMP_S: "Instant",
    TIMESTAMP_MS: "Instant",
    TIMESTAMP_NS: "Instant",
    "TIMESTAMP WITH TIME ZONE": "Instant",
    UUID: "UUID",
    INTERVAL: "String",
    BIT: "String",
    BIGNUM: "BigDecimal",

    // PostgreSQL types (from pg-types.builtins)
    INT2: "Short",
    INT4: "Integer",
    INT8: "Long",
    FLOAT4: "Float",
    FLOAT8: "Double",
    NUMERIC: "BigDecimal",
    BOOL: "Boolean",
    BYTEA: "byte[]",
    TIMESTAMPTZ: "OffsetDateTime",
    JSON: "String",
    JSONB: "String",
    OID: "Long",
    SERIAL: "Integer",
    BIGSERIAL: "Long",
  };

  // Java reserved keywords that cannot be used as identifiers
  private static javaReservedKeywords = new Set([
    "abstract",
    "assert",
    "boolean",
    "break",
    "byte",
    "case",
    "catch",
    "char",
    "class",
    "const",
    "continue",
    "default",
    "do",
    "double",
    "else",
    "enum",
    "extends",
    "final",
    "finally",
    "float",
    "for",
    "goto",
    "if",
    "implements",
    "import",
    "instanceof",
    "int",
    "interface",
    "long",
    "native",
    "new",
    "package",
    "private",
    "protected",
    "public",
    "return",
    "short",
    "static",
    "strictfp",
    "super",
    "switch",
    "synchronized",
    "this",
    "throw",
    "throws",
    "transient",
    "try",
    "void",
    "volatile",
    "while",
    "true",
    "false",
    "null",
  ]);

  // Language-specific implementations
  protected mapPrimitiveType(type: string, _nullable: boolean): string {
    const upperType = type.toString().toUpperCase();
    const mappedType = this.typeMap[upperType];
    if (mappedType) {
      return mappedType;
    }

    // Handle PostgreSQL array types (e.g., _TEXT, _INT4, _INT8)
    if (upperType.startsWith("_")) {
      const baseType = upperType.substring(1);
      const elementType = this.typeMap[baseType] || "Object";
      return `List<${elementType}>`;
    }

    // Handle parameterized types
    if (upperType.startsWith("DECIMAL(") || upperType.startsWith("NUMERIC(")) {
      return "BigDecimal";
    }
    if (upperType.startsWith("ENUM(")) {
      return "String";
    }
    if (upperType.startsWith("UNION(")) {
      return "Object";
    }
    // Fixed-size arrays like INTEGER[3], VARCHAR[3][3], STRUCT(...)[3], etc. - treat as Object for now
    if (/\[\d+\]/.test(upperType)) {
      return "Object";
    }

    // Unknown types (including user-defined ENUMs) default to String
    return "String";
  }

  formatListType(elementType: string): string {
    return `List<${elementType}>`;
  }

  protected formatStructTypeName(fieldName: string): string {
    return `${pascalCase(fieldName)}Result`;
  }

  protected generateStructDeclaration(column: ColumnInfo, path = ""): string {
    if (!(column.type instanceof StructType)) {
      throw new Error(`Expected StructType ${column}`);
    }
    const structName = this.formatStructTypeName(column.name);
    const newPath = `${path}${structName}.`;
    const children = column.type.fields
      .map((field) => {
        return this.getDeclarations(
          { name: field.name, type: field.type, nullable: true },
          newPath,
        );
      })
      .join("\n");

    const fields = column.type.fields
      .map((field) => {
        const fieldType = this.getTypeName(field);
        return `${fieldType} ${this.varName(field.name)}`;
      })
      .join(", ");
    const fromAttributes = ` private static ${structName} fromAttributes(Object[] v) {
          return new ${structName}(${column.type.fields.map((f, i) => `${this.parseValue(f, `v[${i}]`, "")}`).join(",\n")});
      }`;
    return `public record ${structName}(${fields}) {
     ${path.length > 0 ? fromAttributes : ""}
      ${children}
    }`;
  }

  protected formatMapTypeName(fieldName: string): string {
    return "HashMap";
  }

  private varName(str: string): string {
    const name = camelCase(str);
    // Escape Java reserved keywords by appending an underscore
    if (JavaTypeMapper.javaReservedKeywords.has(name)) {
      return `${name}_`;
    }
    return name;
  }

  parseValue(column: ColumnInfo, value: string, path: string): string {
    if (column.type instanceof ListType) {
      const elementType = this.getTypeName(
        {
          name: column.name,
          type: column.type.baseType,
          nullable: true,
        },
        path,
      );
      if (column.type.baseType instanceof StructType) {
        return `arrayOfStructToList((Array)${value}, ${elementType}::fromAttributes)`;
      }
      if (column.type.baseType instanceof ListType) {
        // Multi-dimensional arrays - get the innermost element type for the class
        const innerType = this.getInnermostType(column.type);
        return `multiDimArrayToList((Array)${value}, ${innerType}[].class)`;
      }
      return `arrayToList((Array)${value}, ${elementType}[].class)`;
    }
    if (column.type instanceof StructType) {
      return `${path}${this.formatStructTypeName(column.name)}.fromAttributes(getAttr((Struct)${value}))`;
    }
    const fieldType = this.getTypeName(column);
    // Handle JDBC type conversions for date/time types
    const upperType = column.type?.toString().toUpperCase() ?? "";
    if (upperType === "TIMESTAMP" || upperType === "DATETIME") {
      return `toLocalDateTime((java.sql.Timestamp)${value})`;
    }
    if (upperType === "TIMESTAMPTZ") {
      return `toOffsetDateTime((java.sql.Timestamp)${value})`;
    }
    if (upperType === "DATE") {
      return `toLocalDate((java.sql.Date)${value})`;
    }
    if (upperType === "TIME") {
      return `toLocalTime((java.sql.Time)${value})`;
    }
    // Handle PostgreSQL array types (e.g., _TEXT, _INT4)
    if (upperType.startsWith("_")) {
      const baseType = upperType.substring(1);
      const elementType = this.typeMap[baseType] || "Object";
      return `arrayToList((Array)${value}, ${elementType}[].class)`;
    }
    return `(${fieldType})${value}`;
  }

  private getInnermostType(type: ListType): string {
    let current = type.baseType;
    while (current instanceof ListType) {
      current = current.baseType;
    }
    return this.getTypeName({ name: "", type: current, nullable: true });
  }
}

/**
 * Type mapper for generating TypeScript types from SQL column types.
 * Maps SQL types to TypeScript types (e.g., INTEGER -> number, VARCHAR -> string).
 * Generates TypeScript interfaces for struct types and handles DuckDB's complex types.
 */
export class TypeScriptTypeMapper extends TypeMapper {
  /**
   * Returns the TypeScript type name for a given SQL column.
   * Overrides base to handle DuckDB's map type with key-value entry arrays.
   */
  getTypeName(column: ColumnInfo, path = ""): string {
    if (column.type instanceof MapType) {
      const keyType = this.getTypeName({
        name: "key",
        type: column.type.keyType.type,
        nullable: true,
      });
      const valueType = this.getTypeName({
        name: "value",
        type: column.type.valueType.type,
        nullable: true,
      });
      return `{ entries: { key: ${keyType}; value: ${valueType} }[] }`;
    }
    return super.getTypeName(column, path);
  }

  private typeMap: { [key: string]: string } = {
    INTEGER: "number",
    REAL: "number",
    TEXT: "string",
    BLOB: "{ bytes: Uint8Array }",
    BOOLEAN: "boolean",
    DATE: "{ days: number }",
    DATETIME: "{ micros: bigint }",
    TIMESTAMP: "{ micros: bigint }",
    NULL: "null",
    UNKNOWN: "unknown",

    // DuckDB types
    DOUBLE: "number",
    FLOAT: "number",
    VARCHAR: "string",
    TINYINT: "number",
    SMALLINT: "number",
    BIGINT: "bigint",
    HUGEINT: "bigint",
    UHUGEINT: "bigint",
    UTINYINT: "number",
    USMALLINT: "number",
    UINTEGER: "number",
    UBIGINT: "bigint",
    TIME: "{ micros: bigint }",
    "TIME WITH TIME ZONE": "{ micros: bigint; offset: number }",
    TIMESTAMP_S: "{ seconds: bigint }",
    TIMESTAMP_MS: "{ millis: bigint }",
    TIMESTAMP_NS: "{ nanos: bigint }",
    "TIMESTAMP WITH TIME ZONE": "{ micros: bigint }",
    UUID: "{ hugeint: bigint }",
    INTERVAL: "{ months: number; days: number; micros: bigint }",
    BIT: "{ data: Uint8Array }",
    BIGNUM: "bigint",

    // PostgreSQL types (from pg-types.builtins)
    INT2: "number",
    INT4: "number",
    INT8: "bigint",
    FLOAT4: "number",
    FLOAT8: "number",
    NUMERIC: "string", // PostgreSQL numeric can be very large, return as string
    BOOL: "boolean",
    BYTEA: "Buffer",
    TIMESTAMPTZ: "Date",
    JSON: "unknown",
    JSONB: "unknown",
    OID: "number",
    SERIAL: "number",
    BIGSERIAL: "bigint",
  };

  // Language-specific implementations
  protected mapPrimitiveType(type: string, nullable: boolean): string {
    const upperType = type.toUpperCase();
    const mappedType = this.typeMap[upperType];
    if (mappedType) {
      return nullable ? `${mappedType} | null` : mappedType;
    }

    // Handle PostgreSQL array types (e.g., _TEXT, _INT4, _INT8)
    if (upperType.startsWith("_")) {
      const baseType = upperType.substring(1);
      const elementType = this.typeMap[baseType] || "unknown";
      const arrayType = `${elementType}[]`;
      return nullable ? `${arrayType} | null` : arrayType;
    }

    // Handle parameterized types
    if (upperType.startsWith("DECIMAL(") || upperType.startsWith("NUMERIC(")) {
      const baseType = "{ width: number; scale: number; value: bigint }";
      return nullable ? `${baseType} | null` : baseType;
    }
    if (upperType.startsWith("ENUM(")) {
      const baseType = "string";
      return nullable ? `${baseType} | null` : baseType;
    }
    if (upperType.startsWith("UNION(")) {
      const baseType = "{ tag: string; value: unknown }";
      return nullable ? `${baseType} | null` : baseType;
    }
    // Fixed-size arrays like INTEGER[3], VARCHAR[3][3], etc. - DuckDB returns { items: T[] }
    const fixedArrayMatch = upperType.match(/^([A-Z_]+)\[(\d+)\](\[\d+\])*$/);
    if (fixedArrayMatch) {
      const baseTypeName = fixedArrayMatch[1];
      const baseType = this.typeMap[baseTypeName];
      if (baseType) {
        // Count dimensions: INTEGER[3] = 1, INTEGER[3][3] = 2, etc.
        const dimensions = (upperType.match(/\[\d+\]/g) || []).length;
        let result = baseType;
        for (let i = 0; i < dimensions; i++) {
          result = `{ items: (${result} | null)[] }`;
        }
        return nullable ? `${result} | null` : result;
      }
    }
    // STRUCT(...)[3] or other complex fixed arrays
    if (/\[\d+\]/.test(upperType)) {
      return "{ items: unknown[] }";
    }

    // Unknown types (including user-defined ENUMs) default to string
    return nullable ? "string | null" : "string";
  }

  formatListType(elementType: string): string {
    return `{ items: (${elementType})[] }`;
  }

  protected formatStructTypeName(fieldName: string): string {
    return `${pascalCase(fieldName)}Struct`;
  }

  protected formatMapTypeName(fieldName: string): string {
    return "Map";
  }

  protected generateStructDeclaration(column: ColumnInfo): string {
    if (!(column.type instanceof StructType)) {
      throw new Error("Expected StructType");
    }

    const interfaceName = this.formatStructTypeName(column.name);
    const fields = column.type.fields
      .map((field) => {
        const fieldType = this.getTypeName({
          name: field.name,
          type: field.type,
          // Struct fields are nullable by default unless configured otherwise
          nullable: true,
        });
        return `    ${field.name}: ${fieldType};`;
      })
      .join("\n");

    // DuckDB returns structs as { entries: {...} }
    return `interface ${interfaceName} {\n  entries: {\n${fields}\n  };\n}`;
  }

  /**
   * Generates code to parse/convert a raw DuckDB value to the target TypeScript type.
   * DuckDB returns complex types with specific wrapper structures that need to be preserved.
   */
  parseValue(column: ColumnInfo, value: string, path = ""): string {
    // For TypeScript/DuckDB, values are already in the correct structure
    // DuckDB's node-api returns:
    // - Structs as { entries: { field1, field2, ... } }
    // - Lists as { items: [...] }
    // - Maps as { entries: [{ key, value }, ...] }
    // - Primitives as their JS equivalents

    if (column.type instanceof ListType) {
      // Lists are already wrapped as { items: T[] }
      return value;
    }

    if (column.type instanceof StructType) {
      // Structs are already wrapped as { entries: { ... } }
      return value;
    }

    if (column.type instanceof MapType) {
      // Maps are already wrapped as { entries: [{ key, value }, ...] }
      return value;
    }

    // Primitives are passed through directly
    return value;
  }
}
