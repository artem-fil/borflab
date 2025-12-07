import {
    Connection,
    PublicKey,
    Keypair,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    ComputeBudgetProgram,
} from "@solana/web3.js";

import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

import * as anchor from "@coral-xyz/anchor";

import { usePrivy } from "@privy-io/react-auth";
import { useWallets, useSignTransaction } from "@privy-io/react-auth/solana";

import { useEffect, useState } from "react";

import storageImage from "../assets/storage.jpg";
import agateImage from "../assets/agate.png";
import jadeImage from "../assets/jade.png";
import topazImage from "../assets/topaz.png";
import quartzImage from "../assets/quartz.png";
import sapphireImage from "../assets/sapphire.png";
import amazoniteImage from "../assets/amazonite.png";
import rubyImage from "../assets/ruby.png";

const PROGRAM_ID = new PublicKey("2Wr2VbaMpGA5cLJrdpcHQpRmXtbdyypMoa9VzMuAhV3A");
const STONE_COLLECTION_MINT = new PublicKey("GauJJdY7FtPgjcjhGGcMjWg9xrPAHwNND7ZWYnwxXnG6");
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SYSVAR_RECENT_BLOCKHASHES = new PublicKey("SysvarRecentB1ockHashes11111111111111111111");
const ENDPOINT = "https://api.devnet.solana.com";

const STONE_TYPES = ["Quartz", "Amazonite", "Ruby", "Agate", "Sapphire", "Topaz", "Jade"];

export default function Storage() {
    const { user } = usePrivy();
    const { wallets } = useWallets();
    const { signTransaction } = useSignTransaction();
    const solanaWallet = wallets[0];

    const connection = new Connection(ENDPOINT, "confirmed");

    const [sort, setSort] = useState(false);
    const [selected, setSelected] = useState(null);
    const [stones, setStones] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (solanaWallet?.address) {
            loadStonesData();
        }
    }, [solanaWallet?.address]);

    async function loadStonesData() {
        setLoading(true);
        try {
            const publicKey = new PublicKey(solanaWallet.address);

            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
                programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
            });

            const stonesSparks = {};
            STONE_TYPES.forEach((type) => {
                stonesSparks[type] = 0;
            });

            for (const tokenAccount of tokenAccounts.value) {
                const mint = new PublicKey(tokenAccount.account.data.parsed.info.mint);
                const amount = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;

                if (amount === 0) continue;

                try {
                    const [stoneStatePda] = PublicKey.findProgramAddressSync(
                        [new TextEncoder().encode("stone_state"), mint.toBuffer()],
                        PROGRAM_ID
                    );

                    const [metadataPda] = PublicKey.findProgramAddressSync(
                        [new TextEncoder().encode("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
                        TOKEN_METADATA_PROGRAM_ID
                    );

                    const [accountInfo, metadataAccount] = await Promise.all([
                        connection.getAccountInfo(stoneStatePda),
                        connection.getAccountInfo(metadataPda),
                    ]);

                    if (!accountInfo || !metadataAccount) continue;

                    const sparksRemaining = new DataView(accountInfo.data.buffer).getUint16(40, true);

                    const view = new DataView(metadataAccount.data.buffer);
                    let offset = 65;

                    offset += 4 + view.getUint32(offset, true);
                    offset += 4 + view.getUint32(offset, true);

                    const uriLength = view.getUint32(offset, true);
                    offset += 4;
                    const uriBytes = new Uint8Array(metadataAccount.data.buffer, offset, uriLength);
                    const uri = new TextDecoder().decode(uriBytes);

                    if (!uri) continue;

                    const response = await fetch(uri);
                    if (!response.ok) continue;

                    const metadataJSON = await response.json();
                    const stoneName = metadataJSON.name;

                    if (STONE_TYPES.includes(stoneName)) {
                        stonesSparks[stoneName] += sparksRemaining;
                        console.log(`stone: ${stoneName} sparks: ${sparksRemaining} address: ${mint.toBase58()}`);
                    }
                } catch (error) {
                    continue;
                }
            }

            setStones(stonesSparks);
        } catch (error) {
            console.error("Error loading stones data:", error);
            const emptyStones = {};
            STONE_TYPES.forEach((type) => {
                emptyStones[type] = 0;
            });
            setStones(emptyStones);
        } finally {
            setLoading(false);
        }
    }

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
            const user_id = 12345;

            const transaction = await program.methods
                .mintStoneInstance(user_id)
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

    const formatSparks = (stone) => (loading ? "..." : (stones[stone] || 0).toString().padStart(2, "0"));

    return (
        <div className="flex-grow flex flex-col items-center text-white py-2">
            <div className="w-full flex justify-between px-6">
                <div className="flex flex-col">
                    <h2 className=" font-bold text-xl">BORFstone storage</h2>
                    <span className="text-xs">AUTHORIZED ACCESS ONLY // DEPT. 006</span>
                </div>
                <div className="relative">
                    <button className="h-full bg-red-500" onClick={() => setSort(!sort)}>
                        close
                    </button>
                </div>
            </div>
            <div className="w-full flex-grow">
                {selected ? (
                    <div className="w-full h-full flex items-center justify-center">
                        <img
                            src={selected}
                            alt="selected"
                            className="max-h-full max-w-full object-contain cursor-pointer transition-transform duration-300 hover:scale-105"
                            onClick={() => setSelected(null)}
                        />
                    </div>
                ) : (
                    <div className="relative">
                        <img
                            src={agateImage}
                            style={{
                                top: "35%",
                                left: "39.5%",
                                width: "20%",
                            }}
                            alt="agate"
                            className="absolute"
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "51%",
                                left: "39.5%",
                                width: "21%",
                            }}
                        >
                            <div className="">sparks</div>
                            <div className="flex justify-between">
                                <div className="text-left">agate</div>
                                <div className="text-right">{formatSparks("Agate")}</div>
                            </div>
                        </div>
                        <img
                            src={jadeImage}
                            style={{
                                top: "21.5%",
                                left: "67%",
                                width: "20%",
                            }}
                            alt="jade"
                            className="absolute"
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "38%",
                                left: "66%",
                                width: "21%",
                            }}
                        >
                            <div className="">sparks</div>
                            <div className="flex justify-between">
                                <div className="text-left">jade</div>
                                <div className="text-right">{formatSparks("Jade")}</div>
                            </div>
                        </div>
                        <img
                            src={topazImage}
                            alt="topaz"
                            style={{
                                top: "60%",
                                left: "39.5%",
                                width: "20%",
                            }}
                            className="absolute"
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "75.7%",
                                left: "39.5%",
                                width: "21%",
                            }}
                        >
                            <div className="">sparks</div>
                            <div className="flex justify-between">
                                <div className="text-left">topaz</div>
                                <div className="text-right">{formatSparks("Topaz")}</div>
                            </div>
                        </div>
                        <img
                            src={quartzImage}
                            style={{
                                top: "10.5%",
                                left: "11.5%",
                                width: "20%",
                            }}
                            alt="quartz"
                            className="absolute"
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "26.7%",
                                left: "10.6%",
                                width: "21%",
                            }}
                        >
                            <div className="">sparks</div>
                            <div className="flex justify-between">
                                <div className="text-left">quartz</div>
                                <div className="text-right">{formatSparks("Quartz")}</div>
                            </div>
                        </div>
                        <img
                            src={sapphireImage}
                            style={{
                                top: "59.5%",
                                left: "12%",
                                width: "20%",
                            }}
                            alt="sapphire"
                            className="absolute"
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "75.7%",
                                left: "10.6%",
                                width: "21%",
                            }}
                        >
                            <div className="">sparks</div>
                            <div className="flex justify-between">
                                <div className="text-left">sapphire</div>
                                <div className="text-right">{formatSparks("Sapphire")}</div>
                            </div>
                        </div>
                        <img
                            src={amazoniteImage}
                            style={{
                                top: "10.5%",
                                left: "40%",
                                width: "20%",
                            }}
                            alt="amazonite"
                            className="absolute"
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "26.7%",
                                left: "39.5%",
                                width: "21%",
                            }}
                        >
                            <div className="">sparks</div>
                            <div className="flex justify-between">
                                <div className="text-left">amazonite</div>
                                <div className="text-right">{formatSparks("Amazonite")}</div>
                            </div>
                        </div>
                        <img
                            src={rubyImage}
                            style={{
                                top: "35%",
                                left: "11.5%",
                                width: "20%",
                            }}
                            alt="ruby"
                            className="absolute"
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "51%",
                                left: "10.6%",
                                width: "21%",
                            }}
                        >
                            <div className="">sparks</div>
                            <div className="flex justify-between">
                                <div className="text-left">ruby</div>
                                <div className="text-right">{formatSparks("Ruby")}</div>
                            </div>
                        </div>
                        <div
                            className="uppercase leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "86%",
                                left: "10.6%",
                            }}
                        >
                            {`>>spark energy stable...`}
                        </div>
                        <div
                            className="uppercase leading-none absolute text-xs text-cyan-500"
                            style={{
                                top: "46%",
                                left: "67%",
                            }}
                        >
                            {`sparks >>`}
                        </div>
                        <img src={storageImage} alt="storage" className="w-full h-auto object-contain" />
                    </div>
                )}
            </div>
            <div>
                <button
                    onClick={mintStone}
                    disabled={!solanaWallet}
                    className="mt-4 px-4 py-2 rounded bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white"
                >
                    {"Mint Stone"}
                </button>
            </div>
        </div>
    );
}
