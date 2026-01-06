import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc } from "@solana/kit";

import "./index.css";
import App from "./App.jsx";

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
                solana: {
                    rpcs: {
                        "solana:devnet": {
                            rpc: createSolanaRpc("https://api.devnet.solana.com"),
                            // rpcSubscriptions: createSolanaRpcSubscriptions("wss://api.devnet.solana.com"),
                        },
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
