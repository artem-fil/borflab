import { Connection, PublicKey } from "@solana/web3.js";
import { useWallets } from "@privy-io/react-auth/solana";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";

const ENDPOINT = "https://api.devnet.solana.com";

export default function Profile() {
    const { user, logout } = usePrivy();
    const { wallets } = useWallets();
    const solanaWallet = wallets[0];

    const email = user?.email?.address || "—";
    const [balance, setBalance] = useState(null);

    const connection = new Connection(ENDPOINT, "confirmed");

    useEffect(() => {
        if (!solanaWallet) return;

        const walletPubkey = new PublicKey(solanaWallet.address);

        async function fetchBalance() {
            const lamports = await connection.getBalance(walletPubkey);
            setBalance(lamports / 1e9);
        }

        fetchBalance();
    }, [solanaWallet]);

    return (
        <div className="flex-grow flex flex-col items-center p-6">
            <div className="w-full max-w-xl rounded-2xl bg-black/60 text-white p-5 shadow-xl backdrop-blur-md border border-white/10">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold">Profile</h3>
                    </div>
                    <button
                        onClick={() => {
                            localStorage.removeItem("synced");
                            logout();
                        }}
                        className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20"
                    >
                        Log out
                    </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-24 text-sm text-white/70">E-mail</div>
                        <div className="flex-1 truncate text-sm">{email}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-24 text-sm text-white/70">Wallet</div>
                        <div className="flex-1 truncate text-sm font-mono">{solanaWallet?.address}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-24 text-sm text-white/70">Balance</div>
                        <div className="flex-1 truncate text-sm font-mono">
                            {balance === null ? "fetching…" : `${balance.toFixed(4)} SOL`}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
