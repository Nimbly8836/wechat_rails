const dns = require("node:dns/promises");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const vm = require("node:vm");

const ALLOWED_FETCH_METHODS = new Set(["GET", "POST"]);
const BLOCKED_FETCH_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "proxy-authorization",
  "proxy-authenticate",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);
const DEFAULT_FETCH_TIMEOUT_MS = 3000;
const MAX_FETCH_TIMEOUT_MS = 5000;
const MAX_FETCH_BODY_BYTES = 256 * 1024;
const MAX_FETCH_RESPONSE_BYTES = 512 * 1024;
const MAX_FETCH_REDIRECTS = 3;
const MAX_FETCH_HEADER_BYTES = 16 * 1024;

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

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function isBlockedHostname(hostname) {
  const normalized = hostname.replace(/\.$/, "").toLowerCase();
  return normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized === "metadata.google.internal";
}

function isBlockedIPv4(address) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;

  const [a, b] = parts;
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168 ||
    a === 100 && b >= 64 && b <= 127 ||
    a === 192 && b === 0 ||
    a === 198 && (b === 18 || b === 19) ||
    a >= 224;
}

function isBlockedIPv6(address) {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isBlockedIPv4(normalized.slice(7));

  return normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:");
}

function isBlockedIp(address) {
  const family = net.isIP(address);
  if (family === 4) return isBlockedIPv4(address);
  if (family === 6) return isBlockedIPv6(address);
  return true;
}

async function safeLookup(hostname, options, callback) {
  try {
    const normalizedHostname = hostname.replace(/^\[(.*)\]$/, "$1");
    if (isBlockedHostname(normalizedHostname)) {
      throw new Error("fetch is blocked for private network addresses");
    }

    if (net.isIP(normalizedHostname)) {
      if (isBlockedIp(normalizedHostname)) throw new Error("fetch is blocked for private network addresses");
      callback(null, normalizedHostname, net.isIP(normalizedHostname));
      return;
    }

    const records = await dns.lookup(normalizedHostname, { all: true, verbatim: true });
    if (!records.length || records.some((record) => isBlockedIp(record.address))) {
      throw new Error("fetch is blocked for private network addresses");
    }

    const family = options?.family;
    const record = records.find((candidate) => !family || candidate.family === family) || records[0];
    callback(null, record.address, record.family);
  } catch (error) {
    callback(error);
  }
}

async function normalizeFetchUrl(rawUrl) {
  const url = new URL(String(rawUrl));
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("fetch only supports http and https URLs");
  }
  if (url.username || url.password) {
    throw new Error("fetch does not support URLs with credentials");
  }
  const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1");
  if (isBlockedHostname(hostname) || net.isIP(hostname) && isBlockedIp(hostname)) {
    throw new Error("fetch is blocked for private network addresses");
  }
  return url;
}

function normalizeFetchMethod(method) {
  const normalized = String(method || "GET").toUpperCase();
  if (!ALLOWED_FETCH_METHODS.has(normalized)) {
    throw new Error("fetch only supports GET and POST methods");
  }
  return normalized;
}

function normalizeFetchHeaders(headers = {}) {
  const normalized = {};
  let headerBytes = 0;
  const entries = Array.isArray(headers) ? headers : Object.entries(headers || {});

  for (const [name, value] of entries) {
    const key = String(name).toLowerCase();
    if (BLOCKED_FETCH_HEADERS.has(key)) {
      throw new Error(`fetch header is not allowed: ${key}`);
    }

    const stringValue = String(value);
    headerBytes += Buffer.byteLength(key) + Buffer.byteLength(stringValue);
    if (headerBytes > MAX_FETCH_HEADER_BYTES) {
      throw new Error("fetch headers are too large");
    }
    normalized[key] = stringValue;
  }

  return normalized;
}

function normalizeFetchBody(body) {
  if (body === undefined || body === null) return undefined;

  const value = typeof body === "string" ? body : JSON.stringify(body);
  if (Buffer.byteLength(value) > MAX_FETCH_BODY_BYTES) {
    throw new Error("fetch request body is too large");
  }
  return value;
}

function fetchTimeout(inputTimeoutMs, optionsTimeoutMs) {
  const hookTimeout = clampNumber(inputTimeoutMs, 100, MAX_FETCH_TIMEOUT_MS);
  const requestedTimeout = optionsTimeoutMs === undefined ? DEFAULT_FETCH_TIMEOUT_MS : optionsTimeoutMs;
  return clampNumber(requestedTimeout, 100, Math.min(MAX_FETCH_TIMEOUT_MS, hookTimeout));
}

function parseResponseHeaders(rawHeaders) {
  const headers = {};
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = String(rawHeaders[index]).toLowerCase();
    const value = String(rawHeaders[index + 1]);
    headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
  }
  return headers;
}

function safeResponse(response, bodyText, url) {
  const headers = parseResponseHeaders(response.rawHeaders || []);

  return {
    ok: response.statusCode >= 200 && response.statusCode < 300,
    status: response.statusCode,
    statusText: response.statusMessage || "",
    url: url.toString(),
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] || null;
      }
    },
    async text() {
      return bodyText;
    },
    async json() {
      return JSON.parse(bodyText);
    }
  };
}

function requestOnce(url, requestOptions, timeoutMs) {
  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: requestOptions.method,
      headers: requestOptions.headers,
      timeout: timeoutMs,
      lookup: safeLookup
    }, (response) => {
      const chunks = [];
      let size = 0;

      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_FETCH_RESPONSE_BYTES) {
          request.destroy(new Error("fetch response is too large"));
          return;
        }
        chunks.push(chunk);
      });

      response.on("end", () => {
        resolve({ response, bodyText: Buffer.concat(chunks).toString("utf8") });
      });
    });

    request.on("timeout", () => request.destroy(new Error("fetch timed out")));
    request.on("error", reject);

    if (requestOptions.body !== undefined) request.write(requestOptions.body);
    request.end();
  });
}

function createSafeFetch(inputTimeoutMs) {
  return async function safeFetch(rawUrl, rawOptions = {}) {
    const options = rawOptions || {};
    let url = await normalizeFetchUrl(rawUrl);
    let method = normalizeFetchMethod(options.method);
    let body = method === "GET" ? undefined : normalizeFetchBody(options.body);
    const headers = normalizeFetchHeaders(options.headers);
    const timeoutMs = fetchTimeout(inputTimeoutMs, options.timeout);

    for (let redirectCount = 0; redirectCount <= MAX_FETCH_REDIRECTS; redirectCount += 1) {
      const { response, bodyText } = await requestOnce(url, { method, headers, body }, timeoutMs);

      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        if (redirectCount === MAX_FETCH_REDIRECTS) throw new Error("fetch redirected too many times");
        url = await normalizeFetchUrl(new URL(response.headers.location, url).toString());
        if (response.statusCode === 303) {
          method = "GET";
          body = undefined;
        }
        continue;
      }

      return safeResponse(response, bodyText, url);
    }

    throw new Error("fetch redirected too many times");
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
    fetch: createSafeFetch(input.timeout_ms)
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
