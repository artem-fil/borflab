import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";

import App from "./App.jsx";
import "./index.css";

import cardbackImg from "@images/card-back.webp";
import cardfrontImg from "@images/card-front.webp";
import igniterImg from "@images/igniter.webp";
import posterImg from "@images/poster01.webp";
import poster3Img from "@images/poster03.webp";
import secretariatImg from "@images/secretariat.webp";
import swapomatImg from "@images/swapomat.webp";
import transmutatorImg from "@images/transmutator.webp";
import watermarkImg from "@images/watermark.webp";
import { BIOMES, STONES } from "./config.js";

[
    cardbackImg,
    cardfrontImg,
    watermarkImg,
    igniterImg,
    posterImg,
    poster3Img,
    transmutatorImg,
    swapomatImg,
    secretariatImg,
    ...Object.values(STONES).map((s) => s.image),
    ...Object.values(BIOMES).map((b) => b.icon),
].forEach((src) => {
    const img = new Image();
    img.src = src;
});

// Автообновление SW: как только новый воркер задеплоен и взял контроль — форсим релоад,
// чтобы клиент не сидел неделями на старом JS-бандле (актуально для установленного PWA).
const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
        updateSW(true);
    },
    onRegisteredSW(swUrl, registration) {
        // подстраховка: если есть уже waiting-воркер на момент регистрации — тоже обновляемся
        if (registration?.waiting) {
            updateSW(true);
        }
    },
});

let refreshing = false;
navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
});

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
