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
function getJson(url, headers = {}, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, (upstream) => {
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
      });
    request.setTimeout(timeoutMs, () =>
      request.destroy(new Error("Upstox did not respond in time. Try again shortly.")),
    );
    request.on("error", (error) =>
      reject(
        error.message.includes("did not respond in time")
          ? error
          : new Error("Could not connect to the data provider."),
      ),
    );
  });
}
async function upstoxGet(url, timeoutMs = 12000) {
  const token = requestToken.getStore() || upstoxToken;
  if (!token) throw new Error("Connect Upstox first to load market data.");
  const result = await getJson(
    url,
    {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "StrikeFlow/1.0",
    },
    timeoutMs,
  );
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
function expiredInstrumentKey(instrumentKey, expiry) {
  if (!expiry || instrumentKey.split("|").length > 2) return instrumentKey;
  const [year, month, day] = expiry.split("-");
  return `${instrumentKey}|${day}-${month}-${year}`;
}
async function upstoxHistory(
  instrumentKey,
  from,
  to,
  interval,
  isExpired,
  expiry,
) {
  const encoded = encodeURIComponent(instrumentKey);
  const endpoint = from === todayIST() && interval !== "day"
      ? new URL(
          `https://api.upstox.com/v3/historical-candle/intraday/${encoded}/minutes/${Number.parseInt(interval, 10)}`,
        )
    : interval === "day"
      ? upstoxURL(`/historical-candle/${encoded}/day/${to}/${from}`)
      : new URL(
          `https://api.upstox.com/v3/historical-candle/${encoded}/minutes/${Number.parseInt(interval, 10)}/${to}/${from}`,
        );
  let candles = [];
  try {
    const data = await upstoxGet(endpoint);
    candles = data?.candles || [];
  } catch (error) {
    if (!isExpired && interval !== "1minute") throw error;
  }
  if (candles.length) return { candles };

  // V2 can still have 1-minute candles when V3 has no rows for a contract.
  if (interval === "1minute" && from !== todayIST()) {
    try {
      const legacy = await upstoxGet(
        upstoxURL(`/historical-candle/${encoded}/${interval}/${to}/${from}`),
      );
      candles = legacy?.candles || [];
      if (candles.length) return { candles };
    } catch (error) {
      if (!isExpired) throw error;
    }
  }
  if (!isExpired) return { candles: [] };
  const expiredData = await upstoxGet(
    upstoxURL(
      `/expired-instruments/historical-candle/${encodeURIComponent(expiredInstrumentKey(instrumentKey, expiry))}/${interval}/${to}/${from}`,
    ),
  );
  return { candles: expiredData?.candles || [] };
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
  const params = { instrument_key: "NSE_INDEX|Nifty 50", expiry_date: expiry };
  try {
    const currentContracts = await upstoxGet(upstoxURL("/option/contract", params));
    if (currentContracts?.length || !expired) return currentContracts || [];
  } catch (error) {
    if (!expired) throw error;
  }
  return (await upstoxGet(upstoxURL("/expired-instruments/option/contract", params))) || [];
}
async function priorClose(instrumentKey, day, expired = false, expiry) {
  const from = new Date(`${day}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 14);
  const fromDay = from.toISOString().slice(0, 10),
    encoded = encodeURIComponent(instrumentKey);
  const candlesFor = (data) => (data?.candles || [])
      .map((c) => ({ date: String(c[0]).slice(0, 10), close: Number(c[4]) }))
      .filter((c) => c.date < day && Number.isFinite(c.close))
      .sort((a, b) => a.date.localeCompare(b.date));
  try {
    const data = await upstoxGet(
      upstoxURL(`/historical-candle/${encoded}/day/${addCalendarDays(day, 1)}/${fromDay}`),
    );
    const prior = candlesFor(data).at(-1);
    if (prior || !expired) return prior || null;
  } catch (error) {
    if (!expired) throw error;
  }
  const data = await upstoxGet(
    upstoxURL(
      `/expired-instruments/historical-candle/${encodeURIComponent(expiredInstrumentKey(instrumentKey, expiry))}/day/${addCalendarDays(day, 1)}/${fromDay}`,
    ),
  );
  return candlesFor(data).at(-1) || null;
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
async function smartPickOption(expiry, day, otmPoints, budget, type) {
  const cacheKey = ["smart", expiry, day, otmPoints, budget, type].join("|");
  const cached = suggestionCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const [reference, contracts] = await Promise.all([
    priorClose("NSE_INDEX|Nifty 50", day),
    niftyContracts(expiry),
  ]);
  if (!reference)
    throw new Error(
      "Could not find NIFTY 50’s previous-session close for that day.",
    );

  const step = 50;
  const rawTarget =
    type === "CE"
      ? reference.close + otmPoints
      : reference.close - otmPoints;
  const targetStrike = Math.round(rawTarget / step) * step;
  const candidates = contracts
    .filter((contract) => {
      const strike = Number(contract.strike_price);
      if (contract.instrument_type !== type || !Number.isFinite(strike))
        return false;
      const actualOTM =
        type === "CE" ? strike - reference.close : reference.close - strike;
      return actualOTM >= otmPoints - 100 &&
        actualOTM <= otmPoints + 100;
    })
    .sort((a, b) =>
      Math.abs(Number(a.strike_price) - targetStrike) -
      Math.abs(Number(b.strike_price) - targetStrike),
    );

  const expired = expiry < todayIST();
  const pricedCandidates = await Promise.all(
    candidates.map(async (contract) => ({
      contract,
      premium: await priorClose(contract.instrument_key, day, expired, expiry),
    })),
  );
  const choices = [];
  for (const { contract, premium } of pricedCandidates) {
    if (!premium || premium.close <= 0) continue;
    const costPerLot = premium.close * 65;
    const lots = Math.max(1, Math.round(budget / costPerLot));
    const strike = Number(contract.strike_price);
    const estimatedCost = costPerLot * lots;
    choices.push({
      type,
      strike,
      lots,
      premiumClose: premium.close,
      premiumDate: premium.date,
      underlyingClose: reference.close,
      underlyingDate: reference.date,
      targetStrike,
      requestedOTM: otmPoints,
      actualOTM: Math.round(
        type === "CE"
          ? strike - reference.close
          : reference.close - strike,
      ),
      budget,
      estimatedCost,
      remainingBudget: budget - estimatedCost,
      budgetGap: Math.abs(budget - estimatedCost),
      otmGap: Math.abs(
        (type === "CE" ? strike - reference.close : reference.close - strike) -
          otmPoints,
      ),
    });
  }

  if (choices.length) {
    const ranked = [...choices].sort(
      (a, b) => a.budgetGap - b.budgetGap || a.otmGap - b.otmGap,
    );
    const [preferred, ...otherChoices] = ranked;
    const serializeChoice = ({ budgetGap, otmGap, ...choice }) => choice;
    const value = serializeChoice(preferred);
    value.alternatives = otherChoices.slice(0, 4).map(serializeChoice);
    value.adjustedForBudget = value.strike !== targetStrike;
    suggestionCache.set(cacheKey, {
      value,
      expires: Date.now() + 120000,
    });
    return value;
  }

  throw new Error(
    "No option prices were available within 100 points of your OTM target. Try another expiry or trading day.",
  );
}
function todayIST() {
  return dateIST(new Date());
}
function dateIST(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).formatToParts(value);
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
        expiredAvailable = true,
        expiredError = "";
      try {
        expired =
          (await upstoxGet(
            upstoxURL("/expired-instruments/expiries", {
              instrument_key: "NSE_INDEX|Nifty 50",
            }),
          5000,
          )) || [];
      } catch (error) {
        expiredAvailable = false;
        expiredError = error.message;
      }
      const dates = [
        ...new Set(
          [...active.map((c) => c.expiry), ...expired].filter((x) =>
            /^\d{4}-\d{2}-\d{2}$/.test(x || ""),
          ),
        ),
      ].sort();
      return send(res, 200, {
        expiries: dates,
        expiredAvailable,
        expiredError,
      });
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }
  if (url.pathname === "/api/upstox/nifty-options") {
    if (!hasUpstoxToken())
      return send(res, 401, {
        error: "Connect Upstox first to search NIFTY 50 options.",
      });
    const expiry = url.searchParams.get("expiry"),
      day = url.searchParams.get("day");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(expiry || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day || "")
    )
      return send(res, 400, { error: "Choose a valid NIFTY 50 expiry and trading day." });
    try {
      const [contracts, reference] = await Promise.all([
        niftyContracts(expiry),
        priorClose("NSE_INDEX|Nifty 50", day),
      ]);
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
      return send(res, 200, {
        options,
        referenceClose: reference?.close ?? null,
        referenceDate: reference?.date ?? null,
      });
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }
  if (url.pathname === "/api/upstox/nifty-option-quote") {
    if (!hasUpstoxToken())
      return send(res, 401, {
        error: "Connect Upstox first to load option prices.",
      });
    const expiry = url.searchParams.get("expiry"),
      day = url.searchParams.get("day"),
      type = url.searchParams.get("type"),
      strike = Number(url.searchParams.get("strike"));
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(expiry || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day || "") ||
      !["CE", "PE"].includes(type || "") ||
      !Number.isFinite(strike)
    )
      return send(res, 400, { error: "Choose a valid NIFTY option." });
    try {
      const contracts = await niftyContracts(expiry),
        contract = contracts.find((item) =>
          item.instrument_type === type &&
          Number(item.strike_price) === strike,
        );
      if (!contract)
        return send(res, 404, { error: "No listed contract matches this option." });
      const premium = await priorClose(
        contract.instrument_key,
        day,
        expiry < todayIST(),
        expiry,
      );
      let currentPrice = null;
      if (day === todayIST()) {
        const quoteURL = new URL("https://api.upstox.com/v3/market-quote/ohlc");
        quoteURL.search = new URLSearchParams({
          instrument_key: contract.instrument_key,
          interval: "I1",
        }).toString();
        const quoteData = await upstoxGet(
            quoteURL,
          ),
          quote = Object.values(quoteData || {}).find(
            (item) => item?.instrument_token === contract.instrument_key,
          ) || Object.values(quoteData || {})[0],
          liveCandleTime = Number(quote?.live_ohlc?.ts),
          tradedToday = Number.isFinite(liveCandleTime) &&
            liveCandleTime > 0 &&
            dateIST(new Date(liveCandleTime)) === day,
          lastPrice = Number(quote?.last_price);
        if (tradedToday && Number.isFinite(lastPrice) && lastPrice > 0) {
          currentPrice = lastPrice;
        }
      }
      return send(res, 200, {
        premiumPrice: premium?.close ?? null,
        premiumDate: premium?.date ?? null,
        currentPrice,
        currentDate: currentPrice === null ? null : day,
        lotSize: Number(contract.lot_size) || 65,
      });
    } catch (error) {
      return send(res, 502, { error: error.message });
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
  if (url.pathname === "/api/upstox/nifty-smart-pick") {
    if (!hasUpstoxToken())
      return send(res, 401, {
        error: "Connect Upstox first to find a budget-fit option.",
      });
    const expiry = url.searchParams.get("expiry"),
      day = url.searchParams.get("day"),
      otmPoints = Number(url.searchParams.get("otmPoints")),
      budget = Number(url.searchParams.get("budget")),
      type = url.searchParams.get("type");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(expiry || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day || "") ||
      expiry < day ||
      !Number.isInteger(otmPoints) ||
      otmPoints < -10000 ||
      otmPoints > 10000 ||
      !Number.isFinite(budget) ||
      budget < 1 ||
      budget > 10000000 ||
      !["CE", "PE"].includes(type || "")
    )
      return send(res, 400, {
        error: "Enter a valid expiry, trading day, OTM distance, option type, and budget.",
      });
    try {
      const normalizedOTM = Math.max(-10000, Math.min(10000, Math.round(otmPoints / 50) * 50));
      return send(
        res,
        200,
        await smartPickOption(expiry, day, normalizedOTM, budget, type),
      );
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }
  if (url.pathname === "/api/upstox/nifty-simple-strangle") {
    if (!hasUpstoxToken())
      return send(res, 401, {
        error: "Connect Upstox first to find NIFTY 50 option strikes.",
      });
    const expiry = url.searchParams.get("expiry"),
      day = url.searchParams.get("day"),
      otmPoints = Number(url.searchParams.get("otmPoints")),
      lots = Number(url.searchParams.get("lots"));
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(expiry || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day || "") ||
      expiry < day ||
      !Number.isInteger(otmPoints) ||
      otmPoints < -10000 ||
      otmPoints > 10000 ||
      otmPoints % 50 !== 0 ||
      !Number.isInteger(lots) ||
      lots < 1 ||
      lots > 10000
    )
      return send(res, 400, {
        error: "Enter a valid expiry, strike offset, and lot count.",
      });
    try {
      const [reference, contracts] = await Promise.all([
        priorClose("NSE_INDEX|Nifty 50", day),
        niftyContracts(expiry),
      ]);
      if (!reference)
        throw new Error("Could not find NIFTY 50’s previous-session close for that day.");
      const expired = expiry < todayIST();
      const pickLeg = async (type) => {
        const target = Math.round(
          (reference.close + (type === "CE" ? otmPoints : -otmPoints)) / 50,
        ) * 50;
        const contract = contracts.find((item) =>
          item.instrument_type === type &&
          Number(item.strike_price) === target,
        );
        if (!contract)
          throw new Error(`No ${type === "CE" ? "call" : "put"} contract is listed at ${target}.`);
        const premium = await priorClose(contract.instrument_key, day, expired, expiry),
          strike = Number(contract.strike_price),
          actualOTM = Math.round(type === "CE"
            ? strike - reference.close
            : reference.close - strike);
        return {
          type,
          strike,
          lots,
          actualOTM,
          premiumClose: premium?.close ?? null,
          premiumDate: premium?.date ?? null,
          estimatedCost: premium?.close > 0
            ? premium.close * (Number(contract.lot_size) || 65) * lots
            : null,
        };
      };
      const [call, put] = await Promise.all([pickLeg("CE"), pickLeg("PE")]);
      return send(res, 200, {
        expiry,
        day,
        otmPoints,
        referenceClose: reference.close,
        referenceDate: reference.date,
        call,
        put,
        estimatedCost: call.estimatedCost === null || put.estimatedCost === null
          ? null
          : call.estimatedCost + put.estimatedCost,
      });
    } catch (error) {
      return send(res, 502, { error: error.message });
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
      expiry = url.searchParams.get("expiry"),
      expired = url.searchParams.get("expired") === "true";
    if (
      !instrumentKey ||
      !instrumentKey.startsWith("NSE_FO|") ||
      instrumentKey.length > 160 ||
      !/^[\w| -]+$/.test(instrumentKey) ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(from || "") ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(to || "") ||
      (expiry && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(expiry)) ||
      !["1minute", "5minute", "15minute", "30minute", "day"].includes(
        interval || "",
      )
    )
      return send(res, 400, { error: "Invalid option history request." });
    try {
      return send(
        res,
        200,
        await upstoxHistory(instrumentKey, from, to, interval, expired, expiry),
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
    "cache-control": "no-store",
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
