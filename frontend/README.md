# 🚀 CoinGraph AI - Copilot UI

React + TypeScript frontend for CoinGraph AI cryptocurrency intelligence platform with AI-powered copilot chat interface.

## ✨ Features Implemented

- **Sidebar Component** (340px width, collapsible)
  - Logo header
  - "New Chat" button with ⌘N shortcut
  - Navigation items (Explore, Knowledge Base, Templates)
  - Chat history with "TODAY" section
  - Settings button
  - User profile card

- **Dashboard Page**
  - Header with "CoinG v1" dropdown and actions
  - Upgrade banner
  - CoinGraph logo
  - "Let's start a smart conversation" headline
  - Chat input with "Deeper Research" mode toggle
  - 5 attachment icons (file, image, code, chart, send)
  - Network badges showing 30+ blockchain networks
  - 4 category cards (Blockchains, Cryptocurrencies, Cex, Explore All)
  - Footer disclaimer

- **Chat Input Component**
  - Multi-line text input with auto-resize
  - "Deeper Research" mode toggle (green accent)
  - File attachment support
  - 5 attachment action buttons
  - Send button with Enter key support
  - Disabled state handling

## 🎨 Design System

- **Colors**:
  - Background: #0A0A0A (almost black)
  - Primary Green: #BBD977
  - Secondary Gray: #464646
  - Text: #FFFFFF / #858585

- **Typography**:
  - Font Family: Outfit (Google Fonts)
  - Sizes: 42px (hero), 20px (heading), 16px (body), 14px (small), 12px (caption)

## 📦 Installation

### Prerequisites

Make sure you have **Node.js 18+** installed. Check with:
```bash
node --version
```

If Node.js is not installed, download it from [nodejs.org](https://nodejs.org/)

### Setup Steps

1. **Navigate to frontend directory**:
```bash
cd frontend
```

2. **Install dependencies**:
```bash
npm install
```

3. **Start development server**:
```bash
npm run dev
```

4. **Open in browser**:
```
http://localhost:5173
```

## 🛠️ Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 📁 Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   └── ChatInput.tsx          # Chat input with attachments
│   ├── layouts/
│   │   └── Sidebar.tsx            # Collapsible sidebar
│   ├── pages/
│   │   └── Dashboard.tsx          # Main landing page
│   ├── types/
│   │   └── index.ts               # TypeScript interfaces
│   ├── theme/
│   │   └── theme.ts               # Material-UI theme config
│   ├── App.tsx                    # Main app component
│   ├── main.tsx                   # Entry point
│   └── index.css                  # Global styles
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 🎯 Next Steps

1. **Install Redux Toolkit** (for state management):
```bash
npm install @reduxjs/toolkit react-redux
```

2. **Add WebSocket support**:
```bash
npm install socket.io-client
```

3. **Add authentication**:
```bash
npm install @react-oauth/google @walletconnect/web3-provider
```

4. **Add file upload**:
```bash
npm install react-dropzone
```

## 🐛 Known Issues

- Material-UI and React packages need to be installed (`npm install`)
- Logo images need to be added to `/public/assets/`
- Blockchain logo images need to be added to `/public/assets/blockchains/`

## 🔗 Backend Integration

The frontend is configured to proxy API requests to `http://localhost:8000`. Make sure the FastAPI backend is running.

## 📝 License

MIT

---

**Built with ❤️ using React, TypeScript, Material-UI, and Vite**
