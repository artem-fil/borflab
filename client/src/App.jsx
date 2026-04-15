import { useIdentityToken, useLogin, usePrivy } from "@privy-io/react-auth";
import { Route, Routes, useLocation } from "react-router-dom";

import NavMenu from "@components/NavMenu";
import Splash from "@components/Splash";
import { useEffect, useState } from "react";
import Counter from "./screens/Counter";
import Home from "./screens/Home";
import Lab from "./screens/Lab";
import Library from "./screens/Library";
import Policy from "./screens/Policy";
import Profile from "./screens/Profile";
import Shop from "./screens/Shop";
import Signup from "./screens/Signup";
import Storage from "./screens/Storage";
import Swapomat from "./screens/Swapomat";
import Welcome from "./screens/Welcome";

import api from "./api";
import store from "./store";

export default function App() {
    const { ready, authenticated, logout } = usePrivy();
    const { identityToken } = useIdentityToken();
    const location = useLocation();
    const [syncing, setSyncing] = useState(false);
    const [minTimeElapsed, setMinTimeElapsed] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const [borfId, setBorfId] = useState(null);
    const [showSplash, setShowSplash] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setMinTimeElapsed(true);
        }, 3000);

        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (ready && minTimeElapsed) {
            setIsExiting(true);
            const exitTimer = setTimeout(() => {
                setShowSplash(false);
            }, 300);
            return () => clearTimeout(exitTimer);
        }
    }, [ready, minTimeElapsed]);

    const [displayLocation, setDisplayLocation] = useState(location);
    const [transitionStage, setTransitionStage] = useState("fadeIn");

    useEffect(() => {
        if (location !== displayLocation) {
            setTransitionStage("fadeOut");
        }
    }, [location, displayLocation]);

    const handleAnimationEnd = () => {
        if (transitionStage === "fadeOut") {
            setTransitionStage("fadeIn");
            setDisplayLocation(location);
        }
    };

    const { login } = useLogin({
        onComplete: (user, isNewUser) => {
            const performSync = async () => {
                if (isNewUser || !user.wasAlreadyAuthenticated) {
                    try {
                        setSyncing(true);
                        const syncedUser = await api.syncUser(user);
                        setBorfId(syncedUser.BorfId);
                    } catch (err) {
                        console.error("Sync error:", err);
                        await logout();
                    } finally {
                        setSyncing(false);
                    }
                } else {
                    console.log("User identification verified from cache");
                }
            };

            performSync();
        },
    });

    const bgMap = {
        "/library": "bg-[#ddcfb7]",
        "/shop": "bg-[#ddcfb7]",
        "/storage": "bg-black",
    };

    const bgClass = bgMap[location.pathname] ?? "bg-app";

    if (showSplash) {
        return (
            <div
                className={`flex flex-col bg-cover bg-bottom bg-no-repeat relative w-screen h-screen overflow-hidden font-plex py-6 bg-app 
                transition-opacity duration-100 ease-in-out ${isExiting ? "opacity-0" : "opacity-100"}`}
            >
                <Splash />
            </div>
        );
    }
    if (!authenticated || !identityToken) {
        return (
            <div
                className={`flex flex-col bg-cover bg-bottom bg-no-repeat relative w-screen h-screen overflow-hidden font-plex py-6 bg-app`}
            >
                <Signup login={login} />
            </div>
        );
    }
    store.setBorfId(borfId);
    store.setToken(identityToken);

    return (
        <div
            className={`transition-opacity duration-150 flex flex-col bg-cover bg-bottom bg-no-repeat relative min-w-80 w-screen h-screen overflow-hidden font-plex ${bgClass} transition-opacity duration-150 ${
                transitionStage === "fadeIn" ? "opacity-100" : "opacity-0"
            }`}
            onTransitionEnd={handleAnimationEnd}
        >
            {location.pathname !== "/welcome" && authenticated && <NavMenu />}
            <Routes location={displayLocation}>
                <Route path="/" element={<Home />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/lab" element={<Lab />} />
                <Route path="/library" element={<Library />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/storage" element={<Storage />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/swapomat" element={<Swapomat />} />
                <Route path="/counter" element={<Counter />} />
                <Route path="/policy" element={<Policy />} />
                <Route path="*" element={<Welcome />} />
            </Routes>
        </div>
    );
}
