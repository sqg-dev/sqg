declare module '@sqg/sqg' {
  export function parseProjectConfig(filePath: string): {
    name: string;
    version: number;
    sql: Array<{
      files: string[];
      gen: Array<{ generator: string; output: string; config?: Record<string, unknown> }>;
    }>;
    sources?: Array<{ path: string; name?: string }>;
  };

  export function parseSQLQueries(
    filePath: string,
    extraVariables: ExtraVariable[],
  ): {
    queries: Array<{
      id: string;
      rawQuery: string;
      type: 'EXEC' | 'QUERY' | 'MIGRATE' | 'TESTDATA';
      isOne: boolean;
      isPluck: boolean;
      isExec: boolean;
      isMigrate: boolean;
      isTestdata: boolean;
      variables: Map<string, string>;
    }>;
    tables: Array<{
      id: string;
      tableName: string;
      hasAppender: boolean;
    }>;
  };

  export function createExtraVariables(
    sources: Array<{ path: string; name?: string }>,
    suppressLogging?: boolean,
  ): ExtraVariable[];

  export function getGeneratorEngine(generator: string): string;

  export function initProject(options: { dir?: string; generator?: string }): Promise<void>;

  export interface ExtraVariable {
    name: string;
    path: string;
    content: string;
  }
}
