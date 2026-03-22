import { linter, type Diagnostic } from '@codemirror/lint';

/** CodeMirror linter extension for SQG annotations */
export function sqgLinter() {
  return linter((view) => {
    const diagnostics: Diagnostic[] = [];
    const doc = view.state.doc;

    // Track defined @set variables and their usage
    const definedVars = new Set<string>();
    const usedVars: Array<{ name: string; from: number; to: number }> = [];

    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const text = line.text;

      // Check for @set definitions
      const setMatch = text.match(/@set\s+(\w+)\s*=\s*(.+)/);
      if (setMatch) {
        definedVars.add(setMatch[1]);
      }

      // Check for ${var} usage
      const varRegex = /\$\{(\w+)\}/g;
      let varMatch: RegExpExecArray | null;
      while ((varMatch = varRegex.exec(text)) !== null) {
        usedVars.push({
          name: varMatch[1],
          from: line.from + varMatch.index,
          to: line.from + varMatch.index + varMatch[0].length,
        });
      }

      // Check for annotation lines
      const annMatch = text.match(/^--\s+(QUERY|EXEC|MIGRATE|TESTDATA|TABLE)\s+(\S+)((?:\s+:\w+)*)/);
      if (annMatch) {
        const type = annMatch[1];
        const modifiers = (annMatch[3] || '').trim();

        // Info: show what the modifier means
        if (modifiers.includes(':one')) {
          diagnostics.push({
            from: line.from,
            to: line.to,
            severity: 'info',
            message: 'Returns a single row',
          });
        } else if (modifiers.includes(':pluck')) {
          diagnostics.push({
            from: line.from,
            to: line.to,
            severity: 'info',
            message: 'Returns a single value (first column of first row)',
          });
        }

        // Warning: TABLE without :appender
        if (type === 'TABLE' && !modifiers.includes(':appender')) {
          diagnostics.push({
            from: line.from,
            to: line.to,
            severity: 'warning',
            message: 'TABLE annotation without :appender modifier — no code will be generated',
          });
        }
      }
    }

    // Check for undefined variables
    for (const usage of usedVars) {
      if (!definedVars.has(usage.name)) {
        diagnostics.push({
          from: usage.from,
          to: usage.to,
          severity: 'warning',
          message: `Variable "${usage.name}" is used but not defined with @set`,
        });
      }
    }

    return diagnostics;
  });
}
