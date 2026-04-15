import { usePrivy } from "@privy-io/react-auth";
import store from "../store.js";

import secretariatImg from "@images/secretariat.png";

export default function Profile() {
    const { user, logout } = usePrivy();
    const borfId = store.getBorfId();

    return (
        <div className="flex-grow flex flex-col items-center justify-center overflow-hidden p-4 text-primary">
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
                    className="absolute flex flex-col items-start gap-2 z-10 max-h-full "
                >
                    <h1 className="text-xl uppercase self-center font-bold text-center drop-shadow-[0_0_2px_rgba(63,229,153,0.6)]">
                        borfologist profile
                    </h1>
                    <h2 className="text-black uppercase font-medium  bg-primary [box-shadow:inset_-2px_-2px_0_rgba(0,0,0,0.4)]">
                        borfologist_id(immutable):
                    </h2>
                    <span className="uppercase font-medium drop-shadow-[0_0_2px_rgba(63,229,153,0.6)]">{borfId}</span>
                    <h2 className="text-black uppercase font-medium  bg-primary [box-shadow:inset_-2px_-2px_0_rgba(0,0,0,0.4)]">
                        sec_assignment:
                    </h2>
                    <span className="uppercase font-medium drop-shadow-[0_0_2px_rgba(63,229,153,0.6)]">
                        006 // transmutation_lab
                    </span>
                    <h2 className="text-black uppercase font-medium bg-primary [box-shadow:inset_-2px_-2px_0_rgba(0,0,0,0.4)]">
                        privy_id:
                    </h2>
                    <span className="uppercase font-medium drop-shadow-[0_0_2px_rgba(63,229,153,0.6)]">
                        {user.id.slice(10, 16)}
                        {"*".repeat(user.id.length - 16)}
                    </span>
                    <h2 className="text-black uppercase font-medium bg-primary [box-shadow:inset_-2px_-2px_0_rgba(0,0,0,0.4)]">
                        subject_throughput:
                    </h2>
                    <span className="uppercase font-medium drop-shadow-[0_0_2px_rgba(63,229,153,0.6)]">004_units</span>
                    <h1 className="text-xl uppercase self-center font-bold text-center drop-shadow-[0_0_2px_rgba(63,229,153,0.6)]">
                        status: ready
                    </h1>
                    <button
                        className="self-center uppercase text-black bg-primary [box-shadow:inset_-2px_-2px_0_rgba(0,0,0,0.4)] px-4 py-2"
                        onClick={() => {
                            store.clear();
                            store.clearBorfId();
                            logout();
                        }}
                    >
                        log out
                    </button>
                </div>

                <img
                    className="absolute inset-0 w-full max-h-auto object-contain"
                    src={secretariatImg}
                    alt="secretariat"
                />
            </div>
        </div>
    );
}
