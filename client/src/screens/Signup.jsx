import { usePrivy } from "@privy-io/react-auth";
import { useNavigate } from "react-router-dom";
import privyLogo from "../assets/privy.jpg";
import { useState, useEffect } from "react";
import api from "../api";
import store from "../store";

export default function Signup() {
    const { login, authenticated, user, logout } = usePrivy();
    const navigate = useNavigate();
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState("");

    const handleSync = async () => {
        if (syncing) return;

        setSyncing(true);
        setError("");

        try {
            await api.syncUser(user);
            localStorage.setItem("synced", "true");
            navigate("/");
        } catch (err) {
            console.error("Sync error:", err);
            setError(err.message || "Sync failed. Try again");
            store.clear();
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
