# StrikeFlow — NSE options P&L tracker

A small local web app for comparing multiple NIFTY 50 options baskets. Each basket can contain multiple long option positions and has its own five-minute combined P&L line.

## Run

Requires Node.js 18 or newer. From this folder:

```sh
node server.js
```

Open <http://localhost:4173>.

## Options

Select an NIFTY 50 expiry, then search for a strike/CE/PE contract. Shorthand such as `400CE` matches strikes ending in 400 and ranks them by distance to the selected day’s previous NIFTY close. Create baskets and add options to the selected basket. Basket names and selections are saved in this browser. Lot size is fixed at 65. Open **Connect Upstox market data for NIFTY 50 options** and provide an Upstox API access token. The token is saved in a private `.upstox-token` file in this project directory and is excluded from version control. Disconnect removes the saved token. Access tokens expire and must be refreshed through Upstox.

The tracker uses five-minute contract candles and daily contract closes, including the previous session’s close. Option P&L is `(selected premium − previous-session premium) × lots × 65`. Brokerage, taxes, and slippage are excluded. Active option history is subject to Upstox account/API access. Upstox Plus is required for expired option contracts and history, and historical availability may be limited.
