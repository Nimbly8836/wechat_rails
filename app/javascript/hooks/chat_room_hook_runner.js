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

async function runHook(input) {
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    console: createConsole(),
    setTimeout,
    clearTimeout,
    Promise
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
