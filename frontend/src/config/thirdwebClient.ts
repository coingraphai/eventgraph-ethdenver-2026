import { createThirdwebClient } from "thirdweb";
import { ethereum, polygon, base, arbitrum, optimism } from "thirdweb/chains";

// Initialize ThirdWeb client
// Get your client ID from: https://thirdweb.com/dashboard
const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID;

if (!clientId) {
  console.warn(
    "⚠️ ThirdWeb Client ID not found. Please add VITE_THIRDWEB_CLIENT_ID to your .env file"
  );
}

export const thirdwebClient = createThirdwebClient({
  clientId: clientId || "",
});

// Supported chains array for easy iteration
export const SUPPORTED_CHAINS = [ethereum, polygon, base, arbitrum, optimism];
