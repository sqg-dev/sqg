import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

const PORT = 3399;
const BASE_URL = `http://localhost:${PORT}`;
const SQG_DIST = resolve(import.meta.dirname, '../../sqg/dist/sqg.mjs');
const TEST_PROJECT = resolve(import.meta.dirname, '../../sqg/tests/test-duckdb.yaml');

let server: ChildProcess;
let browser: Browser;
let page: Page;

async function waitForServer(url: string, timeoutMs = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch { /* not ready */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

async function hasText(text: string): Promise<boolean> {
  return page.locator(`text=${text}`).first().isVisible({ timeout: 3000 });
}

beforeAll(async () => {
  server = spawn('node', [SQG_DIST, 'ide', TEST_PROJECT, '--port', String(PORT)], {
    stdio: 'pipe',
    env: { ...process.env, PORT: String(PORT) },
  });
  await waitForServer(BASE_URL);
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  await page.goto(BASE_URL);
  await page.waitForSelector('text=SQL IDE', { timeout: 5000 });
}, 20_000);

afterAll(async () => {
  await page?.close();
  await browser?.close();
  server?.kill('SIGTERM');
});

describe('SQG IDE E2E', () => {
  it('loads the IDE with project name and engine badge', async () => {
    expect(await hasText('test-duckdb')).toBe(true);
    expect(await hasText('duckdb')).toBe(true);
  });

  it('shows the SQL file tab', async () => {
    expect(await hasText('test-duckdb.sql')).toBe(true);
  });

  it('shows queries in the sidebar', async () => {
    // Wait for file to load and annotations to be parsed from editor content
    await page.waitForSelector('text=Queries', { timeout: 5000 });
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    // These queries appear early in the file and should be parsed
    expect(bodyText).toContain('insert');
    expect(bodyText).toContain('by_id');
  });

  it('shows exec queries in the sidebar', async () => {
    expect(await hasText('insert')).toBe(true);
    expect(await hasText('update_email')).toBe(true);
  });

  it('shows migrations and tables sections', async () => {
    expect(await hasText('Migrations')).toBe(true);
    expect(await hasText('Tables')).toBe(true);
  });

  it('has the CodeMirror editor with file content', async () => {
    const editor = page.locator('.cm-editor');
    expect(await editor.isVisible({ timeout: 3000 })).toBe(true);

    // The file tab loads the full SQL file which starts with CREATE SEQUENCE
    const content = await editor.textContent();
    expect(content).toContain('CREATE');
  });

  it('auto-initializes migrations', async () => {
    // Migrations run automatically on project load — "Auto" badge should be visible
    expect(await hasText('Auto')).toBe(true);
  });

  it('shows schema graph tab with tables', async () => {
    // Click Schema in sidebar to open schema tab
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const b of buttons) {
        if (b.textContent?.trim() === 'Schema') { b.click(); break; }
      }
    });
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('users');
    expect(bodyText).toContain('actions');
  });

  it('clicks a query in the sidebar and opens file tab', async () => {
    // Click "top_users" query — should switch to file tab
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const b of buttons) {
        if (b.textContent?.trim() === 'top_users') { b.click(); break; }
      }
    });
    await page.waitForTimeout(1500);

    // Should be on the file tab now (editor visible)
    const editor = page.locator('.cm-editor');
    expect(await editor.isVisible({ timeout: 3000 })).toBe(true);
  });

  it('shows watch mode status', async () => {
    expect(await hasText('Watching')).toBe(true);
  });
});
