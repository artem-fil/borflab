import { Routes, Route, useLocation, Link } from "react-router-dom";
import { usePrivy, useIdentityToken, useLogin } from "@privy-io/react-auth";

import Signup from "./screens/Signup";
import Home from "./screens/Home";
import Welcome from "./screens/Welcome";
import Profile from "./screens/Profile";
import Library from "./screens/Library";
import Shop from "./screens/Shop";
import Storage from "./screens/Storage";
import Lab from "./screens/Lab";
import Swapomat from "./screens/Swapomat";
import NavMenu from "@components/NavMenu";
import { useState } from "react";

import api from "./api";
import store from "./store";

export default function App() {
    const { ready, authenticated, logout } = usePrivy();
    const { identityToken } = useIdentityToken();
    const location = useLocation();
    const [syncing, setSyncing] = useState(false);

    const { login } = useLogin({
        onComplete: (user, isNewUser) => {
            const performSync = async () => {
                if (isNewUser || !user.wasAlreadyAuthenticated) {
                    try {
                        setSyncing(true);
                        await api.syncUser(user);
                    } catch (err) {
                        console.error("Sync error:", err);
                        await logout();
                    } finally {
                        setSyncing(false);
                    }
                } else {
                    console.log("User already exists, skipping sync");
                }
            };

            performSync();
        },
    });

    const bgMap = {
        "/library": "bg-orange-200",
        "/shop": "bg-orange-200",
        "/storage": "bg-black",
    };

    const bgClass = bgMap[location.pathname] ?? "bg-app";

    if (!ready) {
        return <div className="text-black text-center mt-10">Loading...</div>;
    }
    if (!authenticated || !identityToken) {
        return (
            <div
                className={`flex flex-col bg-cover bg-bottom bg-no-repeat relative w-screen h-screen overflow-hidden font-plex py-6 ${bgClass}`}
            >
                <Signup login={login} />
            </div>
        );
    }

    store.setToken(identityToken);

    return (
        <div
            className={`flex flex-col bg-cover bg-bottom bg-no-repeat relative min-w-80 w-screen h-screen overflow-hidden font-plex py-6 ${bgClass}`}
        >
            {location.pathname !== "/welcome" && (
                <div className="flex justify-between items-center w-full px-6">
                    <Link className="text-xl" to="/">
                        🌀
                    </Link>
                    {authenticated && <NavMenu />}
                </div>
            )}

            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/lab" element={<Lab />} />
                <Route path="/library" element={<Library />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/storage" element={<Storage />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/swapomat" element={<Swapomat />} />
                <Route path="*" element={<Welcome />} />
            </Routes>
        </div>
    );
}
