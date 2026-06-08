import menubarImg from "@images/menu-bar.jpg";
import { Link, useLocation } from "react-router-dom";

import iconHomeActive from "@images/icon-home-active.png";
import iconHome from "@images/icon-home.png";
import iconLabActive from "@images/icon-lab-active.png";
import iconLab from "@images/icon-lab.png";
import iconLibraryActive from "@images/icon-library-active.png";
import iconLibrary from "@images/icon-library.png";
import iconStorageActive from "@images/icon-storage-active.png";
import iconStorage from "@images/icon-storage.png";

const NAV_ITEMS = [
    { path: "/", label: "HOME", icon: iconHome, iconActive: iconHomeActive },
    { path: "/lab", label: "LAB", icon: iconLab, iconActive: iconLabActive },
    { path: "/library", label: "LIBRARY", icon: iconLibrary, iconActive: iconLibraryActive },
    { path: "/storage", label: "STONES", icon: iconStorage, iconActive: iconStorageActive },
];

export default function NavMenu() {
    const { pathname } = useLocation();

    return (
        <div
            className="px-4 py-1 flex items-center justify-around"
            style={{
                backgroundImage: `url(${menubarImg})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
            }}
        >
            {NAV_ITEMS.map(({ path, label, icon, iconActive }) => {
                const active = pathname === path;
                return (
                    <Link key={path} to={path} className="flex flex-col items-center gap-0.5 no-underline">
                        <img src={active ? iconActive : icon} alt={label} className="w-8 h-8" />
                        <span className="text-xs font-semibold">{label}</span>
                    </Link>
                );
            })}
        </div>
    );
}
