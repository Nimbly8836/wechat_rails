const vm = require("node:vm");

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function writeResult(payload) {
  process.stdout.write(JSON.stringify(payload));
}

function createConsole() {
  const write = (...args) => {
    process.stderr.write(`${args.map(String).join(" ")}\n`);
  };

  return {
    log: write,
    warn: write,
    error: write
  };
}

function fetchFromHost(...args) {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("fetch is not available in this Node runtime");
  }

  return globalThis.fetch(...args);
}

function createPackageImporter(packages) {
  const allowedPackages = packages && typeof packages === "object" ? packages : {};

  return async function importPackage(aliasName) {
    const alias = String(aliasName || "").trim();
    const packageName = allowedPackages[alias];
    if (typeof packageName !== "string" || !packageName) throw new Error(`Node package is not allowed: ${alias}`);

    try {
      const imported = await import(packageName);
      return imported.default || imported;
    } catch (error) {
      throw new Error(`Node package failed to load: ${alias}: ${error.message || String(error)}`);
    }
  };
}

async function runHook(input) {
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    console: createConsole(),
    setTimeout,
    clearTimeout,
    Promise,
    URL,
    URLSearchParams,
    AbortController: globalThis.AbortController,
    Blob: globalThis.Blob,
    FormData: globalThis.FormData,
    Headers: globalThis.Headers,
    Request: globalThis.Request,
    Response: globalThis.Response,
    fetch: fetchFromHost,
    importPackage: createPackageImporter(input.node_packages)
  };
  const context = vm.createContext(sandbox);
  const script = new vm.Script(String(input.code || ""));
  script.runInContext(context, { timeout: Number(input.timeout_ms || 1000) });

  const fn = module.exports?.[input.event];
  if (typeof fn !== "function") {
    return { action: "allow" };
  }

  const result = await fn(input.context || {});
  return result || { action: "allow" };
}

readStdin()
  .then((raw) => JSON.parse(raw || "{}"))
  .then((input) => runHook(input)
    .then((result) => writeResult({ ok: true, result }))
    .catch((error) => writeResult({ ok: false, error: error.message || String(error) })))
  .catch((error) => writeResult({ ok: false, error: error.message || String(error) }));
