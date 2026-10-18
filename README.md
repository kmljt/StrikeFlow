# StrikeFlow

**NIFTY 50 options P&L, made easier to read.** StrikeFlow is a browser-based tracker for building option baskets, comparing their intraday performance, and exploring how a basket’s estimated P&L changes across possible NIFTY closing prices.

It uses market data from Upstox. StrikeFlow does not place orders, connect to a trading account, or provide investment advice.

## What you can do

- Create multiple independent option baskets and give them custom names and bright accent colors.
- Add NIFTY 50 call and put positions, edit lot counts, and remove positions or baskets.
- Pick options manually or use **Smart pick** to choose an OTM distance and approximate budget and get a contract and lot-count estimate from previous-session closes.
- Compare selected baskets on synchronized NIFTY 50, basket P&L, and percentage-change charts.
- Hover any chart to inspect the same time across the other charts.
- See per-basket cost, current value, percentage change, max profit, max loss, drawdown, and profit kept.
- Open a basket’s scenario chart to explore estimated P&L across NIFTY closing prices. Zoom and pan along the price axis, with 10-point increments for the interactive readout.
- Choose a site-wide accent color and individual basket colors, or generate a random bright basket color.
- Select the trading day and market-data interval, and see closed or future dates marked in the date picker.

## Run StrikeFlow locally

### Requirements

- Node.js 18 or newer
- An Upstox API access token for market data

StrikeFlow has no package installation step or third-party runtime dependencies.

### Start the app

From the project folder, run:

```sh
node server.js
```

Then open <http://localhost:4173> in your browser. To use another port, set `PORT` before starting the server:

```sh
PORT=5000 node server.js
```

On first use, select **Connect Upstox**, paste your access token, and connect. The app validates the token before loading expiries and prices.

## Connect to Upstox

StrikeFlow asks for the access token in its **Connect Upstox** dialog. Paste the token directly into the app; do not put it in source code, a commit, a public issue, or a message. Tokens expire, so create a fresh one through Upstox when necessary.

The app keeps the token in that browser’s local storage and sends it to StrikeFlow’s API with each market-data request. The API forwards the token to Upstox to retrieve data. On a local Node.js run, the server also saves a private copy in `.upstox-token` so the local connection can be reused; this file is excluded from Git. On Vercel, the server does not persist the token: it is supplied by the browser for each request. Disconnecting removes the browser’s saved token and clears the local server copy when running locally.

## How the numbers are calculated

### Intraday P&L

For each option position, StrikeFlow compares the previous session’s closing premium with the selected day’s candle close:

```text
position P&L = (selected-day premium − previous-session premium) × lots × 65
basket P&L   = sum of the enabled positions’ P&L
```

The lot multiplier is currently 65. The displayed value follows the selected price interval and uses each candle’s **close** price. Brokerage, taxes, slippage, and other transaction costs are not included.

### Smart pick

In **Add Option**, choose **Smart pick**, select CE or PE, enter a strike offset in NIFTY points, and enter an approximate premium budget. Positive offsets target OTM strikes, zero targets ATM, and negative offsets target ITM strikes. Offsets snap to the nearest 50-point increment, and suggestions refresh automatically when the inputs change. StrikeFlow reads the previous-session NIFTY close, rounds the target to the nearest 50-point strike, and compares listed contracts within 100 points either side of the requested offset. For each contract it estimates the nearest whole-lot quantity to the budget, then ranks choices by how closely the estimated total matches the budget; distance from the requested offset breaks ties. The best fit and up to four alternatives are shown:

```text
estimated debit = previous-session option close × lots × 65
lots            = nearest whole-lot quantity to the requested premium budget
```

The estimate uses historical closes for the selected trading day; the live price may differ. Since lot size is indivisible, the estimate may be over budget; the UI shows the overage in red and remaining budget in green. Smart pick does not check liquidity, spreads, or execution prices, and does not submit an order. If no nearby option prices are available, try another expiry or trading day.

### Scenario P&L

Click a basket to open its scenario chart. It estimates that basket’s P&L for different NIFTY closing prices, anchored so the estimate at the actual close agrees with the tracked basket value. For options with time remaining, the estimate uses Black–Scholes with inferred market implied volatility when available; where volatility cannot be inferred, it uses a proxy based on the available basket positions. The model uses a 5.73% risk-free-rate proxy and 0% dividend yield. Legs at expiry use intrinsic value.

This chart is a model-based estimate, not a forecast or a guaranteed payoff. Its values depend on the model assumptions and available market data.

## Charts and interaction

- **NIFTY 50** plots the index through the selected trading day and marks the previous-session close. Values above and below that reference use the app’s positive and negative colors.
- **Basket P&L (₹)** compares each selected basket’s rupee P&L over the session.
- **Basket change (%)** compares percentage changes for the same baskets.
- Hovering a chart links the hover time across all three charts. The tooltip reports basket values or percentage changes at that time.
- Basket cards show each position’s entry reference, latest available close, cost, value, and P&L. Click a basket’s open body area to expand its scenario chart; click it again to collapse it.
- The scenario chart supports its zoom and pan buttons, pointer dragging, wheel zoom, and hover readout. **Reset** returns to a range of approximately 1,000 NIFTY points on either side of the actual close, subject to the available scenario range.

## Data availability and limitations

- Market data is retrieved from Upstox using the access token you provide. Availability depends on the token, Upstox API access, the chosen date, and the selected interval.
- Historical or expired option contracts may require Upstox Plus access. Upstox may also limit the history available for a contract.
- A market holiday, a future date, or an unavailable contract may have no candles to display.
- StrikeFlow currently uses NIFTY 50 options and a 65-unit lot multiplier.
- Basket definitions, basket colors, site accent, and interval preference are stored in the current browser. They are not synchronized between browsers.

## Deploy to Vercel

1. Push the repository to GitHub and import it into Vercel.
2. Deploy the repository root. The project is plain HTML, CSS, and JavaScript with Node.js API functions under `api/`; it does not need a frontend build command.
3. Open the deployed site over HTTPS and connect with an Upstox access token in the app.

The API functions receive the token in the request authorization header and forward it to Upstox. Vercel does not need a shared Upstox token environment variable, and users should enter their own token in their own browser.

## Project layout

```text
StrikeFlow/
├── index.html                 App structure and styles
├── app.js                     Basket state, chart rendering, and interactions
├── server.js                  Local server and shared market-data API handler
└── api/
    ├── chart.js               Chart data API route
    └── upstox/                Market data, contract lookup, and Smart pick API routes
```

## Troubleshooting

### The Upstox dialog keeps appearing

Refresh the page and reconnect with a current access token. If the token was rejected, confirm it is copied completely and that the associated Upstox app has the required API access.

### No expiries or prices appear

Check the connection status and the error shown by StrikeFlow. Try an active expiry and a trading day with available market data. Expired option history may require Upstox Plus.

### Basket changes are missing in another browser

Basket setup is stored locally in each browser. It is not part of the Upstox account and does not sync across devices.

## License

No license is currently specified for this repository. Contact the project owner before redistributing or reusing the code.
