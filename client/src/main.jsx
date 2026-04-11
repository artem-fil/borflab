import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.jsx";
import "./index.css";

const appId = "cmggax81g00zgh20b0z7052t6";

const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: true });

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <PrivyProvider
            appId={appId}
            config={{
                loginMethods: ["email"],
                embeddedWallets: {
                    solana: {
                        createOnLogin: "users-without-wallets",
                    },
                    defaultChain: "solana:devnet",
                },
                externalWallets: {
                    solana: {
                        connectors: solanaConnectors,
                    },
                },
            }}
        >
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </PrivyProvider>
    </StrictMode>
);
