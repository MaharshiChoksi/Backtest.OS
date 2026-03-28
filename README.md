# Backtesting Engine V1.0

A full-scale backtesting engine web application featuring a React-based front end integrated with a FastAPI-powered backend. The backend efficiently handles concurrent requests for charting, technical indicators, and price data, while optimizing performance and responsiveness. It also tracks user interactions (such as cursor movement) in real time and manages a database for trade journaling and price data caching, with automated cleanup processes to maintain system stability and prevent crashes.

---

## Features

- Multi chart tester (max 4)
- Bar replay mode
- Speed control bar
- Data caching
- Journaling trades while simulating trades
- Journal export options
- Trade/Position Management.
- Realtime Insights
- Light/dark mode
- Cross platform webapp

> [!NOTE]  
> All data is stored locally so even after crashout the system can restore journal from cache data. (Cache can be cleaned at any time)

---
## Deployment

1. Copy/clone repo locally.

2. Go to **backtest** directory install python libraries from requirements.txt

3. Go to **frontend** directory install packages from **package.json** using npm.

4. Run front end in terminal
    ```bash
    npm run prod
    ```

5. In other terminal run backend
    ```python
    python ./backend/main.py
    ```

6. On the webapp. Load data first from MT5 for all tickers.
    > [!WARNING]  
    > For multi-ticker backtesting user have to upload same start and end date for every ticker. 

7. Wait for backend to connect to fastapi (Connection status visible on top right corner).

8. And you are ready to simulate trade.

9. Interface is similar as of Tradingview as we have used tradingview lightweights chart.

---

## Tech Stack

**Client/Frontend:**  
    - React  
    - CSS

**Server:**  
    - Python  
    - FastAPI  
    - duckdb  
    - pandas  
    - numpy

---

## Authors
- [@maharshichoksi](https://github.com/MaharshiChoksi)

