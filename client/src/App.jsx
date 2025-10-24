import { Routes, Route, useLocation, Link } from "react-router-dom";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { useEffect } from "react";

import Signup from "./screens/Signup";
import Home from "./screens/Home";
import Welcome from "./screens/Welcome";
import Profile from "./screens/Profile";
import Library from "./screens/Library";
import Storage from "./screens/Storage";
import Lab from "./screens/Lab";
import NavMenu from "./components/NavMenu";

import store from "./store";

export default function App() {
    const { ready, authenticated } = usePrivy();
    const { identityToken } = useIdentityToken();
    const location = useLocation();

    useEffect(() => {
        if (ready && authenticated && identityToken) {
            store.setToken(identityToken);
        } else {
            store.clear();
        }
    }, [ready, authenticated, identityToken]);

    const bgMap = {
        "/library": "bg-orange-100",
        "/storage": "bg-black",
    };

    const bgClass = bgMap[location.pathname] ?? "bg-app";

    const synced = localStorage.getItem("synced") === "true";
    const syncedAndAuthenticated = authenticated && synced;

    if (!ready) {
        return <div className="text-black text-center mt-10">Loading...</div>;
    }

    return (
        <div
            className={`flex flex-col bg-cover bg-bottom bg-no-repeat relative w-screen h-screen overflow-hidden font-plex py-6 ${bgClass}`}
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
                <Route path="/" element={syncedAndAuthenticated ? <Home /> : <Signup />} />
                <Route path="/signup" element={!syncedAndAuthenticated ? <Signup /> : <Welcome />} />
                <Route path="/lab" element={syncedAndAuthenticated ? <Lab /> : <Signup />} />
                <Route path="/library" element={syncedAndAuthenticated ? <Library /> : <Signup />} />
                <Route path="/profile" element={syncedAndAuthenticated ? <Profile /> : <Signup />} />
                <Route path="/storage" element={syncedAndAuthenticated ? <Storage /> : <Signup />} />
                <Route path="*" element={<Welcome />} />
            </Routes>
        </div>
    );
}
