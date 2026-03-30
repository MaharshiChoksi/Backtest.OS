# Backtesting Engine

## ❓What is This?

Ever wanted to test your trading ideas on historical data without risking real money? That's exactly what this project does. It's a browser-based backtesting platform that lets you replay market data, simulate trades, and see exactly how your strategy would've performed.

Think of it as a practice range for traders—load some historical price data, set up your trading rules, and watch how your trades would have played out over weeks, months, or even years.

**Current Version**: 2.0 (Now with simultaneous multi-timeframe analysis and rock-solid price precision)

---

## 🤔 What Can You Actually Do With It?

### 🗠 See Multiple Timeframes at Once
Analyze 1, 2, or 3 different timeframes simultaneously in a smart layout. Watch how your entries line up across daily, hourly, and minute charts—all updating together in real-time during playback. Each chart calculates its own technical indicators independently, giving you the full picture without jumping between tabs.

### 🔢 Play Back Historical Data
Load your CSV or Parquet data and replay it bar by bar. Play at normal speed, pause to analyze, jump ahead, or even go in slow-motion (0.5x) to catch exactly when your trade triggers. Keyboard shortcuts keep you hands-free (spacebar to play/pause, arrow keys to step through bars).

### ⌖ Enter and Track Trades
Click to enter trades with entry price, stop loss, and take profit levels. The platform shows you exactly where these levels sit on the chart with clean visual markers. If price hits your stop loss or take profit, the trade closes automatically—just like real trading. Your P&L updates in real-time as you play through data.

### 📔 Keep a Trade Journal  
Every trade gets logged in an automatically-syncing journal. Edit your stop losses or profit targets during the replay and watch the journal update instantly. The app calculates your profit/loss, win/loss ratio, and running account balance. Export everything to Excel for deeper analysis or just clear it and start over.

### 🖩 Dynamic Calculations
The math is precise: P&L accounts for spread, commissions, lot sizes, and the pips you win or lose. Your account balance tracks through every trade, so you see exactly how your strategy compounds over time.

### Technical Indicators On Demand
See EMA-20, EMA-50, Bollinger Bands, and RSI-14 on your charts. Toggle them on and off independently to keep things clean or get overwhelming detail—your choice.

### ☀️ / 🔅 Light & Dark Themes
Trading late night? Dark mode is there. Prefer daylight mode? Switch instantly. Your preference sticks around between sessions.

---

## Under the Hood

This is built with modern web technologies that make it fast and responsive:

- **React**: The JavaScript framework powering the UI
- **Vite**: Super-fast build and development tool
- **Zustand**: Dead-simple state management (I've split logic into 5 focused stores)
- **TradingView Lightweight Charts**: The charting library that renders everything smoothly
- **IndexedDB**: Browser-level database for caching data so you don't have to reload it every time
- **LocalStorage**: Saves your trade journal between sessions
- **Apache Arrow**: For parsing Parquet files if you want to use that format

---

## 📂 Project Structure

```
BackTestingEngine/
├── src/
│   ├── components/
│   │   ├── chart/
│   │   │   ├── ChartPane.jsx          (Single chart renderer)
│   │   │   ├── MultiChartPane.jsx     (1/2/3 chart layout + control)
│   │   │   └── RsiPane.jsx            (RSI chart display)
│   │   ├── layout/
│   │   │   ├── Workspace.jsx          (Main simulation container)
│   │   │   ├── Header.jsx             (Account info + PnL display)
│   │   │   └── SimBar.jsx             (Playback controls + progress)
│   │   ├── sidebar/
│   │   │   └── LeftSidebar.jsx        (Live position P&L)
│   │   ├── trading/
│   │   │   ├── TradeForm.jsx          (Entry/SL/TP input)
│   │   │   ├── OpenPositionCard.jsx   (Active trade display)
│   │   │   ├── JournalTab.jsx         (Trade journal table)
│   │   │   └── RightPanel.jsx         (Trading panel container)
│   │   ├── upload/
│   │   │   └── UploadScreen.jsx       (Data loading + config)
│   │   └── ui/
│   │       └── atoms.jsx              (Reusable UI components)
│   ├── hooks/
│   │   └── useSimEngine.js            (Core simulation engine)
│   ├── store/
│   │   ├── useTradeStore.js           (Trade state + P&L calc)
│   │   ├── useJournalStore.js         (Journal persistence)
│   │   ├── useSimStore.js             (Simulation state)
│   │   ├── useIndicatorStore.js       (Indicator toggles)
│   │   └── useThemeStore.js           (Theme state)
│   ├── utils/
│   │   ├── parser.js                  (CSV/Parquet parsing + caching)
│   │   ├── format.js                  (Date/number formatting)
│   │   ├── indicators.js              (EMA, RSI, BB calculations)
│   │   ├── tradingUtils.js            (Time conversion, bar aggregation)
│   │   └── symbolUtils.js             (Symbol lookup + defaults)
│   ├── constants/
│   │   └── index.js                   (App constants + colors)
│   ├── App.jsx                        (Main app router)
│   └── main.jsx                       (React entry point)
├── public/
│   ├── data/
│   │   └── AUDUSD_M1_*.csv            (Sample data)
│   └── tickersconfig.json             (Symbol database)
├── package.json
├── vite.config.js
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ with npm

### Installation for Feature Upgrade.

1. **Clone/Download Repository**
   ```bash
   cd BackTestingEngine
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Build for Production**
   ```bash
   npm run build
   ```

### First-Time Setup

1. **Load some data**: Click the upload button and pick a CSV or Parquet file with OHLCV (Open, High, Low, Close, Volume) data. The system figures out the columns automatically.

2. **Set up your symbol**: Enter the currency pair (like EURUSD) or the system looks it up for you. You need to tell it the pip size and how many decimals to use.

3. **Configure your account**: How much starting capital? What's the spread, commission, and leverage? Fill these in once.

4. **Pick your timeframes**: Want to see 1-minute, 5-minute, and hourly charts? Choose up to 3. Optional: filter to a specific date range if your dataset is huge.

5. **Hit "Start Backtest"**: The charts load, indicators populate, and you're ready to start clicking in trades.

---

## Data You Can Use

### File Types
The app accepts CSV files and Parquet files. It's smart about figuring out what column is what, even if they're separated by commas, tabs, or semicolons.

### What the Data Looks Like
You need columns for: time (dates), open, high, low, close, and volume. That's it.

> [!NOTE]  
> Here user can upload file with **date** and **time** columns seperately as well and our parser will auto detect it. 

Example:
```
date,time,open,high,low,close,volume
2020-01-02 00:00:00,0.6630,0.6650,0.6625,0.6645,50000
2020-01-02 01:00:00,0.6645,0.6660,0.6640,0.6655,45000
```

### Fair Warning on Large Datasets
I Recommend loading upto 1.25 million bars per chart.. It'll work, but don't go crazy—your browser still has limits.

---

## 🎮 Usage Guide

### Entering Trades

1. **Open Trade Panel** (right side)
2. **Enter Trade Details**:
   - **Type**: Long or Short
   - **Entry Price**: Current market price or custom
   - **Size**: Lot size (0.1 - 100 lots)
   - **Stop Loss**: Risk level
   - **Take Profit**: Target level (auto-calculates RR)
3. **Click "Open Trade"**
   - Trade appears on all charts with visual markers
   - Entry point marked with solid line
   - SL/TP marked with dashed lines

### During Simulation

- **Play**: Starts automatic bar-by-bar replay
- **Pause**: Freezes at current bar
- **Speed**: Adjust replay speed (0.5x to 50x)
- **Step**: Click step buttons to advance/rewind by 1 bar
- **Seek**: Click progress bar to jump to any point

### Modifying Trades

- **Edit SL/TP**: Click journal entry, update values → auto-syncs to trade
- **Edit Risk ($)**: Calculate new required SL automatically
- **Update Fees**: Adjust commission on per-trade basis

### Journal Management

The journal keeps records of every trade: entry time, price, size, P&L, whether you won or lost, and your running account balance. You can export it as a spreadsheet for deeper analysis. If you mess something up, hit Ctrl+Z to undo clearing entries.

---

## What's Next?

Down the road, I will be adding:
- More customizable indicators (pick your own periods for moving averages, etc.)
- Session boxes (mark time zones and session ranges on your charts)
- Support for backtesting multiple symbols at once
- A performance dashboard with more detailed statistics

But honestly, the current version does what most traders need right now.

---

## Performance

The app is built to be fast. The simulation engine runs every 16 milliseconds, which means you can replay data at 50x speed smoothly without the UI locking up. We're using some tricks like ref-based updates and lazy calculations to keep things snappy even with massive datasets.

If you're running typical trading data (a few hundred thousand bars), you won't notice any lag. Even at 1.25 million bars per chart, it stays responsive.

---

## 🐛 Known Limitations

- Can't display more than 3 charts at once (the rendering would get too heavy)
- 1.25 million bars (1M bars Recommended ~ Approx 2 years data @ 1Min TF)
- Right now you're working with one symbol at a time
- You have to pick all your timeframes upfront—you can't add a new one mid-backtest

---

## Privacy & Data

Everything stays on your machine. Your data never leaves your browser. We cache things locally so reopening the app is fast, and your trade journal is saved in browser storage so your work sticks around. You can clear the cache if you want a fresh start, and there's a button to wipe the journal anytime.

---

## Version History

**V2.0** (Right now)
- Multi-timeframe support (run 1, 2, or 3 charts together)
- Fixed all the timestamp precision issues
- Charts all sync up during playback
- Smart responsive layout adapts to how many charts you're viewing
- P&L calculations are rock-solid with proper lot-size scaling

**V1.5**
- Added the full trade journal with all the important stats
- You can now edit stop losses and take profits mid-backtest
- Running P&L shows in real-time

**V1.0**
- The original backtesting engine
- Single chart support
- Basic trade entry and P&L math

---

## Future Ideas
- Let traders customize which indicators they see with specific parameters
- Add more built-in indicators beyond the current EMA-20, EMA-50, and RSI
- Support backtesting across multiple symbols at once
- Create better performance reporting and analytics dashboards
- 

Right now though, the foundation is solid and does everything a trader needs for manual backtesting.

---

## 🤝 Contributing

Found a bug? Want to add a feature? Great! Here's what helps:
1. Test your changes thoroughly
2. Follow the existing code patterns (I've use Zustand for state and React hooks for logic)
3. Don't forget to add error handling if you're adding new features
4. Update the README if you add something significant

---

**Built by traders, for traders.** Happy testing!

---

**Project Lead**: [@maharshichoksi](https://github.com/MaharshiChokski)

**AI Assistance**: GitHub Copilot helped with documentation, architecture design, minor optimization on engine related to performance. 
