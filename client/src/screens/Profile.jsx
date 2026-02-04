import { usePrivy } from "@privy-io/react-auth";

export default function Profile() {
    const { user, logout } = usePrivy();

    const email = user?.email?.address || "—";

    return (
        <div className="flex-grow flex flex-col items-center p-3 text-xs">
            <div className="w-full max-w-xl rounded-2xl bg-black/60 text-white p-5 shadow-xl backdrop-blur-md border border-white/10">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold">Profile</h3>
                    </div>
                    <button
                        onClick={() => {
                            localStorage.removeItem("primaryWallet");
                            logout();
                        }}
                        className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20"
                    >
                        Log out
                    </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-3">
                    <div className="flex gap-2 items-center justify-between">
                        <div className="w-12 text-white/70">Id</div>
                        <div className="flex-1 truncate">{user.id.slice(-6)}</div>
                    </div>
                    <div className="flex gap-2 items-center justify-between">
                        <div className="w-12 text-white/70">E-mail</div>
                        <div className="flex-1 truncate">{email}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
