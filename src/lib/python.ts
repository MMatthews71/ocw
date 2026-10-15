// Runs Python in the browser via Pyodide. The runtime is bundled into the app
// (public/pyodide, copied from node_modules by tools/copy-pyodide.mjs), so code
// executes fully offline — no CDN, no network.

let runtimePromise: Promise<any> | null = null;

// Absolute URL to the bundled runtime folder (works under the app's "./" base).
function baseUrl(): string {
  return new URL("pyodide/", document.baseURI).href;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the bundled Python runtime."));
    document.head.appendChild(s);
  });
}

export function pyodideReady(): boolean {
  return !!(window as any).__pyodide;
}

export async function loadPythonRuntime(): Promise<any> {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    const base = baseUrl();
    await loadScript(`${base}pyodide.js`);
    const loadPyodide = (window as any).loadPyodide;
    if (!loadPyodide) throw new Error("Python runtime unavailable.");
    const pyodide = await loadPyodide({ indexURL: base });
    (window as any).__pyodide = pyodide;
    return pyodide;
  })();
  try {
    return await runtimePromise;
  } catch (e) {
    runtimePromise = null; // allow retry
    throw e;
  }
}

export interface RunResult {
  ok: boolean;
  output: string;
  error?: string;
}

// Run a script and capture its stdout/stderr. An optional `setup` snippet (helper
// classes/data the question needs) runs first, in the same namespace.
export async function runPython(code: string, setup?: string): Promise<RunResult> {
  const pyodide = await loadPythonRuntime();
  let out = "";
  pyodide.setStdout({ batched: (s: string) => (out += s) });
  pyodide.setStderr({ batched: (s: string) => (out += s) });
  try {
    await pyodide.runPythonAsync((setup ? setup + "\n" : "") + code);
    return { ok: true, output: out };
  } catch (e: any) {
    return { ok: false, output: out, error: String(e?.message ?? e) };
  }
}

export interface TestOutcome {
  call: string;
  expected: string;
  got: string;
  pass: boolean;
}

export interface TestRunResult {
  results: TestOutcome[];
  error?: string; // set if the student's code failed to even define/run
}

// Define the student's code, then evaluate each test call and compare str(result)
// to the expected value. Used for LeetCode-style function problems.
export async function runTests(
  code: string,
  tests: { call: string; expected: string }[],
  setup?: string
): Promise<TestRunResult> {
  const pyodide = await loadPythonRuntime();
  let stderr = "";
  pyodide.setStdout({ batched: () => {} });
  pyodide.setStderr({ batched: (s: string) => (stderr += s) });

  // Run the question's setup (helper classes/data), then the student's code, in a
  // fresh namespace each time, so the tests have everything they reference.
  const ns = pyodide.toPy({});
  try {
    if (setup && setup.trim()) await pyodide.runPythonAsync(setup, { globals: ns });
    await pyodide.runPythonAsync(code, { globals: ns });
  } catch (e: any) {
    ns.destroy?.();
    return { results: [], error: String(e?.message ?? e) || stderr || "Error running your code." };
  }

  const results: TestOutcome[] = [];
  for (const t of tests) {
    try {
      const val = pyodide.runPython(`str(${t.call})`, { globals: ns });
      const got = String(val);
      results.push({ call: t.call, expected: String(t.expected), got, pass: got.trim() === String(t.expected).trim() });
    } catch (e: any) {
      results.push({ call: t.call, expected: String(t.expected), got: "Error: " + String(e?.message ?? e), pass: false });
    }
  }
  ns.destroy?.();
  return { results };
}
