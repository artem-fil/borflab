import { usePrivy } from "@privy-io/react-auth";
import { useNavigate } from "react-router-dom";
import privyLogo from "../assets/privy.jpg";
import { useState, useEffect } from "react";
import { useIdentityToken } from "@privy-io/react-auth";

export default function Signup() {
    const { login, authenticated, user, logout } = usePrivy();
    const navigate = useNavigate();
    const { identityToken } = useIdentityToken();
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState("");

    const isProd = !document.location.hostname.endsWith("localhost");
    const baseUrl = isProd ? "https://borflab.com/api" : "http://127.0.0.1:8282";

    const handleSync = async () => {
        setSyncing(true);
        setError("");

        try {
            const response = await fetch(`${baseUrl}/users/sync`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${identityToken}`,
                },
                body: JSON.stringify({
                    id: user.id,
                    email: user.email?.address,
                    wallet: user.wallet?.address,
                }),
            });

            if (response.ok) {
                localStorage.setItem("synced", "true");
                navigate("/");
            } else {
                throw new Error(`API error: ${response.statusText}`);
            }
        } catch (err) {
            console.error("Sync error:", err);
            setError(err.message || "Sync failed. Try again");
            localStorage.removeItem("synced");
            await logout();
        } finally {
            setSyncing(false);
        }
    };
    useEffect(() => {
        if (authenticated && user) {
            handleSync();
        }
    }, [authenticated, user]);

    return (
        <div className="flex-grow flex flex-col items-center px-6">
            <div className="flex-grow flex flex-col gap-4 items-center justify-center">
                <h1 className={`text-2xl text-center font-bold ${error ? "text-red-500" : ""}`}>
                    {error || "Sign up to start your journey"}
                </h1>
                <button
                    onClick={login}
                    disabled={syncing}
                    className="mt-6 w-full uppercase bg-purple-700 text-white rounded-md p-4 hover:bg-purple-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {syncing ? "Syncing..." : "start"}
                </button>
            </div>
            <img src={privyLogo} alt="powered by privy" className="mt-auto rounded-md" />
        </div>
    );
}
