import { watch, type FSWatcher } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseProject } from './sqg/parser';

let watchers: FSWatcher[] = [];
let watchedFiles: string[] = [];
let lastChangeFile: string | null = null;
let lastChangeTime: string | null = null;
let changeCounter = 0;

export interface WatchStatus {
  watching: boolean;
  fileCount: number;
  fileNames: string[];
  lastChangeFile: string | null;
  lastChangeTime: string | null;
  changeCounter: number;
}

/**
 * Start watching SQL files from the given SQG project config.
 * When a file changes, updates the change counter so the frontend can poll for changes.
 */
export function startWatching(configPath: string): WatchStatus {
  stopWatching();

  try {
    const project = parseProject(configPath);
    const projectDir = dirname(configPath);
    const sqlFiles = project.sqlFiles.map((f) => join(projectDir, f));

    watchedFiles = sqlFiles;

    // Watch each SQL file
    for (const file of sqlFiles) {
      try {
        const w = watch(file, { persistent: false }, (eventType) => {
          if (eventType === 'change') {
            const fileName = file.split('/').pop() || file;
            lastChangeFile = fileName;
            lastChangeTime = new Date().toISOString();
            changeCounter++;
            console.log(`[watcher] File changed: ${fileName} (change #${changeCounter})`);
          }
        });
        watchers.push(w);
      } catch (err) {
        console.error(`[watcher] Failed to watch ${file}:`, err);
      }
    }

    console.log(`[watcher] Watching ${sqlFiles.length} files`);
  } catch (err) {
    console.error('[watcher] Failed to start:', err);
  }

  return getWatchStatus();
}

/** Stop watching all files */
export function stopWatching() {
  for (const w of watchers) {
    w.close();
  }
  watchers = [];
  watchedFiles = [];
}

/** Get current watch status (polled by frontend) */
export function getWatchStatus(): WatchStatus {
  return {
    watching: watchedFiles.length > 0,
    fileCount: watchedFiles.length,
    fileNames: watchedFiles.map(f => f.split('/').pop() || f),
    lastChangeFile,
    lastChangeTime,
    changeCounter,
  };
}
