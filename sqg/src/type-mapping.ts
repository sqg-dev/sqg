import consola from "consola";
import { camelCase, pascalCase } from "es-toolkit";
import type { ColumnInfo } from "./sql-query";
import { ColumnMapType, ColumnTypeList, ColumnTypeStruct } from "./sql-query";

export abstract class TypeMapper {
  // Common implementation for all subclasses
  getTypeName(column: ColumnInfo, path = ""): string {
    if (column.type instanceof ColumnTypeList) {
      const elementType = this.getTypeName({
        name: column.name,
        type: column.type.baseType,
        nullable: true,
      });
      return path + this.formatListType(elementType);
    }
    if (column.type instanceof ColumnTypeStruct) {
      return path + this.formatStructTypeName(column.name);
    }
    if (column.type instanceof ColumnMapType) {
      return path + this.formatMapTypeName(column.name);
    }
    if (!column.type) {
      throw new Error(`Expected ColumnType ${JSON.stringify(column)}`);
    }
    return this.mapPrimitiveType(column.type.toString(), column.nullable);
  }

  listType(column: ColumnInfo): string {
    const baseType = this.getTypeName(column);
    return this.formatListType(baseType);
  }

  getDeclarations(column: ColumnInfo, path = ""): string {
    if (column.type instanceof ColumnTypeStruct) {
      return this.generateStructDeclaration(column, path);
    }
    if (column.type instanceof ColumnTypeList) {
      return this.getDeclarations(
        { name: column.name, type: column.type.baseType, nullable: true },
        path,
      );
    }
    return "";
  }

  // Language-specific methods to be implemented by subclasses
  protected abstract mapPrimitiveType(type: string, nullable: boolean): string;
  abstract formatListType(elementType: string): string;
  protected abstract formatStructTypeName(fieldName: string): string;
  protected abstract generateStructDeclaration(column: ColumnInfo, path: string): string;
  protected abstract formatMapTypeName(fieldName: string): string;
  abstract parseValue(column: ColumnInfo, value: string, path: string): string;
}

export class JavaTypeMapper extends TypeMapper {
  private typeMap: { [key: string]: string } = {
    INTEGER: "Integer",
    REAL: "Double",
    TEXT: "String",
    BLOB: "byte[]",
    BOOLEAN: "Boolean",
    DATE: "Date",
    DATETIME: "Date",
    TIMESTAMP: "Date",
    NULL: "null",
    UNKNOWN: "Object",

    // DuckDB types
    DOUBLE: "Double",
    FLOAT: "Float",
    VARCHAR: "String",
    BIGINT: "Long",
    HUGEINT: "BigInteger",

    // Postgres types
    INT4: "Integer",
  };

  // Language-specific implementations
  protected mapPrimitiveType(type: string, _nullable: boolean): string {
    const mappedType = this.typeMap[type.toString().toUpperCase()];
    if (!mappedType) {
      console.warn("Mapped type is unknown:", type);
      return "Object";
    }
    return mappedType;
  }

  formatListType(elementType: string): string {
    return `List<${elementType}>`;
  }

  protected formatStructTypeName(fieldName: string): string {
    return `${pascalCase(fieldName)}Result`;
  }

  protected generateStructDeclaration(column: ColumnInfo, path = ""): string {
    if (!(column.type instanceof ColumnTypeStruct)) {
      throw new Error(`Expected ColumnTypeStruct ${column}`);
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
    return camelCase(str);
  }

  parseValue(column: ColumnInfo, value: string, path: string): string {
    if (column.type instanceof ColumnTypeList) {
      const elementType = this.getTypeName(
        {
          name: column.name,
          type: column.type.baseType,
          nullable: true,
        },
        path,
      );
      if (column.type.baseType instanceof ColumnTypeStruct) {
        return `arrayOfStructToList((Array)${value}, ${elementType}::fromAttributes)`;
      }
      if (column.type.baseType instanceof ColumnTypeList) {
        throw new Error("multi dimensional arrays are not supported yet");
      }
      return `arrayToList((Array)${value}, ${elementType}[].class)`;
    }
    if (column.type instanceof ColumnTypeStruct) {
      return `${path}${this.formatStructTypeName(column.name)}.fromAttributes(getAttr((Struct)${value}))`;
    }
    const fieldType = this.getTypeName(column);
    return `(${fieldType})${value}`;
  }
}

export class TypeScriptTypeMapper extends TypeMapper {
  private typeMap: { [key: string]: string } = {
    INTEGER: "number",
    REAL: "number",
    TEXT: "string",
    BLOB: "Buffer",
    BOOLEAN: "boolean",
    DATE: "Date",
    DATETIME: "Date",
    TIMESTAMP: "Date",
    NULL: "null",
    UNKNOWN: "any",

    // DuckDB types
    DOUBLE: "number",
    FLOAT: "number",
    VARCHAR: "string",
    BIGINT: "number",

    // Postgres types
    INT4: "number",
  };

  // Language-specific implementations
  protected mapPrimitiveType(type: string, nullable: boolean): string {
    const mappedType = this.typeMap[type.toUpperCase()];
    if (!mappedType) {
      console.warn("Mapped type is unknown:", type);
      return "any";
    }
    return nullable ? `${mappedType} | null` : mappedType;
  }

  formatListType(elementType: string): string {
    return `${elementType}[]`;
  }

  protected formatStructTypeName(fieldName: string): string {
    return `${pascalCase(fieldName)}Struct`;
  }

  protected formatMapTypeName(fieldName: string): string {
    return "Map";
  }

  protected generateStructDeclaration(column: ColumnInfo): string {
    if (!(column.type instanceof ColumnTypeStruct)) {
      throw new Error("Expected ColumnTypeStruct");
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
        return `  ${field.name}: ${fieldType};`;
      })
      .join("\n");

    return `interface ${interfaceName} {\n${fields}\n}`;
  }

  parseValue(column: ColumnInfo, value: string): string {
    return "/// TODO: parseValue";
  }
}
