import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import "./index.css";
import App from "./App.jsx";

const appId = "cmggax81g00zgh20b0z7052t6";

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <PrivyProvider
            appId={appId}
            config={{
                loginMethods: ["email", "wallet"],
                embeddedWallets: {
                    ethereum: {
                        createOnLogin: "users-without-wallets",
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
