/**
 * Centralized Category Questions Data
 * 
 * This file contains all questions for each category page in the EventGraph AI platform.
 * Questions are organized by category and subcategory for easy maintenance and consistency
 * across the application.
 * 
 * Categories:
 * - Blockchains
 * - Cryptocurrencies
 * - Centralized Exchanges (CEX)
 * - Decentralized Exchanges (DEX)
 * - Derivatives
 * - NFTs
 */

export interface QuestionCategory {
  title: string;
  icon: string;
  questions: string[];
}

export interface CategoryQuestionsData {
  [categoryKey: string]: QuestionCategory[];
}

export const CATEGORY_QUESTIONS: CategoryQuestionsData = {
  Blockchains: [
    {
      title: 'Blockchain Overview',
      icon: '⛓️',
      questions: [
        'What is the purpose of the [blockchain] network?',
        'How does [chain] differ from Ethereum or Solana?',
        'Is [chain] a Layer 1 or Layer 2?',
        'Give me a summary of the architecture of [chain].',
        'What consensus mechanism does [chain] use?',
      ],
    },
    {
      title: 'Consensus Mechanisms',
      icon: '🔐',
      questions: [
        'How does Proof-of-Stake work on [chain]?',
        'Compare PoW vs PoS vs DAG networks.',
        'Which blockchains use delegated staking?',
        'Which chains use hybrid consensus?',
        "What are the advantages of [chain]'s consensus model?",
      ],
    },
    {
      title: 'Layer 1 Blockchains',
      icon: '1️⃣',
      questions: [
        'Show me all major Layer 1 blockchains.',
        'Compare SOL vs ETH vs AVAX as L1s.',
        'Which L1s have the fastest throughput?',
        'Which L1s generated the most fees today?',
        'Which L1 grew the most in the last 30 days?',
      ],
    },
    {
      title: 'Layer 2 Solutions',
      icon: '2️⃣',
      questions: [
        'Show all Ethereum Layer 2 networks.',
        'Compare Arbitrum vs Optimism vs Base.',
        'Which L2 has the highest activity today?',
        'Which L2 has the lowest transaction fees?',
        'Show me the total bridged value to each L2.',
      ],
    },
    {
      title: 'Transaction Fees & Costs',
      icon: '💸',
      questions: [
        'Show gas fees on Ethereum right now.',
        'Compare transaction fees on SOL vs AVAX vs MATIC.',
        'Which chains have the lowest average fee today?',
        'Show fee trends for [chain] over the last 7 days.',
        'Which chains generate the most fee revenue?',
      ],
    },
    {
      title: 'Network Throughput',
      icon: '⚡',
      questions: [
        'Show TPS (transactions per second) for [chain].',
        'Which chains have the highest TPS right now?',
        'Compare real-time throughput of ETH vs SOL vs BASE.',
        'Show historical TPS trends for [chain].',
        'Which chains improved throughput the most in the last year?',
      ],
    },
    {
      title: 'Validator & Staking Analytics',
      icon: '🏛️',
      questions: [
        'How many validators does [chain] have?',
        'Show total staked supply for [chain].',
        'Compare staking yields across top blockchains.',
        'How decentralized is the validator set for [chain]?',
        'Show the largest stakers on [chain].',
      ],
    },
    {
      title: 'Bridges & Interoperability',
      icon: '🌉',
      questions: [
        'What bridges support transfers to/from [chain]?',
        'Show the total bridged value on [bridge].',
        'Compare bridge activity between L1s and L2s.',
        'Which chains have the most cross-chain traffic?',
        'Show security incidents related to bridges.',
      ],
    },
    {
      title: 'NFTs & Digital Assets',
      icon: '🎨',
      questions: [
        'Show top NFT collections on [chain].',
        'Compare NFT volume on ETH vs SOL vs BTC Ordinals.',
        'Which chains have the highest NFT minting activity?',
        'Show NFT market trends for [chain].',
        'Which chains have growing NFT ecosystems?',
      ],
    },
    {
      title: 'Developer Ecosystem',
      icon: '👨‍💻',
      questions: [
        'Show developer activity for [chain].',
        'Compare GitHub commits for major L1 networks.',
        'Which chains have the largest number of monthly developers?',
        'Show dev ecosystem growth trends for [chain].',
        'Which blockchains have the most active open-source contributors?',
      ],
    },
    {
      title: 'Security & Audits',
      icon: '🛡️',
      questions: [
        'Show the latest security incidents on [chain].',
        'Which chains have had the most exploits this year?',
        'Show audit reports for projects on [chain].',
        'Compare attack vectors of PoS vs PoW chains.',
        'Show MEV activity on [chain].',
      ],
    },
    {
      title: 'Ecosystem Growth & Funding',
      icon: '💰',
      questions: [
        'How much VC funding has gone into the [chain] ecosystem?',
        'Which chains attracted the most funding last quarter?',
        'Show ecosystem grants for [chain].',
        'Compare growth metrics for top Layer 1 ecosystems.',
        'Which chain ecosystems are expanding fastest?',
      ],
    },
    {
      title: 'Network Users & Adoption',
      icon: '👥',
      questions: [
        'Show daily active users on [chain].',
        'Which chains have the highest monthly active users?',
        'Compare adoption growth for ETH vs SOL vs BASE.',
        'Show new wallet creations on [chain].',
        'Which chains are leading in mainstream adoption?',
      ],
    },
    {
      title: 'Smart Contracts & DApps',
      icon: '📱',
      questions: [
        'Show the most used smart contracts on [chain].',
        'Which DApps generate the highest fees on [chain]?',
        'Compare DeFi protocols across major blockchains.',
        'Show contract deployment activity on [chain].',
        'Which chains saw the most new DApp launches this month?',
      ],
    },
    {
      title: 'Blockchain Categories Explorer',
      icon: '🗂️',
      questions: [
        'Show all ZK-rollup chains.',
        'Show all EVM-compatible blockchains.',
        'Show all modular blockchains (Celestia, Avail, etc.).',
        'Show all chains using Cosmos SDK.',
        'Compare the largest blockchain categories by market cap.',
      ],
    },
  ],

  Cryptocurrencies: [
    {
      title: 'General Cryptocurrency',
      icon: '💰',
      questions: [
        'What is Bitcoin / Ethereum / Solana / [any token]?',
        'Show me the current price of [token].',
        'What is the market-cap ranking of [token]?',
        'Show me the 24h price performance for [token].',
        'Which cryptocurrencies have the highest trading volume right now?',
      ],
    },
    {
      title: 'Token Metadata',
      icon: '📊',
      questions: [
        'Show me the contract address of [token].',
        'Which chains is [token] deployed on?',
        'Show me the logo, symbol, and decimals of [token].',
        'Show me all CEX & DEX trading pairs for [token].',
        'What category does [token] belong to (AI, DeFi, L1, Memecoin, etc.)?',
      ],
    },
    {
      title: 'Price Analysis',
      icon: '📈',
      questions: [
        'Show the price chart (1H / 24H / 7D / 30D / YTD / ALL) for [token].',
        'Compare price performance of BTC vs ETH vs SOL.',
        "Show today's top market movers.",
        "Show this week's best-performing tokens.",
        'Show the top losers in the last 24 hours.',
      ],
    },
    {
      title: 'Market Cap & Ranking',
      icon: '🏆',
      questions: [
        'Show the top 10 cryptocurrencies by market cap.',
        'Compare SOL vs AVAX vs SUI by market cap and volume.',
        'Which tokens recently entered the top 100?',
        'Which tokens have the highest FDV-to-market-cap ratio?',
        'Which tokens grew the most in market cap over the last 30 days?',
      ],
    },
    {
      title: 'Volatility & Momentum',
      icon: '⚡',
      questions: [
        'Show the volatility score for [token].',
        'Which tokens have the highest volatility today?',
        'Show tokens with the strongest bullish momentum.',
        'Show tokens with the strongest bearish momentum.',
        'Which tokens had the biggest volatility spike in the last 24 hours?',
      ],
    },
    {
      title: 'Token Supply Data',
      icon: '🪙',
      questions: [
        'What is the circulating supply of [token]?',
        'What is the total and max supply of [token]?',
        'Calculate the inflation rate of [token].',
        'Which tokens have the lowest inflation?',
        'What percentage of total supply is circulating for [token]?',
      ],
    },
    {
      title: 'On-Chain Activity',
      icon: '⛓️',
      questions: [
        'Show the number of active addresses for [token].',
        'Show transactions per second (TPS) on [chain].',
        'Compare daily active users on Ethereum vs Solana vs Base.',
        'Show total fees generated by [token or chain].',
        'Which chains have the highest TPS right now?',
      ],
    },
    {
      title: 'Treasury & Holdings',
      icon: '🐋',
      questions: [
        'Who are the top holders of [token]?',
        'Show whale activity for [token].',
        'List the top treasuries holding [token].',
        'Show net inflow/outflow to exchanges for [token].',
        'How many wallets hold more than 1% of [token]?',
      ],
    },
    {
      title: 'Historical Price Data (OHLC)',
      icon: '📉',
      questions: [
        'Show the OHLC chart for [token] over the past 7 days.',
        'Show historical volume for [token].',
        'Show price history for [token] from launch to today.',
        'Compare the historical performance of BTC vs ETH.',
        'Show the 5-year historical price trend for [token].',
      ],
    },
    {
      title: 'Cycle Analysis',
      icon: '🔄',
      questions: [
        'How did [token] perform in the last bull market?',
        "What is Bitcoin's 4-year price cycle?",
        'Show all Bitcoin halving events and their price impact.',
        'Show market-cycle performance comparison for major tokens.',
        'Show where we currently are in the crypto market cycle.',
      ],
    },
    {
      title: 'Comparative Analytics',
      icon: '⚖️',
      questions: [
        'Compare SOL vs AVAX.',
        'Compare DOGE vs SHIB vs PEPE.',
        'Compare major ETH L2s: ARB vs OP vs BASE.',
        'Compare AI tokens: FET vs AGIX vs RNDR.',
        'Compare DeFi ecosystems by TVL and activity.',
      ],
    },
    {
      title: 'Categories Explorer',
      icon: '🗂️',
      questions: [
        'Show all tokens in the AI category.',
        'Show all L1 blockchains.',
        'Show all DEX tokens.',
        'What are the top-performing categories this week?',
        'Compare the market caps of the biggest categories.',
      ],
    },
    {
      title: 'Social & Developer Metrics',
      icon: '👥',
      questions: [
        'Show the Twitter sentiment score for [token].',
        'What are people saying about [token] today?',
        'Show the most discussed tokens on social media.',
        'Show GitHub activity for [project].',
        'Compare developer activity for ETH vs SOL vs AVAX.',
      ],
    },
    {
      title: 'News & Events',
      icon: '📰',
      questions: [
        'Show the latest cryptocurrency news.',
        'What major events are affecting the market today?',
        'Show upcoming events for [token].',
        'Show all tokens with major events this week.',
        'Show important unlocks or roadmap milestones for [token].',
      ],
    },
    {
      title: 'Discovery & Alpha',
      icon: '🔍',
      questions: [
        'Show recently listed tokens.',
        'Show tokens with rapidly growing volume.',
        'Show tokens with sudden whale accumulation.',
        'Show tokens trending on-chain today.',
        'Show tokens with the strongest breakout signals.',
      ],
    },
  ],

  'Centralized Exchanges': [
    {
      title: 'Exchange Overview',
      icon: '🏦',
      questions: [
        'What is [exchange] and how does it work?',
        'Is [exchange] a top-tier centralized exchange?',
        'Which countries does [exchange] operate in?',
        'What are the pros and cons of trading on [exchange]?',
        'Does [exchange] support futures or spot trading?',
      ],
    },
    {
      title: 'Listings & Supported Tokens',
      icon: '📋',
      questions: [
        'Show all tokens listed on [exchange].',
        'Which new tokens were listed on [exchange] this week?',
        'Compare token availability across Binance, Coinbase, and OKX.',
        'Which tokens are exclusive to [exchange]?',
        'Show upcoming listings or listing rumors for [exchange].',
      ],
    },
    {
      title: 'Trading Volume & Liquidity',
      icon: '💧',
      questions: [
        'Show the 24h trading volume on [exchange].',
        'Compare liquidity of BTC/ETH on Binance vs Coinbase vs OKX.',
        'Which exchanges have the deepest liquidity today?',
        'Show the highest-volume trading pairs on [exchange].',
        'Which exchanges lead in derivatives volume?',
      ],
    },
    {
      title: 'Spot Trading Analytics',
      icon: '📊',
      questions: [
        'Show spot trading volume for [token] on [exchange].',
        'Compare spot markets across major exchanges.',
        'Which spot pairs gained the most volume today?',
        'Show spot price spread for [token] across exchanges.',
        'Which exchanges have the smallest spot slippage?',
      ],
    },
    {
      title: 'Futures & Derivatives',
      icon: '📈',
      questions: [
        'Show open interest for [token] futures on [exchange].',
        'Compare funding rates for BTC/ETH across major exchanges.',
        'Which exchanges dominate futures trading?',
        'Show perpetual contract volume for [token].',
        'Which tokens have the highest leverage usage?',
      ],
    },
    {
      title: 'Order Books & Depth',
      icon: '📖',
      questions: [
        'Show order book depth for [token] on [exchange].',
        'Compare bid/ask spreads for [token] across exchanges.',
        'Show top buyers and sellers in the last 1 hour.',
        'Which exchanges have the tightest spreads?',
        'Show order-flow imbalance for [token] on [exchange].',
      ],
    },
    {
      title: 'Deposits, Withdrawals & Fees',
      icon: '💸',
      questions: [
        'What are the trading fees on [exchange]?',
        'What are withdrawal fees for BTC/ETH on [exchange]?',
        'Compare trading fees across Binance, OKX, Bybit, and KuCoin.',
        'Show deposit/withdrawal limits for [asset] on [exchange].',
        'Which exchanges have the lowest overall transaction fees?',
      ],
    },
    {
      title: 'Reserves & Proof-of-Reserves',
      icon: '🏛️',
      questions: [
        'Show the proof-of-reserves for [exchange].',
        'How much BTC/ETH/SOL is held by [exchange]?',
        'Compare PoR transparency across major exchanges.',
        'Show stablecoin reserves on [exchange].',
        'Which exchanges have the healthiest reserve ratios?',
      ],
    },
    {
      title: 'Regulatory & Compliance',
      icon: '⚖️',
      questions: [
        'Is [exchange] regulated in the US/EU/Asia?',
        'Has [exchange] faced any regulatory actions recently?',
        'What licenses does [exchange] hold?',
        'Which exchanges are compliant with global AML rules?',
        'Is [exchange] allowed to operate in India/Singapore/EU?',
      ],
    },
    {
      title: 'Security & Risk',
      icon: '🛡️',
      questions: [
        'Has [exchange] ever been hacked?',
        'What security measures does [exchange] offer (2FA, whitelisting)?',
        'Compare exchange security ratings.',
        'Which exchanges have the safest custody systems?',
        'Show major security incidents for centralized exchanges.',
      ],
    },
    {
      title: 'User Activity & Demographics',
      icon: '👥',
      questions: [
        'How many active users trade on [exchange]?',
        'Which countries generate the most trading activity?',
        'Show user growth trends for [exchange].',
        'Which exchanges added the most new users this year?',
        'Compare global usage of Binance vs Coinbase vs OKX.',
      ],
    },
    {
      title: 'Funding, Staking & Earn Features',
      icon: '💰',
      questions: [
        'What staking rewards does [exchange] offer for [token]?',
        'Compare APY rates across major exchanges.',
        'Which exchanges offer the best savings/earn products?',
        'Show locked vs flexible staking options for [token].',
        'What are the risks of staking on [exchange]?',
      ],
    },
    {
      title: 'Launchpads & Token Sales',
      icon: '🚀',
      questions: [
        'Show upcoming launchpad token sales on [exchange].',
        'Which launchpads historically performed the best?',
        'Show previous launchpad ROI on [exchange].',
        'Which exchanges offer IEO/Launchpad access?',
        'Show the latest projects launched via [exchange] launchpad.',
      ],
    },
    {
      title: 'Exchange Tokens & Performance',
      icon: '🪙',
      questions: [
        'Show the price chart for [exchange token] (BNB, OKB, CRO, etc.).',
        'Compare performance of all major exchange tokens.',
        'Show utility and use-cases of [exchange token].',
        'How much revenue does [exchange token] capture in fees?',
        'What percentage of the supply is owned by the exchange team?',
      ],
    },
    {
      title: 'Reputation, Trust & Reviews',
      icon: '⭐',
      questions: [
        'What is the trust score of [exchange]?',
        'What are users saying about [exchange] today?',
        'Compare user reviews across all major exchanges.',
        'Has [exchange] faced any scandals or controversies?',
        'Which exchanges are considered the most trustworthy?',
      ],
    },
  ],

  'Decentralized Exchanges': [
    {
      title: 'DEX Overview',
      icon: '🔄',
      questions: [
        'What are the top DEXs by total trading volume today?',
        'Which DEXs have the highest number of daily active users?',
        'How do Uniswap, SushiSwap, and PancakeSwap compare in terms of TVL and volume?',
        'Which chains have the most active DEXs right now?',
        'What is the daily volume breakdown across major DEX platforms?',
      ],
    },
    {
      title: 'Supported Tokens & Trading Pairs',
      icon: '🪙',
      questions: [
        'How many tokens does Uniswap support?',
        'What are the most traded pairs on PancakeSwap?',
        'Which DEX has the most listed meme tokens?',
        'What new tokens have been listed on DEXs in the past 7 days?',
        'Which DEXs support trading for RWA or real-world asset tokens?',
      ],
    },
    {
      title: 'Swap & Price Analytics',
      icon: '💱',
      questions: [
        'What is the best rate for swapping ETH to USDC right now?',
        'Which DEX offers the lowest price impact for a $50K swap?',
        'Compare current price of LINK across different DEXs',
        'What are the current slippage rates on large trades across DEXs?',
        'How do gas costs compare for a similar swap on Uniswap vs. Balancer?',
      ],
    },
    {
      title: 'Liquidity Pools (LPs)',
      icon: '🏊',
      questions: [
        'What are the highest-yielding liquidity pools on Uniswap v3?',
        'Which LPs on Curve have the lowest impermanent loss?',
        'What are the most popular ETH/stablecoin pools right now?',
        'Which LP has the highest volume-to-TVL ratio?',
        'What new liquidity pools have launched this week?',
      ],
    },
    {
      title: 'Liquidity Provider Analytics',
      icon: '💧',
      questions: [
        'Who are the top liquidity providers on Uniswap?',
        'What is the average APY earned by LPs on Curve?',
        'How much impermanent loss have LPs experienced on ETH/USDC pools?',
        'Which wallets are providing the most liquidity to meme token pools?',
        'What percentage of LP fees go to the protocol vs. providers?',
      ],
    },
    {
      title: 'Total Value Locked (TVL)',
      icon: '🔒',
      questions: [
        'What is the current TVL of Uniswap across all chains?',
        'How has TVL on Curve changed in the past 30 days?',
        'Which DEX has the fastest-growing TVL this month?',
        'What is the TVL breakdown by chain for top 5 DEXs?',
        'How does DEX TVL compare to lending protocol TVL?',
      ],
    },
    {
      title: 'Fees & Revenue',
      icon: '💸',
      questions: [
        'What are the swap fees on Uniswap v3 vs. v2?',
        'Which DEX has generated the most protocol revenue in the past 7 days?',
        'How much have LPs earned in fees on PancakeSwap this month?',
        'What is the fee structure on Curve Finance?',
        'How do DEX fees compare to centralized exchange trading fees?',
      ],
    },
    {
      title: 'AMM Types & Mechanisms',
      icon: '⚙️',
      questions: [
        'What is the difference between constant product and concentrated liquidity AMMs?',
        'How does Curve StableSwap differ from Uniswap pricing?',
        'Which DEXs use order book models instead of AMMs?',
        'What is the mechanism behind Balancer weighted pools?',
        'How does GMX perpetual AMM work?',
      ],
    },
    {
      title: 'Cross-Chain DEX Aggregation',
      icon: '🌐',
      questions: [
        'Which aggregators offer the best cross-chain swap rates?',
        'How does 1inch aggregation compare to Paraswap?',
        'What are the top cross-chain DEX bridges by volume?',
        'Which chains are most commonly bridged for DEX swaps?',
        'What are the fees for cross-chain swaps via aggregators?',
      ],
    },
    {
      title: 'User Activity & Adoption',
      icon: '👥',
      questions: [
        'How many unique wallets traded on Uniswap in the past 24 hours?',
        'What is the average trade size on DEXs compared to CEXs?',
        'Which DEXs have the highest user retention rates?',
        'What is the growth rate of new DEX users this quarter?',
        'How do DEX user demographics compare across chains?',
      ],
    },
    {
      title: 'Governance & Token Utility',
      icon: '🗳️',
      questions: [
        'What is the current price and market cap of UNI token?',
        'How is the SUSHI token used in SushiSwap governance?',
        'What recent governance proposals have passed on Uniswap?',
        'How much voting power is needed to create a proposal on Curve?',
        'What are the staking rewards for DEX governance tokens?',
      ],
    },
    {
      title: 'Security & Risks',
      icon: '🛡️',
      questions: [
        'Which DEXs have been audited by top security firms?',
        'What are the main smart contract risks when using DEXs?',
        'Have there been any recent exploits on major DEXs?',
        'How can users protect themselves from rug pulls on DEXs?',
        'What insurance options exist for DEX users?',
      ],
    },
    {
      title: 'MEV, Arbitrage & Bots',
      icon: '🤖',
      questions: [
        'How much MEV has been extracted from DEX trades this month?',
        'Which tokens are most targeted by sandwich attacks?',
        'What are the top arbitrage opportunities between DEXs?',
        'How do DEXs protect users from front-running?',
        'What is the volume of bot trades vs. human trades on Uniswap?',
      ],
    },
    {
      title: 'Stablecoin & Curve Ecosystems',
      icon: '💵',
      questions: [
        'What are the top stablecoin pools on Curve?',
        'How does Curve pricing work for pegged assets?',
        'What is the current volume of USDC/USDT swaps on DEXs?',
        'Which DEXs offer the best rates for stablecoin swaps?',
        'How has Curve wars and veCRV dynamics evolved?',
      ],
    },
    {
      title: 'DEX Rankings & Competitive Landscape',
      icon: '🏆',
      questions: [
        'Rank the top 10 DEXs by weekly trading volume',
        'Which DEXs are gaining market share this quarter?',
        'How does the DEX market compare to CEX market share?',
        'What new DEX protocols have launched recently?',
        'Which DEXs dominate on Arbitrum vs. Optimism vs. Base?',
      ],
    },
  ],

  Derivatives: [
    {
      title: 'Futures Overview',
      icon: '📜',
      questions: [
        'What are futures contracts, and how do they work for crypto?',
        'What is the difference between futures and perpetual contracts?',
        'Show supported futures markets for Binance',
        'Which tokens have the most active futures markets today?',
        'What are the benefits and risks of trading futures?',
      ],
    },
    {
      title: 'Perpetual Contracts (Perps)',
      icon: '🔄',
      questions: [
        'Show the perpetual futures market for BTC',
        'Compare perps funding rates across exchanges',
        'Which tokens have the most liquid perpetual markets right now?',
        'Show top perps by 24h trading volume',
        'Which exchanges offer the lowest fees for perps?',
      ],
    },
    {
      title: 'Open Interest (OI)',
      icon: '📈',
      questions: [
        'Show current open interest for BTC',
        'Compare OI for BTC/ETH across major exchanges',
        'Which tokens saw the biggest OI increase today?',
        'Show historical OI trends for ETH',
        'Which futures markets have the highest open interest right now?',
      ],
    },
    {
      title: 'Funding Rates',
      icon: '💰',
      questions: [
        'Show current funding rate for BTC on Binance',
        'Compare funding rates across Binance, Bybit, OKX, and Bitget',
        'Which tokens have the highest positive funding today?',
        'Which tokens have the most negative funding today?',
        'Show 7-day funding rate history for ETH',
      ],
    },
    {
      title: 'Liquidation Data',
      icon: '⚠️',
      questions: [
        'Show total liquidations for BTC in the last 24 hours',
        'Show long vs short liquidations for BTC/ETH',
        'Which exchanges had the largest liquidation events today?',
        'Show liquidation heatmaps for ETH',
        'Which tokens are at high liquidation risk right now?',
      ],
    },
    {
      title: 'Long/Short Ratio',
      icon: '⚖️',
      questions: [
        'What is the long/short ratio for BTC?',
        'Compare long/short ratios across exchanges',
        'Which tokens have the highest long bias today?',
        'Which tokens have a strong short bias today?',
        'Show long/short ratio trends for the last 7 days',
      ],
    },
    {
      title: 'Leverage & Margin Analytics',
      icon: '🎚️',
      questions: [
        'What is the average leverage used for BTC?',
        'Which tokens show excessive leverage buildup?',
        'Show cross-margin vs isolated-margin usage on Binance',
        'Compare margin usage across major futures pairs',
        'Which markets have the most risk of cascading liquidations?',
      ],
    },
    {
      title: 'Basis & Contango/Backwardation',
      icon: '📉',
      questions: [
        'Show futures basis for BTC',
        'Is BTC/ETH in contango or backwardation today?',
        'Compare futures basis across multiple expiries',
        'Which tokens have the steepest contango curve?',
        'Show premium/discount between spot and future prices',
      ],
    },
    {
      title: 'Options Markets',
      icon: '🎯',
      questions: [
        'Show BTC/ETH options open interest',
        'What is the implied volatility (IV) for BTC?',
        'Show call vs put volume today',
        'Compare ATM IV across expiries',
        'Which tokens have the highest options activity?',
      ],
    },
    {
      title: 'Volatility Metrics',
      icon: '📊',
      questions: [
        'Show realized vs implied volatility for BTC',
        'Which tokens have the highest volatility today?',
        'Show 7-day volatility trend for ETH',
        'Compare volatility across BTC/ETH/SOL',
        'Which markets show increasing volatility risk?',
      ],
    },
    {
      title: 'Exchange-Specific Derivatives',
      icon: '🏢',
      questions: [
        'Show all futures pairs offered on Binance',
        'Compare perps liquidity across exchanges',
        'What are the maker/taker fees for perps on Bybit?',
        'Which exchange has the highest derivatives volume today?',
        'Show historical futures volume for OKX',
      ],
    },
    {
      title: 'Arbitrage & Basis Trading',
      icon: '🔀',
      questions: [
        'Show futures-spot arbitrage opportunities for BTC',
        'Which tokens have profitable funding arbitrage today?',
        'Show cross-exchange basis differences for ETH',
        'Compare triangular arbitrage routes for futures',
        'Which assets show mean-reversion opportunities?',
      ],
    },
    {
      title: 'Market Sentiment (Derivatives)',
      icon: '🎭',
      questions: [
        'What is the market sentiment for BTC based on futures data?',
        'Show sentiment shift when funding flips positive/negative',
        'Which tokens show extreme bullish sentiment?',
        'Which markets show extreme bearish sentiment?',
        'Show sentiment-based trend predictions',
      ],
    },
    {
      title: 'Strategy Signals',
      icon: '🎲',
      questions: [
        'Show long squeeze alerts for BTC',
        'Show short squeeze alerts for ETH',
        'Which tokens show breakout-level OI spikes?',
        'Which tokens are ideal for a carry trade right now?',
        'Show tokens with the strongest trend continuation signals',
      ],
    },
    {
      title: 'Historical Derivatives Analytics',
      icon: '📜',
      questions: [
        'Show historical OI for BTC over 1 year',
        'Show historical funding rate patterns for ETH',
        'Compare long-term futures volume trends across exchanges',
        'Show liquidation history for BTC/ETH',
        'Show multi-cycle derivatives behavior for BTC',
      ],
    },
  ],

  NFTs: [
    {
      title: 'NFT Overview',
      icon: '🎨',
      questions: [
        'What is the [NFT collection]?',
        'Who created the [collection], and what is its purpose?',
        'On which chain does [collection] exist?',
        'What makes this NFT collection unique?',
        'Show me a summary of the entire [NFT ecosystem].',
      ],
    },
    {
      title: 'Collections & Rankings',
      icon: '🏆',
      questions: [
        'Show the top NFT collections by market cap.',
        'Which NFT collections are trending today?',
        'Show the weekly performance of top NFT projects.',
        'Which collections gained the most new holders this week?',
        'Compare floor prices of major collections.',
      ],
    },
    {
      title: 'Floor Price & Pricing Analytics',
      icon: '💰',
      questions: [
        'What is the floor price of [collection]?',
        'Show the floor price chart over the last 30 days for [collection].',
        'Compare floor prices across multiple collections.',
        'Which NFTs had the biggest floor price jump today?',
        'Which collections have the most stable floor price?',
      ],
    },
    {
      title: 'Sales Volume & Marketplace Activity',
      icon: '📊',
      questions: [
        'Show 24h sales volume for [collection].',
        'Which marketplaces are generating the most NFT volume today?',
        'Compare NFT trading volume across OpenSea, Blur, Magic Eden, etc.',
        'Which collections saw the highest number of sales today?',
        'Show weekly marketplace volume breakdown by chain.',
      ],
    },
    {
      title: 'Holders & Ownership Distribution',
      icon: '👥',
      questions: [
        'How many unique holders does [collection] have?',
        'What percentage of supply is held by whales?',
        'Which wallets hold the most NFTs from [collection]?',
        'Show holder distribution for [collection].',
        'Which collections have the highest decentralization of holders?',
      ],
    },
    {
      title: 'Rarity & Traits',
      icon: '💎',
      questions: [
        'Show rarity rankings for [collection].',
        'What are the rarest traits in [collection]?',
        'Compare rarity scores across selected NFTs.',
        'Which traits have the highest sale premiums?',
        'Show floor prices per trait category.',
      ],
    },
    {
      title: 'Minting, Supply & Burn Activity',
      icon: '🔥',
      questions: [
        'When was [collection] minted, and what was the mint price?',
        'What is the total supply of [collection]?',
        'Show ongoing or upcoming NFT mints.',
        'Which NFT projects have burned supply recently?',
        'Show mint activity trends across major chains.',
      ],
    },
    {
      title: 'Social Metrics & Hype Score',
      icon: '📱',
      questions: [
        'Show social sentiment for [collection].',
        'What are people saying about [NFT project] on Twitter?',
        'Show the most talked-about NFT collections today.',
        'Compare social buzz across multiple collections.',
        'Which NFT projects gained the most followers this week?',
      ],
    },
    {
      title: 'Whale Activity',
      icon: '🐋',
      questions: [
        'Show recent whale buys for [collection].',
        'Which collections are whales accumulating today?',
        'Show the biggest NFT purchases in the last 24 hours.',
        'Show wallets with the highest profit from NFTs.',
        'Which collections have the most active whale trading?',
      ],
    },
    {
      title: 'Market Trends & NFTs by Chain',
      icon: '⛓️',
      questions: [
        'Show NFT activity across Ethereum, Solana, Polygon, and Bitcoin.',
        'Which chains are gaining NFT market share?',
        'Show top NFT collections by chain.',
        'Compare chain-level NFT trends for the last 7 days.',
        'Show NFT mint volume per chain.',
      ],
    },
    {
      title: 'Historical Analytics',
      icon: '📈',
      questions: [
        'Show historical floor price for [collection].',
        'Show historical trading volume for [collection].',
        'Compare historical performance of major collections (BAYC vs Azuki vs DeGods).',
        'Show long-term holder trends for [collection].',
        'Show 1-year NFT market performance charts.',
      ],
    },
    {
      title: 'NFT Marketplaces',
      icon: '🛒',
      questions: [
        'What are the top NFT marketplaces today?',
        'Compare OpenSea vs Blur vs Magic Eden.',
        'Show fees and royalties across marketplaces.',
        'Which marketplace had the fastest growth this month?',
        'Show marketplace-specific volume for [collection].',
      ],
    },
    {
      title: 'Royalties, Creator Earnings & Fees',
      icon: '💸',
      questions: [
        'How much royalty revenue has [collection] generated?',
        'Which creators earned the most royalties this month?',
        'Show royalty % for major collections.',
        'Which marketplaces enforce full royalties?',
        'Compare royalty structures across collections.',
      ],
    },
    {
      title: 'Price Predictions, AI Signals & Forecasts',
      icon: '🔮',
      questions: [
        'What is the current trend outlook for [collection]?',
        'Show AI-based price prediction for [collection].',
        'Which NFTs show the strongest bullish momentum?',
        'Which collections look undervalued based on metrics?',
        'Show predicted floor range for the next 7 days.',
      ],
    },
    {
      title: 'NFT Discovery & Alpha',
      icon: '🔍',
      questions: [
        'Show new NFT collections gaining traction.',
        'Show NFTs with rapidly increasing volume.',
        'Which new collections have strong holder retention?',
        'Show NFTs trending on social media this hour.',
        'Show hidden-gem small-cap NFT projects.',
      ],
    },
  ],
};

/**
 * Get all questions for a specific category
 */
export const getCategoryQuestions = (categoryKey: string): QuestionCategory[] => {
  return CATEGORY_QUESTIONS[categoryKey] || [];
};

/**
 * Get a flattened list of all questions for a category
 */
export const getAllQuestionsForCategory = (categoryKey: string): string[] => {
  const categories = getCategoryQuestions(categoryKey);
  return categories.flatMap(cat => cat.questions);
};

/**
 * Get total question count for a category
 */
export const getCategoryQuestionCount = (categoryKey: string): number => {
  return getAllQuestionsForCategory(categoryKey).length;
};

/**
 * Get all category keys
 */
export const getCategoryKeys = (): string[] => {
  return Object.keys(CATEGORY_QUESTIONS);
};
