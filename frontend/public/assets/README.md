# Assets Directory

This directory contains all static assets for the CoinGraph AI Copilot frontend.

## Structure

```
assets/
├── logo-white.svg          # Sidebar logo (157x42px)
├── logo-large.svg          # Dashboard hero logo (175px)
└── blockchains/
    ├── ethereum.svg        # Ethereum network badge
    ├── solana.svg          # Solana network badge
    ├── polygon.svg         # Polygon network badge
    ├── arbitrum.svg        # Arbitrum network badge
    └── optimism.svg        # Optimism network badge
```

## Current Status

The logos are currently **placeholder SVGs** with basic styling. 

## TODO: Replace with Real Assets

To get the actual logos from Figma:

1. Open the Figma design in your Figma desktop app
2. Find the logo nodes in the design
3. Use Figma MCP server to get the image URLs:
   ```
   Call mcp_figma_get_design_context with the node ID
   ```
4. Download the images and replace these placeholders

Alternatively, you can:
- Export images directly from Figma (File > Export)
- Use your own brand assets
- Use cryptocurrency icon libraries like:
  - https://cryptologos.cc/
  - https://cryptoicons.co/
  - https://github.com/spothq/cryptocurrency-icons

## Usage in Components

These assets are imported in:
- `src/layouts/Sidebar.tsx` - Uses `logo-white.svg`
- `src/pages/Dashboard.tsx` - Uses `logo-large.svg` and blockchain badges
