# Event Graph - All UI Features

This document lists all available UI tabs and features in the Event Graph platform.

## 🎯 Available Pages/Tabs

### 1. **Home Dashboard** (`/`)
- Platform overview
- Quick stats (total markets, volume, opportunities)
- Recent activity feed
- Quick access to key features

### 2. **Events** (`/events`)
- Browse all events across platforms
- Filter by platform (Polymarket, Kalshi, Limitless, OpinionTrade)
- Filter by category
- Sort by volume, date, popularity
- Search functionality
- **Top 500 markets optimized**

### 3. **Event Analytics** (`/event/:platform/:eventId`)
- Deep dive into specific event
- Price history charts
- Volume analysis
- Market participants
- Related markets
- AI insights

### 4. **Screener** (`/screener`)
- Advanced market screening
- Custom filters (volume, spread, date range)
- Save custom screens
- Export results

### 5. **Arbitrage** (`/arbitrage`)
- Cross-venue arbitrage opportunities
- Real-time spread detection
- Profitability calculator (includes fees)
- Execution guidance
- Historical opportunity tracking
- **Core hackathon feature**

### 6. **Cross-Venue** (`/cross-venue`)
- Side-by-side platform comparison
- Same event across multiple platforms
- Price discrepancy visualization
- Volume comparison

### 7. **Leaderboard** (`/leaderboard`)
- Top traders by profit
- Top traders by ROI
- Top traders by win rate
- Trader profiles
- Performance history
- **Used for copy trading feature**

### 8. **AI Chat** (`/ask-predictions`)
- Natural language queries
- Ask about specific markets
- Get AI recommendations
- Market analysis
- Trend detection
- **Enhanced for hackathon**

### 9. **Alerts** (`/alerts`)
- Set price alerts
- Arbitrage opportunity alerts
- Volume spike alerts
- Custom conditions

### 10. **Portfolio** (`/portfolio`) - Coming Soon
- Track your positions
- Aggregate P&L
- Position analytics
- **New hackathon feature**

---

## 🎯 Hackathon Priority Pages

### Must Have (Keep All)
1. ✅ **Home** - First impression
2. ✅ **Events** - Core browsing (top 500)
3. ✅ **Arbitrage** - Main value prop
4. ✅ **Cross-Venue** - Platform comparison
5. ✅ **Leaderboard** - Social proof + copy trading
6. ✅ **AI Chat** - Differentiation
7. ✅ **Event Analytics** - Deep insights

### Nice to Have (Keep if Time)
8. ✅ **Screener** - Power user feature
9. ✅ **Alerts** - Useful utility
10. ✅ **Portfolio** - New feature to build

### Can Skip for Demo
- Settings page
- Pricing page (not needed for hackathon)
- Terms/Privacy (legal pages)

---

## 🎨 UI Components

### Navigation
- **PremiumSidebar** - Left navigation with all tabs
- **AppHeader** - Top bar with search and AI shortcut
- **Footer** - Legal links

### Data Visualization
- **Recharts** - Line charts, bar charts
- **Plotly** - Interactive 3D charts
- **Lightweight Charts** - TradingView-style candlesticks

### Cards & Lists
- **ArbitrageCard** - Shows opportunity details
- **EventCard** - Event preview
- **TraderCard** - Trader profile preview
- **MarketCard** - Individual market display

---

## 🚀 Top 500 Markets Integration

All pages that show markets will be optimized to use top 500:

```typescript
// Events page
const markets = await fetch('/api/events?limit=500')

// Arbitrage page  
const opportunities = await fetch('/api/arbitrage?top_n=500')

// Screener page
const filtered = await fetch('/api/markets/screener?max_results=500')
```

This ensures:
- ✅ Fast loading (<100ms)
- ✅ Liquid markets only
- ✅ Real executable opportunities
- ✅ Smooth demo experience

---

## 📱 Mobile Responsiveness

All pages are mobile-friendly:
- Responsive layouts
- Touch-optimized
- Mobile navigation menu
- Swipe gestures

---

## 🎯 Demo Flow Recommendation

**5-Minute Walkthrough:**

```
1. Home (30 sec)
   "Welcome to Event Graph - unified view of prediction markets"

2. Events (45 sec)
   "Browse top 500 markets across 4 platforms"
   [Show filter, sort, search]

3. Arbitrage (90 sec) ⭐ MAIN FEATURE
   "Here's where we detect profit opportunities"
   [Show live opportunity, calculate profit]
   [Demo execution or smart contract]

4. Leaderboard (30 sec)
   "These are top traders across all platforms"
   [Show copy trading button]

5. AI Chat (60 sec)
   "Ask anything in natural language"
   [Demo: "Show me best arbitrage opportunity"]
   [Claude responds with analysis]

6. Event Analytics (30 sec)
   "Deep dive into any market"
   [Show charts, analysis]
```

---

## 🔧 Customization for Hackathon

To focus on hackathon features, you can:

1. **Highlight new features** with badges
   ```tsx
   <Tab label="Arbitrage" badge="NEW" />
   ```

2. **Add demo mode toggle** in header
   ```tsx
   <Switch label="Demo Mode (Top 100)" />
   ```

3. **Show build status** on relevant pages
   ```tsx
   <Alert severity="info">
     Built during ETH Denver 2026 Hackathon
   </Alert>
   ```

---

## 🎯 All Features Active

Your hackathon repo includes ALL EventGraph UI features:

✅ Dashboard  
✅ Events browsing  
✅ Event analytics  
✅ Screener  
✅ Arbitrage detection  
✅ Cross-venue comparison  
✅ Trader leaderboard  
✅ AI chatbot  
✅ Alerts  

**Optimized for top 500 markets** for fast, reliable demo! 🚀
