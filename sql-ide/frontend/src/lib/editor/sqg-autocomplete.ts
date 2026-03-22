import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from '@codemirror/autocomplete';

/** SQG annotation types with descriptions */
const ANNOTATION_TYPES: Completion[] = [
  { label: 'QUERY', type: 'keyword', detail: 'SELECT query', info: 'Define a query that returns rows' },
  { label: 'EXEC', type: 'keyword', detail: 'Execute statement', info: 'INSERT/UPDATE/DELETE statement' },
  { label: 'MIGRATE', type: 'keyword', detail: 'Migration', info: 'Schema migration (CREATE TABLE, etc.)' },
  { label: 'TESTDATA', type: 'keyword', detail: 'Test data', info: 'Insert test/sample data' },
  { label: 'TABLE', type: 'keyword', detail: 'Appender table', info: 'Define table for bulk insert appender' },
];

/** SQG query modifiers */
const MODIFIERS: Completion[] = [
  { label: ':one', type: 'property', detail: 'Single row', info: 'Query returns exactly one row' },
  { label: ':pluck', type: 'property', detail: 'Single column', info: 'Query returns a single value (first column)' },
  { label: ':all', type: 'property', detail: 'All rows', info: 'Query returns all rows (default)' },
  { label: ':appender', type: 'property', detail: 'Bulk insert', info: 'Generate appender for bulk inserts (TABLE only)' },
];

/** Schema tables for SQL autocomplete (populated from server) */
let schemaTables: Array<{ name: string; columns: Array<{ name: string; type: string }> }> = [];

/** Update the schema tables used for autocomplete */
export function updateSchemaCompletions(
  tables: Array<{ name: string; columns: Array<{ name: string; type: string }> }>
) {
  schemaTables = tables;
}

function sqgCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // After "-- " at the start of a line → suggest annotation types
  const annotationMatch = textBefore.match(/^--\s+$/);
  if (annotationMatch) {
    return {
      from: context.pos,
      options: ANNOTATION_TYPES,
    };
  }

  // After "-- TYPE name " → suggest modifiers
  const modifierMatch = textBefore.match(/^--\s+(?:QUERY|EXEC|TABLE)\s+\S+\s+$/);
  if (modifierMatch) {
    return {
      from: context.pos,
      options: MODIFIERS,
    };
  }

  // After ":" following annotation name → suggest modifiers (without space)
  const colonMatch = textBefore.match(/^--\s+(?:QUERY|EXEC|TABLE)\s+\S+\s*:(\w*)$/);
  if (colonMatch) {
    const from = context.pos - colonMatch[1].length - 1; // include the colon
    return {
      from,
      options: MODIFIERS,
    };
  }

  // After "@" → suggest @set
  const atMatch = textBefore.match(/@(\w*)$/);
  if (atMatch) {
    return {
      from: context.pos - atMatch[1].length - 1,
      options: [
        { label: '@set', type: 'keyword', detail: 'Set variable', info: 'Define a variable: @set name = value' },
      ],
    };
  }

  // Table name completions in SQL context
  if (schemaTables.length > 0) {
    const wordMatch = textBefore.match(/(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+(\w*)$/i);
    if (wordMatch) {
      return {
        from: context.pos - wordMatch[1].length,
        options: schemaTables.map((t) => ({
          label: t.name,
          type: 'class',
          detail: `${t.columns.length} columns`,
        })),
      };
    }

    // Column completions after "table."
    const colMatch = textBefore.match(/(\w+)\.(\w*)$/);
    if (colMatch) {
      const table = schemaTables.find(
        (t) => t.name.toLowerCase() === colMatch[1].toLowerCase()
      );
      if (table) {
        return {
          from: context.pos - colMatch[2].length,
          options: table.columns.map((c) => ({
            label: c.name,
            type: 'property',
            detail: c.type,
          })),
        };
      }
    }
  }

  return null;
}

/** CodeMirror extension for SQG annotation + schema autocomplete */
export function sqgAutocompletion() {
  return autocompletion({
    override: [sqgCompletions],
    activateOnTyping: true,
  });
}
