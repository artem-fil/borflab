import {
    Connection,
    PublicKey,
    Keypair,
    SystemProgram,
    Transaction,
    SYSVAR_RENT_PUBKEY,
    ComputeBudgetProgram,
    SendTransactionError,
    VersionedTransaction,
} from "@solana/web3.js";

import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

import * as anchor from "@coral-xyz/anchor";

import { useWallets, useSignTransaction } from "@privy-io/react-auth/solana";

import { usePrivy } from "@privy-io/react-auth";

import { useEffect, useState } from "react";

const PROGRAM_ID = new PublicKey("2Wr2VbaMpGA5cLJrdpcHQpRmXtbdyypMoa9VzMuAhV3A");
const STONE_COLLECTION_MINT = new PublicKey("GauJJdY7FtPgjcjhGGcMjWg9xrPAHwNND7ZWYnwxXnG6");
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SYSVAR_RECENT_BLOCKHASHES = new PublicKey("SysvarRecentB1ockHashes11111111111111111111");
const ENDPOINT = "https://api.devnet.solana.com";

const STONE_TYPES = ["Quartz", "Amazonite", "Ruby", "Agate", "Sapphire", "Topaz", "Jade"];

export default function Profile() {
    const { user, logout } = usePrivy();
    const { wallets } = useWallets();
    const { signTransaction } = useSignTransaction();
    const solanaWallet = wallets[0];

    const email = user?.email?.address || "—";
    const [balance, setBalance] = useState(null);
    const [userNFTs, setUserNFTs] = useState([]);
    const [nftData, setNftData] = useState([]);

    const connection = new Connection(ENDPOINT, "confirmed");

    useEffect(() => {
        if (!solanaWallet) return;

        const walletPubkey = new PublicKey(solanaWallet.address);

        async function fetchBalanceAndNFTs() {
            const lamports = await connection.getBalance(walletPubkey);
            setBalance(lamports / 1e9);

            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
                programId: TOKEN_PROGRAM_ID,
            });

            const nfts = tokenAccounts.value
                .map((acc) => acc.account.data.parsed.info)
                .filter((info) => info.tokenAmount.decimals === 0 && info.tokenAmount.uiAmount === 1)
                .map((info) => info.mint);

            setUserNFTs(nfts);
        }

        fetchBalanceAndNFTs();
    }, [solanaWallet]);
    /*
    useEffect(() => {
        if (!userNFTs || userNFTs.length === 0) return;

        async function loadMetadata() {
            const data = await Promise.all(
                userNFTs.map(async (mint) => {
                    const meta = await fetchNftMetadata(mint);
                    return {
                        mint,
                        meta,
                        image: meta?.image || "/placeholder-nft.png",
                        name: meta?.name || "Unknown NFT",
                        description: meta?.description || "No description",
                    };
                })
            );
            setNftData(data);
        }

        loadMetadata();
    }, [userNFTs]);

    async function fetchNftMetadata(mint) {
        try {
            const [metadataPDA] = PublicKey.findProgramAddressSync(
                [
                    new TextEncoder().encode("metadata"),
                    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                    new PublicKey(mint).toBuffer(),
                ],
                TOKEN_METADATA_PROGRAM_ID
            );

            const accountInfo = await connection.getAccountInfo(metadataPDA);
            if (!accountInfo) {
                console.log("No metadata account found for", mint);
                return null;
            }

            const str = accountInfo.data.toString();
            const uriIndex = str.indexOf("https://");
            if (uriIndex === -1) return null;

            let uri = "";
            for (let i = uriIndex; i < str.length; i++) {
                if (str[i] === "\0" || str[i] === '"' || str[i] === "'" || str[i] === ",") {
                    break;
                }
                uri += str[i];
            }

            console.log("Fetching metadata from:", uri);

            const metadata = await fetchWithProxy(uri);
            return metadata;
        } catch (err) {
            console.error("Failed to fetch NFT metadata for", mint, err);
            return null;
        }
    }

    const fetchWithProxy = async (url) => {
        if (!url || !url.startsWith("http")) {
            console.error("Invalid URL:", url);
            return null;
        }

        const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
            `https://corsproxy.io/?${encodeURIComponent(url)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        ];

        for (const proxyUrl of proxies) {
            try {
                console.log("Trying proxy:", proxyUrl);
                const response = await fetch(proxyUrl, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    timeout: 10000,
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log("Successfully fetched metadata via proxy");
                    return data;
                }
            } catch (error) {
                console.log(`Proxy failed: ${proxyUrl}`, error);
                continue;
            }
        }

        console.error("All proxies failed for URL:", url);
        return null;
    };
    */

    async function mintStone() {
        try {
            // === VALIDATION ===

            solanaWallet.publicKey = new PublicKey(solanaWallet.address);

            if (!solanaWallet || !solanaWallet.publicKey || !solanaWallet.signTransaction) {
                throw new Error("Wallet not connected");
            }

            // === SETUP ===
            const programId = new PublicKey(PROGRAM_ID);

            const provider = new anchor.AnchorProvider(connection, solanaWallet, { commitment: "confirmed" });
            anchor.setProvider(provider);

            const program = new anchor.Program(idl, provider);
            const collectionMint = new PublicKey(STONE_COLLECTION_MINT);

            console.log("🔧 Program initialized:", programId.toBase58());

            // === STONE TYPE PDAs ===
            const stoneTypePdas = [];
            console.log("📊 Fetching stone type stats...");

            for (const stoneType of STONE_TYPES) {
                const [stoneTypePda] = PublicKey.findProgramAddressSync(
                    [new TextEncoder().encode("stone_type"), new TextEncoder().encode(stoneType)],
                    programId
                );
                stoneTypePdas.push(stoneTypePda);

                try {
                    const stoneTypeAccount = await program.account.stoneType.fetch(stoneTypePda);
                    console.log(
                        `   ${stoneType}: ${stoneTypeAccount.mintedCount}/${stoneTypeAccount.supplyCap} minted`
                    );
                } catch (err) {
                    console.log(`   ${stoneType}: Not initialized. ${err}`);
                }
            }

            // === KEY PAIRS & PDAs ===
            const [collectionAuthority] = PublicKey.findProgramAddressSync(
                [new TextEncoder().encode("collection_authority")],
                programId
            );

            const mintKeypair = Keypair.generate();
            const mint = mintKeypair.publicKey;

            console.log("🔑 Generated new mint:", mint.toBase58());

            // === ACCOUNT DERIVATION ===
            const ownerAta = await getAssociatedTokenAddress(
                mint,
                solanaWallet.publicKey,
                false,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

            const [stoneStatePda] = PublicKey.findProgramAddressSync(
                [new TextEncoder().encode("stone_state"), mint.toBytes()],
                programId
            );

            const [metadata] = PublicKey.findProgramAddressSync(
                [new TextEncoder().encode("metadata"), TOKEN_METADATA_PROGRAM_ID.toBytes(), mint.toBytes()],
                TOKEN_METADATA_PROGRAM_ID
            );

            const [masterEdition] = PublicKey.findProgramAddressSync(
                [
                    new TextEncoder().encode("metadata"),
                    TOKEN_METADATA_PROGRAM_ID.toBytes(),
                    mint.toBytes(),
                    new TextEncoder().encode("edition"),
                ],
                TOKEN_METADATA_PROGRAM_ID
            );

            const [collectionMetadata] = PublicKey.findProgramAddressSync(
                [new TextEncoder().encode("metadata"), TOKEN_METADATA_PROGRAM_ID.toBytes(), collectionMint.toBytes()],
                TOKEN_METADATA_PROGRAM_ID
            );

            const [collectionMasterEdition] = PublicKey.findProgramAddressSync(
                [
                    new TextEncoder().encode("metadata"),
                    TOKEN_METADATA_PROGRAM_ID.toBytes(),
                    collectionMint.toBytes(),
                    new TextEncoder().encode("edition"),
                ],
                TOKEN_METADATA_PROGRAM_ID
            );

            const [treasury] = PublicKey.findProgramAddressSync([new TextEncoder().encode("treasury")], programId);

            // === TRANSACTION CONSTRUCTION ===
            const mintRent = await connection.getMinimumBalanceForRentExemption(82);
            const createMintAccountIx = SystemProgram.createAccount({
                fromPubkey: solanaWallet.publicKey,
                newAccountPubkey: mint,
                space: 82,
                lamports: mintRent,
                programId: TOKEN_PROGRAM_ID,
            });

            console.log("📦 Building transaction...");

            const transaction = await program.methods
                .mintStoneInstance()
                .accounts({
                    mint,
                    owner: solanaWallet.publicKey,
                    ownerAta,
                    stoneState: stoneStatePda,
                    collectionMint,
                    collectionMetadata,
                    collectionMasterEdition,
                    metadata,
                    masterEdition,
                    collectionAuthority,
                    treasury,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY,
                    recentBlockhashes: SYSVAR_RECENT_BLOCKHASHES,
                })
                .remainingAccounts(
                    stoneTypePdas.map((pda) => ({
                        pubkey: pda,
                        isWritable: true,
                        isSigner: false,
                    }))
                )
                .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }), createMintAccountIx])
                .signers([mintKeypair])
                .transaction();

            // === TRANSACTION SIGNING ===
            console.log("✍️ Signing transaction...");

            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

            transaction.recentBlockhash = blockhash;
            transaction.feePayer = solanaWallet.publicKey;
            transaction.partialSign(mintKeypair);

            const serializedTx = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
            const txUint8Array = new Uint8Array(serializedTx);

            const { signedTransaction } = await signTransaction({
                wallet: solanaWallet,
                transaction: txUint8Array,
                chain: "solana:devnet",
            });

            // === TRANSACTION EXECUTION ===
            console.log("🚀 Sending transaction...");

            const txid = await connection.sendRawTransaction(signedTransaction);

            const confirmation = await connection.confirmTransaction(
                {
                    signature: txid,
                    blockhash,
                    lastValidBlockHeight,
                },
                "confirmed"
            );

            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${confirmation.value.err}`);
            }

            // === POST-MINT VERIFICATION ===
            console.log("✅ NFT minted successfully!");
            console.log("🎉 Result:");
            console.log(`   Transaction: ${txid}`);
            console.log(`   Mint: ${mint.toBase58()}`);
            console.log(`   Explorer: https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`);
            console.log(`   TX Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);

            const stoneState = await program.account.stoneState.fetch(stoneStatePda);
            console.log("🎮 Stone state:");
            console.log(`   Sparks: ${stoneState.sparksRemaining}/42`);

            console.log("📊 Updated stone type stats:");
            for (const stoneType of STONE_TYPES) {
                const [stoneTypePda] = PublicKey.findProgramAddressSync(
                    [new TextEncoder().encode("stone_type"), new TextEncoder().encode(stoneType)],
                    programId
                );

                try {
                    const stoneTypeAccount = await program.account.stoneType.fetch(stoneTypePda);
                    console.log(
                        `   ${stoneType}: ${stoneTypeAccount.mintedCount}/${stoneTypeAccount.supplyCap} minted`
                    );
                } catch (err) {
                    console.log(`   ${stoneType}: Not initialized. ${err}`);
                }
            }

            return {
                txid,
                mint: mint.toBase58(),
            };
        } catch (error) {
            console.error("❌ Minting failed:", error);

            if (error.logs) {
                console.error("📋 Transaction logs:");
                error.logs.forEach((log) => console.error(`${log}`));
            }

            throw error;
        }
    }

    async function mintCard() {
        try {
            const TxBase64 =
                "AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAasN1lW72ca5Z78G2wG7ybvZnYMt3PnY95XWHjJjVktbtbY/WzeXHGcXpaUZ2uSMZqVHc/PoUUtgWtx+sVntwNvxumg1j4g1MM1qJDwHQgTpwwRe2mGiVbi3HAElUGQyVdVAckoPY5V0+cuyllmh4KZvuhtWj2ldjUZKBuKNUKDQMBChforvMDkOCOh1corhmJy6eke8apbT0kljl2RX6mONUgH5ihXgUaVWXYuoGg/gN0fwOWWaFqMbImBonwjq3oz+DLontb67VIKTWWH/pvENee9Cm8ra/lQK8I3ngsLXoX4wDG3LSGUxlsD/RaS2dcBzPz7ZUlYbloJkexPDRu5p0vEM7y5n2K3YOgr3uQ5uGS1NL8SEiiIE7TRsYrllYiE7BTL6lQKzZdbrpSNypBJIoD7TS6rVFHTQvKxVRbuss16hPGNBHOZz1SU0GZxVdg8jdGl8hs8IC3iPg8Ac3yIhJxtEPFHWdR7w3oktLLaMOV4f+DBo5wfMiROo/2h0o+5pfv2Mh13qGm8VunKVk2FPUBuYeAV3BVXnCfIWFFE2TndbcQ/gciIV56ldWjUmL3LFDQN8YYLMLLny/acv8VZWMDTPsEr+TiiBPaV7EgivrMLRD/t43Xh+ecnrP7JY1ByjFwIKgzGbXH5f6ehJsXnggFLVKsVHV/iiSrF/fpEuJhFXt+EzrCcApHJAjWZq5/EtpfT+RgS02NpujMNug9FzbzSvcfl6MAm1CQW60puS/4Da5VPVVYbzXcAmaDucw40nxUlzS3pCyd38laVbA/0+SQIWVXHVGjZoOz5A1yz9UUSgBfOZNLaT/CjHWzFhz0ycl4Tm2n1H++RFO9jmC1fg3jDAbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpjJclj04kifG7PRApFI4NgwtaE5na/xCEBI572Nvp+FkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAtwZbHj0XxFOJ1Sf2sEw81YuGxzGqD9tUm20bwD+ClGBqfVFxksXFEhjMlMPUrxf1ja7gibof1E49vZigAAAAADBkZv5SEXMv/srbpyw5vnvIzlu8X3EmssQ5s6QAAAABaA9sbq9fvzRGRyjcMJxc03/cp6EPPcLzQzTwFKTNQ9eSeOYrVMKpq39CH/Iyz68x3thHOnCHnEQHJH6eq7VLUDFQAFAuCTBAASAgABNAAAAABgTRYAAAAAAFIAAAAAAAAABt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKkWFQEAAwINDgQFBgcPCAkKCwwQERITFKYBBLZT2egjIUAKAAAAVHVyYm96ZWxsZWsAAABUaGlzIGNyZWF0dXJlIGV4dWRlcyBjb25maWRlbmNlLCBpbnNwaXJpbmcgYXdlIGFuZCBlbnRodXNpYXNtIGFtb25nIHRob3NlIHdobyBlbmNvdW50ZXIgaXRzIGVuZXJnZXRpYyBkYXNoLggAAABhbWF6b25pYQYAAABteXRoaWMHAAAAaXBmczovLw==";
            function base64ToUint8Array(base64) {
                const raw = atob(base64);
                const array = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) {
                    array[i] = raw.charCodeAt(i);
                }
                return array;
            }
            const tx = Transaction.from(base64ToUint8Array(TxBase64));

            const connection = new Connection(ENDPOINT, "confirmed");
            const result = await connection.simulateTransaction(tx, [], false);

            console.log(result.value.err);
            console.log(result.value.logs);
            return;
        } catch (err) {
            console.error("❌ Transaction failed:");
            console.error(err);
            if (err instanceof SendTransactionError) {
                const logs = await err.getLogs(connection);
                console.log("🔍 Simulation logs:", logs);
            }
        }
    }

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
                    <button
                        onClick={mintStone}
                        disabled={!solanaWallet}
                        className="mt-4 px-4 py-2 rounded bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white"
                    >
                        {"Mint Stone"}
                    </button>
                    <button
                        onClick={mintCard}
                        disabled={!solanaWallet}
                        className="mt-4 px-4 py-2 rounded bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white"
                    >
                        {"Mint Card"}
                    </button>
                    <div className="flex flex-col gap-1 mt-2">
                        <div className="text-sm text-white/70">NFTs:</div>
                        {nftData.length === 0 ? (
                            <div className="text-sm font-mono">No NFTs found</div>
                        ) : (
                            <div className="flex flex-col text-xs gap-2 ">
                                {nftData.map((nft) => {
                                    const { mint, image, name } = nft;
                                    return (
                                        <div key={mint}>
                                            <img
                                                src={image}
                                                alt={name}
                                                className="h-24"
                                                onError={(e) => {
                                                    e.target.src = "/placeholder-nft.png";
                                                }}
                                            />
                                            <h3>
                                                <pre>{JSON.stringify(nft, null, 2)}</pre>
                                            </h3>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
