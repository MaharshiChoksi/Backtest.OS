# Backtesting Engine

## ❓What is This?

Ever wanted to test your trading ideas on historical data without risking real money? That's exactly what this project does. It's a browser-based backtesting platform that lets you replay market data, simulate trades, and see exactly how your strategy would've performed.
 
Think of it as a practice range for traders—load some historical price data, set up your trading rules, and watch how your trades would have played out over multi-timeframe.

---

## 🤔 What Can You Actually Do With It?

### 🗠 See Multiple Timeframes at Once
Analyze 1, 2, or 3 different timeframes simultaneously in a smart layout. Watch how your entries line up across minute to 4 Hour charts—all updating together in real-time during playback. Each chart calculates its own indicators independently, giving you the full picture without jumping between tabs.

**Smart Aggregation**: Upload 1-minute data and the engine automatically aggregates to 5-min, 15-min, 1-hour, or any higher timeframe you select. Each aggregated bar shows proper OHLCV data with correct time boundaries.

### 🔢 Play Back Historical Data
Load your CSV or Parquet data and replay it bar by bar. Play at normal speed, pause to analyze, jump ahead, or speed through (up to 50x or MAX). Keyboard shortcuts keep you hands-free (spacebar to play/pause, arrow keys to step through bars).

**Speed Options**: 1× (real-time), 5×, 10×, 50×, MAX (instant)

**Future Data Prevention**: Higher timeframe bars don't appear until they're fully complete—no peeking ahead at forming candles.

### ⌖ Enter and Track Trades
Click to enter trades with entry price, stop loss, and take profit levels. The platform shows you exactly where these levels sit on the chart with clean visual markers. If price hits your stop loss or take profit, the trade closes automatically—just like real trading. Your P&L updates in real-time as you play through data.

### 📔 Keep a Trade Journal  
Every trade gets logged in an automatically-syncing journal. Edit your stop losses or profit targets during the replay and watch the journal update instantly. The app automatically calculates risk based on your SL, P&L (accounting for spread), win/loss ratio, and running account balance. Export everything to Excel for deeper analysis or just clear it and start over.

**Journal Features**:
- **Risk Calculation**: Automatically computed from entry - SL difference, updated whenever SL/TP changes
- **Real-Time P&L**: Floating P&L for open positions updates every tick, accounting for spread cost
- **Cumulative Balance**: Tracks account balance across trades (Starting Balance + All Closed Trade P&L)
- **Multi-Position Balance**: When multiple trades are open, all entries show the correct cumulative balance
- **Editable Fields**: Customize session, strategy, macro regime, analysis timeframe, and trading notes
- **Export to Excel**: Download all trades as TSV for external analysis

### 🖩 Dynamic Calculations
The math is precise: P&L accounts for spread, commissions, lot sizes, and the pips you win or lose. Your account balance tracks through every trade, so you see exactly how your strategy compounds over time.

Every trade's entry price reflects the actual bid/ask spread you'd face in real trading—when you buy, you pay the ask (close + spread). When you sell, you receive the bid (close - spread). Your P&L automatically deducts this realistic spread cost on both entry and exit, so your backtest results match real-world trading conditions.

### Technical Indicators On Demand
Configure up to **3 EMA (Exponential Moving Average)** lines with custom periods and colors. Toggle **Bollinger Bands** with adjustable period and standard deviation. Add **RSI (Relative Strength Index)** with your preferred period. All indicators can be enabled/disabled and configured before starting your backtest—tailor the charts exactly how you want them.

**Indicator Configuration Step**:
After selecting your symbol and before configuring your account, you'll now see an **Indicators** step where you can:
- **EMA**: Enable/disable and set up to 3 custom periods (e.g., 9, 21, 50) with custom colors
- **Bollinger Bands**: Enable/disable with adjustable period and standard deviation
- **RSI**: Enable/disable with custom period (default 14)

Your indicator settings are applied when the backtest starts and displayed on all selected timeframes.

### ☀️ / 🔅 Light & Dark Themes
Trading late night? Dark mode is there. Prefer daylight mode? Switch instantly. Your preference sticks around between sessions.

### ⏹️ Stop & Analyze Mode
When your backtest is done (or anytime), click the red **"Stop & Analyze"** button. This clears all chart data from memory (preventing browser crashes) while keeping your journal and trade history intact. You get a clean, full-screen analysis view for reviewing performance without the memory overhead of charts.

**Quick Navigation**: Click the BACKTEST.OS logo anytime to return to the upload screen and start a new backtest.

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
│   ├── App.jsx                    (Main app router)
│   ├── main.jsx                   (React entry point)
│   ├── components/
│   │   ├── analysis/
│   │   │   ├── AnalysisScreen.jsx  (Post-backtest analysis view)
│   │   │   └── AnalysisSidebar.jsx (Analysis tools sidebar)
│   │   ├── chart/
│   │   │   ├── ChartPane.jsx      (Single chart renderer)
│   │   │   ├── MultiChartPane.jsx (1/2/3 chart layout + controls)
│   │   │   └── RsiPane.jsx        (RSI chart display)
│   │   ├── journal/
│   │   │   └── JournalRoute.jsx   (Journal routing logic)
│   │   ├── layout/
│   │   │   ├── Workspace.jsx       (Main simulation container)
│   │   │   ├── Header.jsx         (Account info + PnL display)
│   │   │   └── SimBar.jsx         (Playback controls + progress)
│   │   ├── metrics/
│   │   │   ├── MetricsTab.jsx      (Performance metrics display)
│   │   │   └── RadarChart.jsx      (Radar chart for metrics)
│   │   ├── sidebar/
│   │   │   └── LeftSidebar.jsx     (Live position P&L + drawing tools)
│   │   ├── trading/
│   │   │   ├── TradeForm.jsx       (Entry/SL/TP input)
│   │   │   ├── OpenPositionCard.jsx (Active trade display)
│   │   │   ├── JournalTab.jsx      (Trade journal table)
│   │   │   └── RightPanel.jsx      (Trading panel container)
│   │   ├── ui/
│   │   │   └── atoms.jsx           (Reusable UI components)
│   │   └── upload/
│   │       └── UploadScreen.jsx     (Data loading + configuration)
│   ├── constants/
│   │   └── index.js                (App constants + color schemes)
│   ├── hooks/
│   │   └── useSimEngine.js         (Core simulation engine)
│   ├── store/
│   │   ├── useTradeStore.js        (Trade state + P&L calculations)
│   │   ├── useJournalStore.js      (Journal persistence)
│   │   ├── useSimStore.js          (Simulation state)
│   │   ├── useIndicatorStore.js    (Indicator configuration)
│   │   ├── useThemeStore.js        (Theme state)
│   │   └── useDrawingStore.js      (Drawing tools state)
│   └── utils/
│       ├── parser.js               (CSV/Parquet parsing + IndexedDB caching)
│       ├── format.js               (Date/number formatting)
│       ├── indicators.js           (EMA, RSI, Bollinger Bands calculations)
│       ├── tradingUtils.js         (Time conversion, bar aggregation)
│       ├── symbolUtils.js          (Symbol lookup + defaults)
│       ├── journalImport.js        (Journal import/export utilities)
│       └── metrics.js             (Performance metrics calculations)
├── public/
│   ├── csvParserWorker.js         (Web Worker for CSV parsing)
│   ├── data/
│   │   └── AUDUSD_M1_202001020000_202603272356.csv  (Sample 1-minute data)
│   └── tickersconfig.json         (Symbol database)
├── index.html                     (HTML entry point)
├── .gitignore                     (Git Ignore file to ignore pushing certain files)
├── package.json                   (Node.js dependencies)
├── package-lock.json              (Dependency lock file)
├── vite.config.js                 (Vite build configuration)
└── README.md                      (Project documentation)
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ with npm

### Installation for Feature Upgrade.

1. **Clone/Download Repository**
   ```bash
   cd Backtest.OS
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
date,       time,     open,   high,   low,    close,  tickvol,  vol,    spread
2020-01-02, 00:00:00, 0.6630, 0.6650, 0.6625, 0.6645, 15000,    5000,   5
2020-01-02, 01:00:00, 0.6645, 0.6660, 0.6640, 0.6655, 40050,    12000,  2
```

### Fair Warning on Large Datasets
I Recommend loading upto 1 million bars per chart.. It'll work, but don't go crazy—your browser still has limits.

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

### Using Drawing Tools
 
1. **Open the Tools tab** in the left sidebar
2. **Select a tool** — it highlights to show it's active, and the "Active Tool" label updates
3. **Click on the chart** to place anchor points:
   - Single-anchor tools (Horizontal Line, Vertical Line): one click
   - Two-anchor tools (Trend Line, Rectangle, Fib Retracement): two clicks
   - Three-anchor tools (Andrews Pitchfork, Fib Extension): three clicks
4. **A preview follows your cursor** between anchor placements so you can see what you're drawing
5. **Press Escape** to cancel a drawing before it's complete
6. **Click "Cursor"** in the General section to go back to normal chart navigation
**Managing existing drawings**:
- Switch to the **Drawings** tab in the left sidebar to see all placed drawings
- Click any drawing in the list to select (and highlight) it on the chart
- Click the × button next to a drawing to delete it
- **Clear All** removes everything from all charts at once

### Journal Management

The journal keeps records of every trade: entry time, price, size, P&L, whether you won or lost, and your running account balance. You can export it as a spreadsheet for deeper analysis. If you mess something up, hit Ctrl+Z to undo clearing entries.

---

## What's Next?

Down the road, I will be adding:
- Session boxes (mark time zones and session ranges on your charts)
- Support for backtesting multiple symbols at once
- More built-in indicators (Swing High/Low, MACD, etc.)
- May add Economic data indicator for the selected period.

But honestly, the current version does what most traders need right now.

---

## Performance

The app is built to be fast. The simulation engine runs every 16 milliseconds, which means you can replay data at 50x speed smoothly without the UI locking up. We're using some tricks like ref-based updates and lazy calculations to keep things snappy even with massive datasets. And thanks to the TradingView's lightweight chart library for chart engine.

**Data Loading Optimizations**:
- **Web Worker Parsing**: Large CSV files (50k+ rows) are parsed in a background thread, keeping the UI responsive
- **Progress Bar**: Visual feedback during file loading and processing
- **Binary IndexedDB Storage**: Market data cached as binary Float64Array (~10-50x faster than JSON)
- **Chunked Processing**: Data processed in stages with progress updates

**Memory Management**:
- **Analysis Mode**: Stop backtesting to clear chart data while keeping journal for performance review
- **Efficient State Updates**: Ref-based hot loop prevents React render starvation at high speeds

---

## 🐛 Known Limitations

- Can't display more than 3 charts at once (the rendering would get too heavy)
- 1 million bars (1M bars Recommended ~ Approx 1.5 years data @ 1Min TF)
- Right now you're working with one symbol at a time
- You have to pick all your timeframes upfront—you can't add a new one mid-backtest
- Drawings are not persisted between sessions — they live in memory and reset on page reload

---

## 📊 How Spread Works

The backtester accounts for realistic bid/ask spread across the entire system:

**On Entry**:
- **BUY**: You pay the ASK price = Close + (Spread ÷ 2)
- **SELL**: You receive the BID price = Close - (Spread ÷ 2)

**On Exit** (Closing Manually or via SL/TP):
- **LONG**: You receive the BID price = Close - (Spread ÷ 2) [receive less]
- **SHORT**: You pay the ASK price = Close + (Spread ÷ 2) [pay more]

**Where It Applies**:
- Trade entry prices in position form
- All P&L calculations (position cards, header, sidebar, journal)
- Floating P&L updates real-time accounting for spread cost
- Journal entry displays realistic bid/ask prices

This means your backtest matches real trading conditions—spread cost is deducted from both entry and exit, making your results truly representative of live trading.

Everything stays on your machine. Your data never leaves your browser. We cache things locally so reopening the app is fast, and your trade journal is saved in browser storage so your work sticks around. You can clear the cache if you want a fresh start, and there's a button to wipe the journal anytime.

---

## Version History

**V4.0** (Current)
- **Multi Chart RSI**: Configure up to 3 RSI charts with custom periods
- **68 Chart Drawing Tools**: Full suite of drawing tools powered by `lightweight-charts-drawing`
  - Lines, Channels, Pitchforks, Fibonacci, Gann, Shapes, Annotations, Forecasting tools
  - Rubber-band preview follows cursor between anchor placements
  - Escape key cancels in-progress drawings
  - Multi-timeframe support: each chart has its own independent drawing layer
- **Tools Tab**: New tab in left sidebar to browse and select drawing tools by category
- **Drawings Manager Tab**: New tab to view, select, and delete all placed drawings
- **Per-chart DrawingManager isolation**: Fixed architecture so multi-chart mode doesn't cause charts to destroy each other's drawing state on mount/unmount

**V3.2**
- **Customizable Indicators**: Configure up to 3 EMA lines with custom periods and colors
- **Indicator Configuration Step**: New step in upload flow to configure all indicators before backtest
- **Bollinger Bands**: Configurable period and standard deviation
- **RSI**: Configurable period (default 14)
- All indicators can be enabled/disabled and configured per-user preference

**V3.1**
- **Timezone Selection**: Configure the timezone of your data source for accurate session detection
  - MT4/MT5 brokers often use broker server time (GMT+2 or GMT+3) rather than UTC
  - Select your data's timezone during configuration to enable future session-based features
  - Supports 40+ timezones worldwide
  - Bars are internally stored in UTC for consistent processing
  - Timezone info stored with symbol config for session-based indicators (London, NY, Tokyo sessions)
- **Early Termination Optimization**: Large file processing now stops early when bar limit is reached
  - Web Worker and main-thread paths both support early termination
  - Won't process millions of unnecessary rows when MAX_BARS (1M) limit is hit
  - Significant performance improvement for large datasets

**V3.0**
- **Web Worker Data Processing**: Large CSV files parsed in background thread—no UI lag
- **Data Parsing Progress Bar**: Visual feedback during file upload and processing
- **Binary IndexedDB Cache**: ~10-50x faster cache loads using Float64Array storage
- **Fixed Timeframe Aggregation**: 1-minute data properly aggregates to M5, M15, H1, etc.
- **Future Data Prevention**: Higher timeframe bars only appear when fully complete
- **Stop & Analyze Mode**: Red button clears charts but keeps journal for memory-efficient analysis
- **Multi-Position Balance Fix**: Journal shows correct cumulative balance with multiple open trades

**V2.5**
- Multi Timeframe data aggregation
- Improved response time for simulation.
- Detecting and preventing unknown selection of timeframe.

**V2.0** 
- Multi-timeframe support (run 1, 2, or 3 charts together)
- Fixed all the timestamp precision issues
- Charts all sync up during playback
- Smart responsive layout adapts to how many charts you're viewing
- P&L calculations are rock-solid with proper lot-size scaling
- **Spread Applied System-Wide**: Spread is now correctly applied to entry prices, exit prices, and all P&L calculations across all displays:
  - Entry prices reflect actual bid/ask prices traders would pay
  - P&L accounts for the cost of spread on both entry and exit
  - Floating P&L in journal shows realistic P&L after spread deduction
  - Position cards, header, sidebar all display spread-adjusted P&L
- **Journal Balance Tracking**: Account balance now properly tracks across multiple trades
  - Balance = Starting Balance + Cumulative P&L from all closed trades
  - Correctly reflects post-trade balance for next trades
- **Dynamic Risk Calculation**: Risk($) auto-calculates when SL/TP are set or modified
  - Risk = |entry - SL| / pip_size × pip_value × lot_size
  - Recalculates in real-time when editing SL in journal
- **Real-Time Journal PnL**: Open positions show floating P&L that updates every tick
  - Accounts for spread on potential market exit
  - Includes all fees and commissions

**V1.5**
- Added the full trade journal with all the important stats
- You can now edit stop losses and take profits mid-backtest
- Running P&L shows in real-time

**V1.0**
- The original backtesting engine
- Single chart support
- Basic trade entry and P&L math

---

## 🤝 Contributing

Found a bug? Want to add a feature? Great! Here's what helps:
1. Test your changes thoroughly
2. Follow the existing code patterns (I've use Zustand for state and React hooks for logic)
3. Don't forget to add error handling if you're adding new features
4. Update the README if you add something significant

---

## Authors & Acknowledgements

**Project Lead**: [@maharshichoksi](https://github.com/MaharshiChokski)

**AI Assistance**: GitHub Copilot helped with documentation, architecture design, minor optimization on engine related to performance. 
