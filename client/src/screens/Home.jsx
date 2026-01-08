import { Link } from "react-router-dom";

import secretariatImg from "@images/secretariat.png";
import labImg from "@images/lab.png";
import swapImg from "@images/swap.png";
import shopImg from "@images/shop.png";
import libraryImg from "@images/library.png";
import profileImg from "@images/profile.png";
import storageImg from "@images/storage.png";

export default function Home() {
    const menuItems = {
        profile: profileImg,
        library: libraryImg,
        lab: labImg,
        shop: shopImg,
        storage: storageImg,
        swapomat: swapImg,
    };

    return (
        <div className="flex-grow flex flex-col items-center justify-center overflow-hidden p-4">
            <div
                className="relative flex items-center justify-center max-h-full w-full"
                style={{ aspectRatio: "0.55 / 1" }}
            >
                <div
                    style={{
                        top: "15%",
                        width: "80%",
                        height: "64%",
                    }}
                    className="px-2 absolute grid grid-cols-2 gap-4 z-10 max-h-full w-full "
                >
                    {Object.entries(menuItems).map(([item, icon]) => {
                        return (
                            <Link
                                to={`/${item}`}
                                className="border border-lime-500 rounded-xl p-2 flex items-center flex-col justify-between"
                            >
                                <img className="w-12" src={icon} alt={item} />
                                <span className="text-xl text-lime-500">{item}</span>
                            </Link>
                        );
                    })}
                </div>

                <img
                    className="absolute inset-0 w-full max-h-auto object-contain"
                    src={secretariatImg}
                    alt="swapomat"
                />
            </div>
        </div>
    );
}
