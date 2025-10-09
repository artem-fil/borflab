import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import Signup from "./screens/Signup";
import Home from "./screens/Home";
import Welcome from "./screens/Welcome";
import Library from "./screens/Library";
import Lab from "./screens/Lab";
import NavMenu from "./components/NavMenu";
import { Link } from "react-router-dom";

export default function App() {
    const { ready, authenticated } = usePrivy();
    const location = useLocation();

    if (!ready) {
        return <div className="text-white text-center mt-10">Loading...</div>;
    }

    return (
        <div
            className={`flex flex-col bg-cover bg-bottom bg-no-repeat relative w-screen h-screen overflow-hidden font-plex py-6 ${
                location.pathname === "/library" ? "bg-orange-100" : "bg-app"
            }`}
        >
            {location.pathname !== "/welcome" && (
                <div className="flex justify-between items-center w-full px-6">
                    <Link to="/">🌀</Link>
                    <NavMenu />
                </div>
            )}
            <Routes>
                <Route path="/welcome" element={<Welcome authenticated={authenticated} />} />
                <Route path="/" element={authenticated ? <Home /> : <Navigate to="/welcome" />} />
                <Route path="/signup" element={!authenticated ? <Signup /> : <Navigate to="/" />} />
                <Route path="/lab" element={!authenticated ? <Lab /> : <Navigate to="/welcome" />} />
                <Route path="/library" element={!authenticated ? <Library /> : <Navigate to="/welcome" />} />
                <Route path="*" element={<Navigate to="/welcome" />} />
            </Routes>
        </div>
    );
}
