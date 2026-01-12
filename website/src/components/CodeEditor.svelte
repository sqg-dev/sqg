<script lang="ts">
import { actions } from "astro:actions";
import { onMount } from "svelte";
import Editor from "./Editor.svelte";

export let initialCode: string | undefined = undefined;
export let initialEngine: "sqlite" | "duckdb" | undefined = undefined;
export let initialLanguage: "java-jdbc" | "java-arrow" | "typescript" | undefined = undefined;

const DEFAULT_TEMPLATE = `-- MIGRATE 1

create table  users (
    id text primary key,
    name text not null,
    email text unique
);


-- QUERY all_users
select * from users;

-- QUERY total_users_count :pluck :one
select count(*) from users;

-- QUERY get_user_by_id :pluck :one
@set id = 1
select id from users where id = \${id};


-- QUERY get_emails :pluck
@set limit = 5
select email from users limit \${limit};
`;

const DUCKDB_TEMPLATE = `-- MIGRATE 1

create table  users (
    id text primary key,
    name text not null,
    email text unique
);


-- QUERY all_users
select * from users;

-- QUERY total_users_count :pluck :one
select count(*) from users;

-- QUERY get_user_by_id :pluck :one
@set id = 1
select id from users where id = \${id};


-- QUERY get_emails :pluck
@set limit = 5
select email from users limit \${limit};

-- TABLE users :appender
`;

let generatedCode = "";
let highlightedCode = "";
let error: string | null = null;
let isGenerating = false;
let selectedDatabase: "sqlite" | "duckdb" = "sqlite";
let selectedLanguage: "java-jdbc" | "java-arrow" | "typescript" = "java-jdbc";
let sqlCode = DEFAULT_TEMPLATE;
let initialized = false;

// Read URL params on mount
onMount(() => {
  const params = new URLSearchParams(window.location.search);
  const exampleId = params.get("example");
  
  // Use initial props if provided, otherwise fall back to URL params or defaults
  if (initialCode !== undefined) {
    sqlCode = initialCode;
  } else {
    const engine = params.get("engine");
    if (engine === "sqlite" || engine === "duckdb") {
      sqlCode = engine === "duckdb" ? DUCKDB_TEMPLATE : DEFAULT_TEMPLATE;
    }
  }
  
  if (initialEngine !== undefined) {
    selectedDatabase = initialEngine;
  } else {
    const engine = params.get("engine");
    if (engine === "sqlite" || engine === "duckdb") {
      selectedDatabase = engine;
    }
  }
  
  if (initialLanguage !== undefined) {
    selectedLanguage = initialLanguage;
  } else {
    const lang = params.get("lang");
    if (lang === "java-jdbc" || lang === "java-arrow" || lang === "typescript") {
      selectedLanguage = lang;
    }
  }
  
  // Update URL to include example ID if present
  if (exampleId) {
    updateUrl();
  }
  
  initialized = true;
});

// Update URL when selections change
function updateUrl() {
  if (!initialized) return;
  const params = new URLSearchParams(window.location.search);
  const exampleId = params.get("example");
  
  // Preserve example ID if present
  if (exampleId) {
    params.set("example", exampleId);
  }
  params.set("engine", selectedDatabase);
  params.set("lang", selectedLanguage);
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", newUrl);
}
// Handle database change - update template if using default
function handleDatabaseChange() {
  // Check if current code matches a default template
  const isDefault = sqlCode.trim() === DEFAULT_TEMPLATE.trim();
  const isDefaultDuckdb = sqlCode.trim() === DUCKDB_TEMPLATE.trim();
  if (isDefault || isDefaultDuckdb) {
    sqlCode = selectedDatabase === "duckdb" ? DUCKDB_TEMPLATE : DEFAULT_TEMPLATE;
  }
  if (selectedDatabase !== "duckdb" && selectedLanguage === "java-arrow") {
    selectedLanguage = "java-jdbc";
  }

  updateUrl();
}

$: if (initialized && selectedLanguage) updateUrl();

function handleCodeUpdate(newCode: string) {
  sqlCode = newCode;
  // Clear generated code when SQL changes
  if (generatedCode) {
    generatedCode = "";
    error = null;
  }
}

async function generateCode() {
  if (!sqlCode.trim()) {
    error = "Please enter some SQL code";
    return;
  }

  error = null;
  generatedCode = "";
  isGenerating = true;

  try {
    const { data, error: actionError } = await actions.generateCode({
      sql: sqlCode,
      database: selectedDatabase,
      language: selectedLanguage,
    });

    if (actionError) {
      error = actionError.message || "An error occurred while generating code";
    } else if (data) {
      generatedCode = data.code || "";
      highlightedCode = data.highlightedCode || "";
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "An error occurred while generating code";
  } finally {
    isGenerating = false;
  }
}
</script>

<div class="flex h-screen w-screen">
  <div class="flex flex-1 flex-col border-r border-gray-200">
    <div class="px-4 py-4 bg-gray-50 border-b border-gray-200 h-20 flex items-center">
      <div class="flex items-center justify-between w-full">
        <h2 class="m-0 text-xl font-semibold text-gray-900">SQL Editor</h2>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <label for="database-select" class="text-sm font-medium text-gray-700">Database:</label>
            <select
              id="database-select"
              bind:value={selectedDatabase}
              on:change={handleDatabaseChange}
              class="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="sqlite">SQLite</option>
              <option value="duckdb">DuckDB</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <label for="language-select" class="text-sm font-medium text-gray-700">Language:</label>
            <select
              id="language-select"
              bind:value={selectedLanguage}
              class="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="java-jdbc">Java JDBC</option>
              <option value="java-arrow">Java Arrow</option>
              <option value="typescript">TypeScript</option>
            </select>
          </div>
          <button
            on:click={generateCode}
            disabled={isGenerating}
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
    <div class="flex-1 overflow-auto bg-white">
      <Editor value={sqlCode} onUpdate={handleCodeUpdate} />
    </div>
  </div>

  <div class="flex flex-1 flex-col border-l border-gray-200">
    <div class="px-4 py-4 bg-gray-50 border-b border-gray-200 h-20 flex items-center">
      <h2 class="m-0 text-xl font-semibold text-gray-900">Generated Code</h2>
    </div>
    <div class="flex-1 overflow-auto bg-white">
      {#if isGenerating}
        <div class="py-8 text-center text-gray-500">Generating...</div>
      {:else if error}
        <div
          class="p-8 text-red-600 bg-red-50 m-4 rounded-lg whitespace-pre-wrap font-mono text-sm"
        >
          {error}
        </div>
      {:else if generatedCode}
        {#if highlightedCode}
          <div class="m-0 p-4 h-full overflow-x-auto">
            {@html highlightedCode}
          </div>
        {:else}
          <pre
            class="m-0 p-4 bg-slate-800 text-slate-200 font-mono text-sm leading-relaxed overflow-x-auto h-full"><code
              >{generatedCode}</code
            ></pre>
        {/if}
      {:else}
        <div class="py-8 text-center text-gray-500">Generated code will appear here</div>
      {/if}
    </div>
  </div>
</div>
