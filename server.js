const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { AsyncLocalStorage } = require("node:async_hooks");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const tokenFile = path.join(root, ".upstox-token");
let upstoxToken = fs.existsSync(tokenFile)
  ? fs.readFileSync(tokenFile, "utf8").trim()
  : null;
const requestToken = new AsyncLocalStorage();
const suggestionCache = new Map();

function send(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}
function bodyJson(req) {
  if (req.body !== undefined) {
    try {
      return Promise.resolve(
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {},
      );
    } catch {
      return Promise.reject(new Error("Invalid JSON"));
    }
  }
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 10000) reject(new Error("Request too large"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}
function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (upstream) => {
        let body = "";
        upstream.setEncoding("utf8");
        upstream.on("data", (part) => (body += part));
        upstream.on("end", () => {
          try {
            resolve({
              status: upstream.statusCode || 502,
              data: JSON.parse(body),
            });
          } catch {
            reject(
              new Error("The data provider returned an unreadable response."),
            );
          }
        });
      })
      .on("error", () =>
        reject(new Error("Could not connect to the data provider.")),
      );
  });
}
async function upstoxGet(url) {
  const token = requestToken.getStore() || upstoxToken;
  if (!token) throw new Error("Connect Upstox first to load market data.");
  const result = await getJson(url, {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "User-Agent": "StrikeFlow/1.0",
  });
  if (result.status >= 400 || result.data?.status === "error") {
    const code = result.data?.errors?.[0]?.errorCode;
    if (code === "UDAPI1149")
      throw new Error(
        "Upstox requires its Plus plan for expired option history. Choose an active expiry or enable Plus.",
      );
    throw new Error(
      result.data?.errors?.[0]?.message ||
        "Upstox could not return this market data. Check the access token and API access.",
    );
  }
  return result.data?.data;
}
function hasUpstoxToken() {
  return Boolean(requestToken.getStore() || upstoxToken);
}
function upstoxURL(route, params = {}) {
  const url = new URL(`https://api.upstox.com/v2${route}`);
  url.search = new URLSearchParams(params).toString();
  return url;
}
async function upstoxHistory(instrumentKey, from, to, interval, isExpired) {
  const encoded = encodeURIComponent(instrumentKey);
  const endpoint = isExpired
    ? upstoxURL(
        `/expired-instruments/historical-candle/${encoded}/${interval}/${to}/${from}`,
      )
    : interval === "day"
      ? upstoxURL(`/historical-candle/${encoded}/day/${to}/${from}`)
      : new URL(
          `https://api.upstox.com/v3/historical-candle/${encoded}/minutes/${Number.parseInt(interval, 10)}/${to}/${from}`,
        );
  const data = await upstoxGet(endpoint);
  return { candles: data?.candles || [] };
}
async function resolveNiftyOption(expiry, strike, type) {
  const contracts = await niftyContracts(expiry);
  const found = (contracts || []).find(
    (c) => Number(c.strike_price) === strike && c.instrument_type === type,
  );
  if (!found)
    throw new Error(
      "No NIFTY 50 option exists for that expiry, strike, and type.",
    );
  return {
    instrumentKey: found.instrument_key,
    lotSize: 65,
    providerLotSize: Number(found.lot_size) || null,
  };
}
async function niftyContracts(expiry) {
  const expired = expiry < todayIST();
  return (
    (await upstoxGet(
      upstoxURL(
        expired ? "/expired-instruments/option/contract" : "/option/contract",
        { instrument_key: "NSE_INDEX|Nifty 50", expiry_date: expiry },
      ),
    )) || []
  );
}
async function priorClose(instrumentKey, day, expired = false) {
  const from = new Date(`${day}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 14);
  const fromDay = from.toISOString().slice(0, 10),
    encoded = encodeURIComponent(instrumentKey);
  const endpoint = expired
    ? upstoxURL(
        `/expired-instruments/historical-candle/${encoded}/day/${addCalendarDays(day, 1)}/${fromDay}`,
      )
    : upstoxURL(
        `/historical-candle/${encoded}/day/${addCalendarDays(day, 1)}/${fromDay}`,
      );
  const data = await upstoxGet(endpoint),
    candles = (data?.candles || [])
      .map((c) => ({ date: String(c[0]).slice(0, 10), close: Number(c[4]) }))
      .filter((c) => c.date < day && Number.isFinite(c.close))
      .sort((a, b) => a.date.localeCompare(b.date));
  return candles.at(-1) || null;
}
function addCalendarDays(day, count) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
async function suggestOptions(expiry, day, suffix, type) {
  const key = [expiry, day, suffix, type].join("|"),
    cached = suggestionCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const [reference, contracts] = await Promise.all([
    priorClose("NSE_INDEX|Nifty 50", day),
    niftyContracts(expiry),
  ]);
  if (!reference)
    throw new Error(
      "Could not find NIFTY 50’s previous-session close for that day.",
    );
  const price = reference.close,
    options = contracts
      .filter(
        (c) =>
          c.instrument_type === type &&
          Number(c.strike_price) % 1000 === suffix,
      )
      .map((c) => ({
        strike: Number(c.strike_price),
        type,
        distance: Math.abs(Number(c.strike_price) - price),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8);
  if (!options.length)
    throw new Error(`No ${suffix} ${type} strikes are listed for this expiry.`);
  const value = {
    options,
    referenceClose: price,
    referenceDate: reference.date,
  };
  suggestionCache.set(key, { value, expires: Date.now() + 120000 });
  return value;
}
function todayIST() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).formatToParts(new Date());
  return `${parts.find((x) => x.type === "year").value}-${parts.find((x) => x.type === "month").value}-${parts.find((x) => x.type === "day").value}`;
}
async function routeRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/upstox/config" && req.method === "GET")
    return send(res, 200, { connected: hasUpstoxToken() });
  if (url.pathname === "/api/upstox/config" && req.method === "POST") {
    try {
      const input = await bodyJson(req),
        token = String(input.accessToken || "").trim();
      if (!token || token.length > 4000)
        return send(res, 400, { error: "Enter your Upstox access token." });
      await requestToken.run(token, async () =>
        upstoxGet(
          upstoxURL("/option/contract", {
            instrument_key: "NSE_INDEX|Nifty 50",
          }),
        ),
      );
      if (!process.env.VERCEL) {
        fs.writeFileSync(tokenFile, token, { encoding: "utf8", mode: 0o600 });
        fs.chmodSync(tokenFile, 0o600);
        upstoxToken = token;
      }
      suggestionCache.clear();
      return send(res, 200, { connected: true });
    } catch (e) {
      return send(res, 401, {
        error:
          e.message ||
          "Could not connect to Upstox. Check the token and try again.",
      });
    }
  }
  if (url.pathname === "/api/upstox/config" && req.method === "DELETE") {
    upstoxToken = null;
    suggestionCache.clear();
    try {
      fs.unlinkSync(tokenFile);
    } catch (e) {
      if (e.code !== "ENOENT")
        return send(res, 500, { error: "Could not remove the saved token." });
    }
    return send(res, 200, { connected: false });
  }
  if (url.pathname === "/api/upstox/nifty-expiries") {
    if (!hasUpstoxToken())
      return send(res, 401, {
        error: "Connect Upstox first to load NIFTY 50 expiries.",
      });
    try {
      const active =
        (await upstoxGet(
          upstoxURL("/option/contract", {
            instrument_key: "NSE_INDEX|Nifty 50",
          }),
        )) || [];
      let expired = [],
        expiredAvailable = true;
      try {
        expired =
          (await upstoxGet(
            upstoxURL("/expired-instruments/expiries", {
              instrument_key: "NSE_INDEX|Nifty 50",
            }),
          )) || [];
      } catch (e) {
        if (e.message.includes("Plus plan")) expiredAvailable = false;
        else throw e;
      }
      const dates = [
        ...new Set(
          [...active.map((c) => c.expiry), ...expired].filter((x) =>
            /^\d{4}-\d{2}-\d{2}$/.test(x || ""),
          ),
        ),
      ].sort();
      return send(res, 200, { expiries: dates, expiredAvailable });
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }
  if (url.pathname === "/api/upstox/nifty-options") {
    if (!hasUpstoxToken())
      return send(res, 401, {
        error: "Connect Upstox first to search NIFTY 50 options.",
      });
    const expiry = url.searchParams.get("expiry");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry || ""))
      return send(res, 400, { error: "Choose a valid NIFTY 50 expiry date." });
    try {
      const contracts = await niftyContracts(expiry);
      const options = contracts
        .filter(
          (c) =>
            ["CE", "PE"].includes(c.instrument_type) &&
            Number.isFinite(Number(c.strike_price)),
        )
        .map((c) => ({
          strike: Number(c.strike_price),
          type: c.instrument_type,
        }))
        .sort((a, b) => a.strike - b.strike || a.type.localeCompare(b.type));
      return send(res, 200, { options });
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }
  if (url.pathname === "/api/upstox/nifty-suggestions") {
    if (!hasUpstoxToken())
      return send(res, 401, {
        error: "Connect Upstox first to find option premiums.",
      });
    const expiry = url.searchParams.get("expiry"),
      day = url.searchParams.get("day"),
      suffix = Number(url.searchParams.get("suffix")),
      type = url.searchParams.get("type");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(expiry || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day || "") ||
      !Number.isInteger(suffix) ||
      suffix < 0 ||
      suffix > 999 ||
      !["CE", "PE"].includes(type || "")
    )
      return send(res, 400, {
        error: "Enter a valid expiry, trading day, and strike suffix.",
      });
    try {
      return send(res, 200, await suggestOptions(expiry, day, suffix, type));
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }
  if (url.pathname === "/api/upstox/nifty-contract") {
    if (!hasUpstoxToken())
      return send(res, 401, {
        error: "Connect Upstox first to load NIFTY 50 option prices.",
      });
    const expiry = url.searchParams.get("expiry"),
      strike = Number(url.searchParams.get("strike")),
      type = url.searchParams.get("type");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(expiry || "") ||
      !Number.isInteger(strike) ||
      strike < 1 ||
      !["CE", "PE"].includes(type || "")
    )
      return send(res, 400, {
        error: "Enter a valid expiry date, strike, and CE/PE type.",
      });
    try {
      return send(res, 200, await resolveNiftyOption(expiry, strike, type));
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }
  if (url.pathname === "/api/upstox/history") {
    if (!hasUpstoxToken())
      return send(res, 401, {
        error: "Connect Upstox first to load option prices.",
      });
    const instrumentKey = url.searchParams.get("instrumentKey"),
      from = url.searchParams.get("from"),
      to = url.searchParams.get("to"),
      interval = url.searchParams.get("interval"),
      expired = url.searchParams.get("expired") === "true";
    if (
      !instrumentKey ||
      !instrumentKey.startsWith("NSE_FO|") ||
      instrumentKey.length > 160 ||
      !/^[\w| -]+$/.test(instrumentKey) ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(from || "") ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(to || "") ||
      !["1minute", "5minute", "15minute", "30minute", "day"].includes(
        interval || "",
      )
    )
      return send(res, 400, { error: "Invalid option history request." });
    try {
      return send(
        res,
        200,
        await upstoxHistory(instrumentKey, from, to, interval, expired),
      );
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }
  if (url.pathname === "/api/upstox/nifty-index-history") {
    if (!hasUpstoxToken())
      return send(res, 401, {
        error: "Connect Upstox first to load NIFTY 50 prices.",
      });
    const day = url.searchParams.get("day"),
      interval = url.searchParams.get("interval");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day || "") ||
      !["1minute", "5minute", "15minute", "30minute"].includes(interval || "")
    )
      return send(res, 400, { error: "Invalid NIFTY 50 chart request." });
    try {
      const [history, previous] = await Promise.all([
        upstoxHistory(
          "NSE_INDEX|Nifty 50",
          day,
          addCalendarDays(day, 1),
          interval,
          false,
        ),
        priorClose("NSE_INDEX|Nifty 50", day),
      ]);
      return send(res, 200, {
        ...history,
        previousClose: previous?.close ?? null,
      });
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }
  if (url.pathname === "/api/chart") {
    const symbol = url.searchParams.get("symbol"),
      period1 = url.searchParams.get("period1"),
      period2 = url.searchParams.get("period2"),
      interval = url.searchParams.get("interval") || "5m";
    if (
      !symbol ||
      !/^\d+$/.test(period1 || "") ||
      !/^\d+$/.test(period2 || "") ||
      !["1m", "5m", "15m", "30m", "1d"].includes(interval)
    )
      return send(res, 400, { error: "Invalid chart request" });
    const remote = new URL(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
    );
    remote.search = new URLSearchParams({
      period1,
      period2,
      interval,
      events: "history",
      includeAdjustedClose: "true",
    }).toString();
    try {
      const result = await getJson(remote, { "User-Agent": "Mozilla/5.0" });
      res.writeHead(result.status, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      return res.end(JSON.stringify(result.data));
    } catch {
      return send(res, 502, { error: "Market data service is unavailable" });
    }
  }
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1),
    file = path.join(root, requested);
  if (
    !file.startsWith(root) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  ) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css",
    ".js": "text/javascript",
  };
  res.writeHead(200, {
    "content-type": types[path.extname(file)] || "text/plain",
  });
  fs.createReadStream(file).pipe(res);
}
function handler(req, res) {
  const auth = String(req.headers.authorization || ""),
    match = auth.match(/^Bearer\s+(.+)$/i),
    token = match?.[1]?.trim();
  return requestToken.run(token || upstoxToken, () => routeRequest(req, res));
}
const server = http.createServer(handler);
if (require.main === module)
  server.listen(port, "0.0.0.0", () =>
    console.log(`StrikeFlow ready at http://localhost:${port}`),
  );
module.exports = { handler };
