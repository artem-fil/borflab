package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/gagliardetto/solana-go"
	computebudget "github.com/gagliardetto/solana-go/programs/compute-budget"
	"github.com/gagliardetto/solana-go/programs/system"
	"github.com/gagliardetto/solana-go/rpc"
)

const (
	OpenAICompletionURL = "https://api.openai.com/v1/chat/completions"
	OpenAIGenerationURL = "https://api.openai.com/v1/images/generations"
	PinataPinFileUrl    = "https://api.pinata.cloud/pinning/pinFileToIPFS"
)

var (
	tasks = sync.Map{}
)

type TaskStatus struct {
	ExperimentId int    `json:"experimentId"`
	Progress     int    `json:"progress"`
	Done         bool   `json:"done"`
	Error        string `json:"error,omitempty"`
	Result       any    `json:"result,omitempty"`
	NextTaskId   string `json:"nextTask,omitempty"`
}

type api struct {
	cfg      *Config
	db       *DB
	telegram *Telegram
}

func NewApi(cfg *Config, db *DB, telegram *Telegram) *api {
	return &api{cfg, db, telegram}
}

func (a *api) Ping(rw *Responder, r *http.Request) {

	fmt.Fprint(rw, "pong")
}

func (a *api) SyncUser(w *Responder, r *http.Request) {

	ctx := r.Context()
	claims, _ := Claims(r)

	user := User{
		PrivyId: claims.Id,
	}

	if maybeEmail, ok := claims.Email(); ok {
		user.Email = maybeEmail
	}
	if maybeWallet, ok := claims.Wallet(); ok {
		user.Wallet = maybeWallet
	}

	syncedUser, err := a.db.UpsertUser(ctx, &user)
	if err != nil {
		a.DbError(w, err)
		return
	}
	w.Send(syncedUser)
}

func (a *api) AnalyzeSpecimen(w *Responder, r *http.Request) {

	taskID := uuid.NewString()

	tasks.Store(taskID, &TaskStatus{
		Progress: 0,
		Done:     false,
	})

	time.AfterFunc(5*time.Minute, func() {
		tasks.Delete(taskID)
	})

	stone, err := CheckStone(r.FormValue("stone"))
	if err != nil || stone == nil {
		a.BadRequestError(w, err)
		return
	}
	biome, err := CheckBiome(r.FormValue("biome"))
	if err != nil || biome == nil {
		a.BadRequestError(w, err)
		return
	}

	imgFile, _, err := r.FormFile("file")
	if err != nil {
		a.InternalError(w, err)
		return
	}
	defer imgFile.Close()

	imgBytes, err := io.ReadAll(imgFile)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	// input metadata
	inputMime, inputWidth, inputHeight, inputSize, err := imageInfo(imgBytes)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	resizedImg, err := resizeAndConvert(bytes.NewReader(imgBytes), 2000)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	// processed metadata
	processedMime, processedWidth, processedHeight, processedSize, err := imageInfo(resizedImg)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	claims, _ := Claims(r)

	experiment := &Experiment{
		UserId:          claims.Id,
		InputMime:       inputMime,
		InputWidth:      inputWidth,
		InputHeight:     inputHeight,
		InputSize:       inputSize,
		ProcessedMime:   processedMime,
		ProcessedWidth:  processedWidth,
		ProcessedHeight: processedHeight,
		ProcessedSize:   processedSize,
		ProcessedImage:  resizedImg,
		Stone:           *stone,
		Biome:           *biome,
		Created:         time.Now().UTC(),
	}
	insertedExperiment, err := a.db.InsertExperiment(r.Context(), experiment)
	if err != nil {
		a.DbError(w, fmt.Errorf("cannot insert experiment %v", err))
		return
	}

	go a.processImage(taskID, resizedImg, insertedExperiment)

	response := struct {
		Id string
	}{
		Id: taskID,
	}
	w.Send(response)
}

func (a *api) processImage(taskID string, imgBytes []byte, experiment *Experiment) {

	fail := func(msg string, err error) {
		if task, ok := tasks.Load(taskID); ok {
			LogError("API", msg, err)
			if t, ok := task.(*TaskStatus); ok {
				t.Error = msg
				t.Done = true
				t.Progress = 100
			} else {
				LogError("API", "cannot cast TaskStatus", err)
			}
		}
	}

	doneChan := make(chan struct{})
	go simulateProgress(taskID, 1, 99, 40*time.Second, doneChan)

	requestBody := map[string]any{
		"model": "gpt-4o",
		"messages": []map[string]any{
			{
				"role": "system",
				"content": []any{
					map[string]any{
						"type": "text",
						"text": Prompts[AnalyzeSpecimen],
					},
				},
			},
			{
				"role": "user",
				"content": []any{
					map[string]any{
						"type": "text",
						"text": "Here's an image",
					},
					map[string]any{
						"type": "image_url",
						"image_url": map[string]any{
							"url": "data:image/jpeg;base64," + encodeToBase64(imgBytes),
						},
					},
				},
			},
		},
		"max_tokens": 1000,
	}

	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		fail("cannot marshal json", err)
		return
	}

	req, err := http.NewRequest(
		http.MethodPost,
		OpenAICompletionURL,
		bytes.NewReader(bodyBytes),
	)
	if err != nil {
		fail("cannot create request", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.cfg.OpenAIToken)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fail("cannot make external request", err)
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		fail("cannot read OpenAI response body", err)
		return
	}

	if resp.StatusCode != http.StatusOK {
		fail("OpenAI API refused", fmt.Errorf("status %d: %s", resp.StatusCode, string(respBody)))
		return
	}
	close(doneChan)

	var rawResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	err = json.Unmarshal(respBody, &rawResp)
	if err != nil {
		fail("cannot parse OpenAI response", err)
		return
	}

	sanitizedJson, err := sanitizeJSON(rawResp.Choices[0].Message.Content)
	if err != nil {
		fail("malformed json response", err)
		return
	}
	if task, ok := tasks.Load(taskID); ok {
		if t, ok := task.(*TaskStatus); ok {
			t.Done = true
			var parsed map[string]any
			err := json.Unmarshal(sanitizedJson, &parsed)
			if err != nil {
				t.Error = "invalid json result"
				return
			}

			maybeError, hasError := parsed["Error"]
			if hasError {
				t.Error = maybeError.(string)
				return
			}

			analyzed := time.Now().UTC()
			experiment := Experiment{
				Id:       experiment.Id,
				Specimen: sanitizedJson,
				Analyzed: &analyzed,
			}

			_, err = a.db.AnalyzeExperiment(context.Background(), &experiment)
			if err != nil {
				fail("cannot continue experiment", err)
				return
			}

			nextTask := uuid.NewString()
			go a.generateImage(nextTask, parsed, experiment)
			tasks.Store(nextTask, &TaskStatus{
				Progress: 0,
				Done:     false,
			})
			t.Progress = 100
			t.Result = parsed
			t.NextTaskId = nextTask
		} else {
			LogError("API", "cannot cast TaskStatus", err)
		}
	}
}

func (a *api) generateImage(taskID string, specimen map[string]any, experiment Experiment) {

	fail := func(msg string, err error) {
		LogError("API", msg, err)
		if t, ok := tasks.Load(taskID); ok {
			if ts, ok := t.(*TaskStatus); ok {
				ts.Error = msg
				ts.Done = true
				ts.Progress = 100
			}
		}
	}

	prompt, promptOk := specimen["RENDER_DIRECTIVE"]
	profile, profileOk := specimen["MONSTER_PROFILE"].(map[string]any)
	name, nameOk := profile["name"]
	description, descriptionOk := profile["lore"]
	if !promptOk || !profileOk || !nameOk || !descriptionOk {
		fail("cannot parse speciment", fmt.Errorf("donno"))
		return
	}

	requestBody := map[string]any{
		"model":      "gpt-image-1",
		"n":          1,
		"size":       "1024x1536",
		"quality":    "medium",
		"prompt":     prompt,
		"moderation": "low",
	}
	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		fail("cannot marshal json", err)
		return
	}

	req, err := http.NewRequest(http.MethodPost, OpenAIGenerationURL, bytes.NewReader(bodyBytes))
	if err != nil {
		fail("cannot create request", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.cfg.OpenAIToken)

	generationChan := make(chan struct{})
	go simulateProgress(taskID, 1, 75, 50*time.Second, generationChan)
	defer close(generationChan)

	client := &http.Client{}
	resp, err := client.Do(req)

	if err != nil {
		fail("cannot make external request", err)
		return
	}

	respBody, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		fail("cannot read OpenAI response body", err)
		return
	}
	if resp.StatusCode != http.StatusOK {
		fail("OpenAI API refused", fmt.Errorf("status %d: %s", resp.StatusCode, string(respBody)))
		return
	}

	var parsed struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil || len(parsed.Data) == 0 || parsed.Data[0].B64JSON == "" {
		fail("invalid json result from OpenAI", err)
		return
	}
	base64Image := parsed.Data[0].B64JSON
	generated := time.Now().UTC()

	uploadChan := make(chan struct{})
	go simulateProgress(taskID, 76, 99, 20*time.Second, uploadChan)

	defer close(uploadChan)

	imageCid, err := uploadImageToPinata(a.cfg.Pinata.PinataToken, base64Image, name.(string))
	if err != nil {
		fail("cannot upload image to ipfs", err)
		return
	}

	metadataBody := map[string]any{
		"name":                    name,
		"symbol":                  "MON",
		"description":             description,
		"image":                   fmt.Sprintf("ipfs://%s", imageCid),
		"external_url":            "https://borflab.com/cards",
		"seller_fee_basis_points": 0,
		"attributes": []any{
			map[string]string{
				"trait_type": "Biome",
				"value":      string(experiment.Biome),
			},
			map[string]string{
				"trait_type": "Rarity",
				"value":      string(experiment.Rarity),
			},
			map[string]string{
				"trait_type": "Power",
				"value":      "Extreme",
			},
			map[string]string{
				"trait_type": "Element",
				"value":      "Fire",
			},
		},
		"properties": map[string]any{
			"category": "image",
			"files": []map[string]any{
				{
					"uri":  fmt.Sprintf("ipfs://%s", imageCid),
					"type": "image/png",
				},
			},
			"creators": []map[string]any{
				{
					"address":  a.cfg.Privy.Wallet,
					"share":    100,
					"verified": true,
				},
			},
		},
	}

	metadataCid, err := uploadMetadataToPinata(a.cfg.Pinata.PinataToken, metadataBody)
	if err != nil {
		fail("cannot upload metadata to ipfs", err)
		return
	}

	metadata, err := json.Marshal(metadataBody)
	if err != nil {
		fail("cannot marshal metadata", err)
		return
	}

	uploaded := time.Now().UTC()

	stats, err := a.db.SelectRarities(context.Background())
	if err != nil {
		fail("cannot select rarities", err)
		return
	}

	rarity := stats.PickRarity(StoneTanzanite)

	experiment.Rarity = rarity
	experiment.ImageCID = imageCid
	experiment.MetadataCID = metadataCid
	experiment.Metadata = metadata
	experiment.Generated = &generated
	experiment.Uploaded = &uploaded

	if _, err := a.db.FinishExperiment(context.Background(), &experiment); err != nil {
		fail("cannot update experiment", err)
		return
	}

	if t, ok := tasks.Load(taskID); ok {
		if ts, ok := t.(*TaskStatus); ok {
			ts.Result = struct {
				Image        string `json:"image"`
				ExperimentId int    `json:"experimentId"`
			}{
				Image:        base64Image,
				ExperimentId: experiment.Id,
			}
			ts.Progress = 100
			ts.Done = true
		}
	}
}

func (a *api) Progress(w *Responder, r *http.Request) {
	taskId := Param(r)

	if task, ok := tasks.Load(taskId); ok {
		w.Send(task)
	} else {
		a.InternalError(w, fmt.Errorf("cannot find task %v", taskId))
	}
}

func (a *api) PrepareMint(w *Responder, r *http.Request) {

	experimentId := Param(r)

	experiment, err := a.db.SelectExperiment(r.Context(), experimentId)
	if err != nil {
		a.DbError(w, fmt.Errorf("cannot select experiment %v", err))
		return
	}

	var parsed map[string]any

	if err := json.Unmarshal(experiment.Specimen, &parsed); err != nil {
		a.InternalError(w, fmt.Errorf("cannot unmarshal specimen: %v", err))
		return
	}

	profile, ok := parsed["MONSTER_PROFILE"].(map[string]any)
	if !ok {
		a.InternalError(w, fmt.Errorf("cannot parse monster profile: %v", err))
		return
	}

	name := profile["name"].(string)
	description := profile["personality"].(string)
	biome := experiment.Biome
	rarity := experiment.Rarity
	uri := fmt.Sprintf("ipfs://%s", experiment.MetadataCID)

	// === SOLANA LOGIC ===
	ctx := context.Background()
	programId, _ := solana.PublicKeyFromBase58(a.cfg.Solana.ProgramId)
	adminPublicKey, _ := solana.PublicKeyFromBase58(a.cfg.Solana.AdminPublicKey)
	treasuryPda, _ := solana.PublicKeyFromBase58(a.cfg.Solana.TreasuryPda)
	cardCollection, _ := solana.PublicKeyFromBase58(a.cfg.Solana.CardCollection)
	stoneCollection, _ := solana.PublicKeyFromBase58(a.cfg.Solana.StoneCollection)
	updateAuthority, _ := solana.PublicKeyFromBase58(a.cfg.Solana.CollectionUpdateAuthority)

	userPubkey, err := solana.PublicKeyFromBase58(r.FormValue("userPubkey"))
	if err != nil {
		a.InternalError(w, fmt.Errorf("invalid userPubkey: %v", err))
		return
	}

	mint := solana.NewWallet()
	mintPubKey := mint.PublicKey()
	// PDAs
	tokenMetadataProgramID := solana.MustPublicKeyFromBase58("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
	stoneStateSeed := [][]byte{[]byte("stone_state"), stoneCollection.Bytes()}
	stoneState, _, _ := solana.FindProgramAddress(stoneStateSeed, programId)
	stoneOwnerATA, _, _ := solana.FindAssociatedTokenAddress(userPubkey, stoneCollection)
	cardTypeSeed := [][]byte{[]byte("card_type")}
	cardType, _, _ := solana.FindProgramAddress(cardTypeSeed, programId)
	cardStateSeed := [][]byte{[]byte("card_state"), mintPubKey.Bytes()}
	cardState, _, _ := solana.FindProgramAddress(cardStateSeed, programId)
	cardCollectionMetadata, _, _ := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramID.Bytes(),
			cardCollection.Bytes(),
		},
		tokenMetadataProgramID,
	)
	cardCollectionMasterEdition, _, _ := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramID.Bytes(), cardCollection.Bytes(), []byte("edition")},
		tokenMetadataProgramID,
	)
	collectionAuthority, _, _ := solana.FindProgramAddress(
		[][]byte{[]byte("collection_authority")},
		programId,
	)
	metadata, _, _ := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramID.Bytes(), mintPubKey.Bytes()},
		tokenMetadataProgramID,
	)
	masterEdition, _, _ := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramID.Bytes(), mintPubKey.Bytes(), []byte("edition")},
		tokenMetadataProgramID,
	)

	ownerATA, _, _ := solana.FindAssociatedTokenAddress(userPubkey, mintPubKey)

	discriminator := []byte{4, 182, 83, 217, 232, 35, 33, 64}
	dataBuf := &bytes.Buffer{}
	dataBuf.Write(discriminator)

	writeStringBorsh := func(buf *bytes.Buffer, s string) {
		b := []byte(s)
		_ = binary.Write(buf, binary.LittleEndian, uint32(len(b)))
		buf.Write(b)
	}

	writeStringBorsh(dataBuf, name)
	writeStringBorsh(dataBuf, description)
	writeStringBorsh(dataBuf, string(biome))
	writeStringBorsh(dataBuf, string(rarity))
	writeStringBorsh(dataBuf, uri)

	// account metas
	metas := []*solana.AccountMeta{
		solana.NewAccountMeta(mintPubKey, true, false),
		solana.NewAccountMeta(userPubkey, true, true),
		solana.NewAccountMeta(ownerATA, true, false),
		solana.NewAccountMeta(adminPublicKey, false, true),
		solana.NewAccountMeta(stoneCollection, false, false),
		solana.NewAccountMeta(stoneOwnerATA, true, false),
		solana.NewAccountMeta(stoneState, true, false),
		solana.NewAccountMeta(cardType, true, false),
		solana.NewAccountMeta(cardState, true, false),
		solana.NewAccountMeta(treasuryPda, false, false),
		solana.NewAccountMeta(cardCollection, false, false),
		solana.NewAccountMeta(cardCollectionMetadata, true, false),
		solana.NewAccountMeta(cardCollectionMasterEdition, true, false),
		solana.NewAccountMeta(metadata, true, false),
		solana.NewAccountMeta(masterEdition, true, false),
		solana.NewAccountMeta(collectionAuthority, false, true),
		solana.NewAccountMeta(updateAuthority, false, false),
		solana.NewAccountMeta(solana.TokenProgramID, false, false),
		solana.NewAccountMeta(solana.SPLAssociatedTokenAccountProgramID, false, false),
		solana.NewAccountMeta(solana.SystemProgramID, false, false),
		solana.NewAccountMeta(tokenMetadataProgramID, false, false),
		solana.NewAccountMeta(solana.SysVarRentPubkey, false, false),
	}

	inst := solana.NewInstruction(programId, metas, dataBuf.Bytes())

	rpcClient := rpc.New(rpc.DevNet_RPC)
	rb, _ := rpcClient.GetRecentBlockhash(ctx, rpc.CommitmentConfirmed)
	tx, _ := solana.NewTransaction(
		[]solana.Instruction{inst},
		rb.Value.Blockhash,
		solana.TransactionPayer(userPubkey),
	)

	txBytes, err := tx.MarshalBinary()
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot marshal tx: %v", err))
		return
	}
	partiallySigned := base64.StdEncoding.EncodeToString(txBytes)

	w.Send(map[string]string{
		"partiallySignedTx": partiallySigned,
	})

}

func (a *api) TestMint(w http.ResponseWriter, r *http.Request) {

	tokenMetadataProgramId, _ := solana.PublicKeyFromBase58("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

	const (
		name        = "Jimmy"
		description = "A test monster"
		biome       = "Canopica"
		rarity      = "Rare"
		uri         = "ipfs://QmbX5G8Fs5QBxHhekdCe7mixf4i7uRPReVUVzSCANAUdXz"
	)

	CARD_COLLECTION_MINT := "7Qiemkwe7DKxxFHHoZn3FSRd9Jfr8XueZx96rCUaFKhM"

	client := rpc.New("https://api.devnet.solana.com")

	idlData, err := os.ReadFile("borflab_chain.json")
	if err != nil {
		fmt.Printf("failed to read IDL file: %v", err)
		return
	}

	var idl map[string]any
	if err := json.Unmarshal(idlData, &idl); err != nil {
		fmt.Printf("failed to parse IDL JSON: %v", err)
		return
	}

	programId, _ := solana.PublicKeyFromBase58(a.cfg.Solana.ProgramId)

	walletPubKey, err := solana.PublicKeyFromBase58("GfJK6FM3U94RZ1o5tJgJEFzKeAFZdicCWo1dUHNLUZaW")
	if err != nil {
		fmt.Printf("invalid wallet public key: %v", err)
		return
	}

	fmt.Printf("👤 Wallet (Owner) address: %s\n", walletPubKey.String())

	balance, err := client.GetBalance(context.Background(), walletPubKey, rpc.CommitmentConfirmed)
	if err != nil {
		fmt.Printf("failed to get balance: %v", err)
		return
	}
	fmt.Printf("   Balance: %.4f SOL\n", float64(balance.Value)/1e9)

	keyData, err := os.ReadFile("admin_keypair.json")
	if err != nil {
		fmt.Printf("failed to read admin key file: %v", err)
		return
	}

	var secretKey []uint8
	if err := json.Unmarshal(keyData, &secretKey); err != nil {
		fmt.Printf("failed to parse admin key JSON: %v", err)
		return
	}

	adminPrivateKey := solana.PrivateKey(secretKey)
	if err != nil {
		fmt.Printf("failed to create admin key: %v", err)
		return
	}

	fmt.Printf("👑 Admin Wallet (Authority) address: %s\n", adminPrivateKey.PublicKey().String())

	adminBalance, err := client.GetBalance(context.Background(), adminPrivateKey.PublicKey(), rpc.CommitmentConfirmed)
	if err != nil {
		fmt.Printf("failed to get admin balance: %v", err)
		return
	}

	fmt.Printf("   Balance: %.4f SOL\n", float64(adminBalance.Value)/1e9)

	cardCollectionMint, err := solana.PublicKeyFromBase58(CARD_COLLECTION_MINT)
	if err != nil {
		fmt.Printf("invalid collection mint: %v", err)
		return
	}

	stoneMintStr := "GDGcseTzdjakdtHqrDzs8wGtZvjANMjQMXjjJRD7vYTs"

	stoneMint, err := solana.PublicKeyFromBase58(stoneMintStr)
	if err != nil {
		fmt.Printf("invalid stone mint: %v", err)
		return
	}

	fmt.Printf("🪨 Stone Info:\n")
	fmt.Printf("   Stone Mint: %s\n", stoneMint.String())

	// Find PDAs
	cardTypePda, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("card_type")},
		programId,
	)
	if err != nil {
		fmt.Printf("failed to find card type PDA: %v", err)
		return
	}

	stoneStatePda, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("stone_state"), stoneMint.Bytes()},
		programId,
	)
	if err != nil {
		fmt.Printf("failed to find stone state PDA: %v", err)
		return
	}

	collectionAuthorityPda, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("collection_authority")},
		programId,
	)
	if err != nil {
		fmt.Printf("failed to find collection authority PDA: %v", err)
		return
	}

	cardMintAdminPda, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("card_mint_admin")},
		programId,
	)
	if err != nil {
		fmt.Printf("failed to find card mint admin PDA: %v", err)
		return
	}

	fmt.Printf("🔑 PDAs:\n")
	fmt.Printf("   Card Type: %s\n", cardTypePda.String())
	fmt.Printf("   Stone State: %s\n", stoneStatePda.String())
	fmt.Printf("   Collection Authority: %s\n", collectionAuthorityPda.String())
	fmt.Printf("   Card Mint Admin: %s\n", cardMintAdminPda.String())
	fmt.Printf("\n")

	fmt.Printf("🔐 Card Mint Admin Verification:\n")

	accountInfo, err := client.GetAccountInfo(context.Background(), cardMintAdminPda)
	if err != nil {
		fmt.Printf("❌ Error: Card mint admin not registered!: %v", err)
		return
	}

	if accountInfo == nil || accountInfo.Value == nil {
		fmt.Printf("❌ Error: Card mint admin account not found!")
		return
	}

	if len(accountInfo.Value.Data.GetBinary()) < 32 {
		fmt.Printf("❌ Error: Invalid card mint admin account data")
		return
	}

	registeredAdmin := solana.PublicKeyFromBytes(accountInfo.GetBinary()[8:40])
	if err != nil {
		fmt.Printf("❌ Error: Failed to parse registered admin: %v", err)
		return
	}

	fmt.Printf("   Registered Admin: %s\n", registeredAdmin.String())
	fmt.Printf("   Provided Admin: %s\n", adminPrivateKey.PublicKey().String())

	if !registeredAdmin.Equals(adminPrivateKey.PublicKey()) {
		fmt.Printf("❌ Error: The provided admin keypair is not registered as card mint admin!")
		return
	}

	fmt.Printf("   ✅ Admin verified!\n")
	fmt.Printf("\n")

	// Check stone state
	fmt.Printf("⚡ Stone State:\n")

	stoneStateAccount, err := client.GetAccountInfo(context.Background(), stoneStatePda)
	if err != nil || stoneStateAccount == nil || stoneStateAccount.Value == nil {
		fmt.Printf("❌ Error: Could not fetch stone state. Make sure the stone exists and is minted.")
		return
	}

	stoneStateData := stoneStateAccount.Value.Data.GetBinary()
	if len(stoneStateData) < 2 {
		fmt.Printf("❌ Error: Invalid stone state data")
		return
	}

	sparksRemaining := binary.LittleEndian.Uint16(stoneStateData[0:2])
	fmt.Printf("   Sparks Remaining: %d/42\n", sparksRemaining)

	if sparksRemaining == 0 {
		fmt.Printf("❌ Error: Stone has no sparks remaining!")
		return
	}

	fmt.Printf("🃏 Card Type:\n")

	cardTypeAccount, err := client.GetAccountInfo(context.Background(), cardTypePda)
	if err != nil || cardTypeAccount == nil || cardTypeAccount.Value == nil {
		fmt.Printf("❌ Error: Card type not initialized")
		return
	}

	cardTypeData := cardTypeAccount.Value.Data.GetBinary()
	if len(cardTypeData) < 8 {
		fmt.Printf("❌ Error: Invalid card type data")
		return
	}

	mintedCount := binary.LittleEndian.Uint32(cardTypeData[0:4])
	supplyCap := binary.LittleEndian.Uint32(cardTypeData[4:8])

	fmt.Printf("   Minted: %d/%d\n", mintedCount, supplyCap)

	if mintedCount >= supplyCap {
		fmt.Printf("❌ Error: Card supply cap reached!")
		return
	}

	// Generate new mint
	mint := solana.NewWallet()
	mintPubKey := mint.PublicKey()

	fmt.Printf("🆕 New Card NFT:\n")
	fmt.Printf("   Mint address: %s\n", mintPubKey.String())
	fmt.Printf("   Name: %s\n", name)
	fmt.Printf("   Description: %s\n", description)
	fmt.Printf("   Biome: %s\n", biome)
	fmt.Printf("   Rarity: %s\n", rarity)
	fmt.Printf("   URI: %s\n", uri)
	fmt.Printf("\n")

	// Find all required accounts
	ownerAta, _, err := solana.FindAssociatedTokenAddress(walletPubKey, mintPubKey)
	if err != nil {
		fmt.Printf("failed to find owner ATA: %v", err)
		return
	}

	stoneOwnerAta, _, err := solana.FindAssociatedTokenAddress(walletPubKey, stoneMint)
	if err != nil {
		fmt.Printf("failed to find stone owner ATA: %v", err)
		return
	}

	// Card State PDA
	cardStatePda, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("card_state"), mintPubKey.Bytes()},
		programId,
	)
	if err != nil {
		fmt.Printf("failed to find card state PDA: %v", err)
		return
	}

	// Metaplex PDAs
	metadata, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramId.Bytes(), mintPubKey.Bytes()},
		tokenMetadataProgramId,
	)
	if err != nil {
		fmt.Printf("failed to find metadata PDA: %v", err)
		return
	}

	masterEdition, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramId.Bytes(), mintPubKey.Bytes(), []byte("edition")},
		tokenMetadataProgramId,
	)
	if err != nil {
		fmt.Printf("failed to find master edition PDA: %v", err)
		return
	}

	collectionMetadata, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramId.Bytes(), cardCollectionMint.Bytes()},
		tokenMetadataProgramId,
	)
	if err != nil {
		fmt.Printf("failed to find collection metadata PDA: %v", err)
		return
	}

	collectionMasterEdition, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramId.Bytes(), cardCollectionMint.Bytes(), []byte("edition")},
		tokenMetadataProgramId,
	)
	if err != nil {
		fmt.Printf("failed to find collection master edition PDA: %v", err)
		return
	}

	fmt.Printf("📦 Additional accounts:\n")
	fmt.Printf("   Owner ATA: %s\n", ownerAta.String())
	fmt.Printf("   Stone Owner ATA: %s\n", stoneOwnerAta.String())
	fmt.Printf("   Card State: %s\n", cardStatePda.String())
	fmt.Printf("   Metadata: %s\n", metadata.String())
	fmt.Printf("   Master Edition: %s\n", masterEdition.String())
	fmt.Printf("   collectionMasterEdition: %s\n", collectionMasterEdition.String())
	fmt.Printf("   collectionMetadata: %s\n", collectionMetadata.String())
	fmt.Printf("\n")

	fmt.Printf("⏳ Creating mint account...\n")

	mintRent, err := client.GetMinimumBalanceForRentExemption(context.Background(), 82, rpc.CommitmentConfirmed)
	if err != nil {
		fmt.Printf("failed to get mint rent: %v", err)
		return
	}

	createMintAccountIx := system.NewCreateAccountInstruction(
		mintRent,
		82,
		solana.TokenProgramID,
		walletPubKey,
		mintPubKey,
	).Build()

	mintCardIx := solana.NewInstruction(
		programId,
		[]*solana.AccountMeta{
			solana.NewAccountMeta(mintPubKey, true, false),
			solana.NewAccountMeta(walletPubKey, true, true),
			solana.NewAccountMeta(ownerAta, true, false),
			solana.NewAccountMeta(adminPrivateKey.PublicKey(), false, true),
			solana.NewAccountMeta(cardMintAdminPda, false, false),
			solana.NewAccountMeta(stoneMint, false, false),
			solana.NewAccountMeta(stoneOwnerAta, true, false),
			solana.NewAccountMeta(stoneStatePda, true, false),
			solana.NewAccountMeta(cardTypePda, true, false),
			solana.NewAccountMeta(cardStatePda, true, false),
			solana.NewAccountMeta(cardCollectionMint, false, false),
			solana.NewAccountMeta(collectionMetadata, true, false),
			solana.NewAccountMeta(collectionMasterEdition, true, false),
			solana.NewAccountMeta(metadata, true, false),
			solana.NewAccountMeta(masterEdition, true, false),
			solana.NewAccountMeta(collectionAuthorityPda, true, false),
			solana.NewAccountMeta(solana.TokenProgramID, false, false),
			solana.NewAccountMeta(solana.SPLAssociatedTokenAccountProgramID, false, false),
			solana.NewAccountMeta(solana.SystemProgramID, false, false),
			solana.NewAccountMeta(tokenMetadataProgramId, false, false),
			solana.NewAccountMeta(solana.SysVarRentPubkey, false, false),
		},
		encodeMintCardInstructionData(name, description, biome, rarity, uri),
	)

	computeBudgetIx := computebudget.NewSetComputeUnitLimitInstruction(300000).Build()

	recent, err := client.GetLatestBlockhash(context.Background(), rpc.CommitmentFinalized)
	if err != nil {
		fmt.Printf("failed to get recetn blockhash: %v", err)
		return
	}

	instructions := []solana.Instruction{
		computeBudgetIx,
		createMintAccountIx,
		mintCardIx,
	}

	tx, err := solana.NewTransaction(
		instructions,
		recent.Value.Blockhash,
		solana.TransactionPayer(walletPubKey),
	)

	if err != nil {
		fmt.Printf("failed to create new transaction: %v", err)
		return
	}

	_, err = tx.PartialSign(func(key solana.PublicKey) *solana.PrivateKey {
		switch {
		case key.Equals(adminPrivateKey.PublicKey()):
			return &adminPrivateKey
		case key.Equals(mintPubKey):
			privateKey := mint.PrivateKey
			return &privateKey
		default:
			return nil
		}
	})
	if err != nil {
		fmt.Printf("failed to sign transaction: %v", err)
		return
	}

	txBytes, err := tx.MarshalBinary()
	if err != nil {
		fmt.Printf("failed to marshal transaction: %v", err)
		return
	}

	txBase64 := base64.StdEncoding.EncodeToString(txBytes)

	response := map[string]string{
		"transaction": txBase64,
		"status":      "success",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func encodeMintCardInstructionData(name, description, biome, rarity, uri string) []byte {
	encodeAnchorString := func(s string) []byte {
		buf := make([]byte, 4+len(s))
		binary.LittleEndian.PutUint32(buf[0:4], uint32(len(s)))
		copy(buf[4:], []byte(s))
		return buf
	}

	discriminator := []byte{4, 182, 83, 217, 232, 35, 33, 64}

	data := make([]byte, 0)
	data = append(data, discriminator...)

	data = append(data, encodeAnchorString(name)...)
	data = append(data, encodeAnchorString(description)...)
	data = append(data, encodeAnchorString(biome)...)
	data = append(data, encodeAnchorString(rarity)...)
	data = append(data, encodeAnchorString(uri)...)

	return data
}

func (a *api) BadRequestError(w *Responder, err error) {
	LogError("API", "bad request", err)
	w.SendInternalError()
}

func (a *api) DbError(w *Responder, err error) {
	LogError("API", "cannot execute DB query", err)
	a.telegram.SendMessage(DevChannel, "cannot execute DB query %v", err.Error())
	w.SendInternalError()
}

func (a *api) InternalError(w *Responder, err error) {
	LogError("API", "Internal server error", err)
	a.telegram.SendMessage(DevChannel, "Internal server error: %v", err.Error())
	w.SendInternalError()
}

func ParseBody(r *http.Request, dst any) error {
	limited := io.LimitReader(r.Body, 5<<20)
	return json.NewDecoder(limited).Decode(dst)
}

func Param(r *http.Request) string {
	path := strings.Trim(r.URL.Path, "/")
	parts := strings.Split(path, "/")

	if len(parts) < 2 {
		return ""
	}

	return parts[1]
}

func simulateProgress(taskID string, from, to int, duration time.Duration, done <-chan struct{}) {
	totalSteps := to - from
	if totalSteps <= 0 {
		return
	}

	stepInterval := duration / time.Duration(totalSteps)

	current := from
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	for current < to {
		select {
		case <-done:
			return
		case <-time.After(stepInterval + time.Duration(r.Intn(500)-100)*time.Millisecond):
			current += r.Intn(4) + 1
			if current > to {
				current = to
			}

			if t, ok := tasks.Load(taskID); ok {
				t.(*TaskStatus).Progress = current
			}
		}
	}
}

func uploadImageToPinata(pinataJWT string, base64Image string, fileName string) (string, error) {

	imageData, err := base64.StdEncoding.DecodeString(base64Image)
	if err != nil {
		return "", err
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	// TODO: bulletproof extension and filename
	part, err := writer.CreateFormFile("file", fmt.Sprintf("%s.png", fileName))
	if err != nil {
		return "", err
	}
	_, err = part.Write(imageData)
	if err != nil {
		return "", err
	}
	writer.Close()

	req, err := http.NewRequest("POST", PinataPinFileUrl, body)
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+pinataJWT)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Pinata API refused %d: %s", resp.StatusCode, string(respBody))
	}

	var parsed struct {
		IpfsHash  string `json:"IpfsHash"`
		PinSize   int    `json:"PinSize"`
		Timestamp string `json:"Timestamp"`
	}
	err = json.Unmarshal(respBody, &parsed)
	if err != nil {
		return "", err
	}

	return parsed.IpfsHash, nil
}

func uploadMetadataToPinata(pinataJWT string, metadata map[string]any) (string, error) {

	jsonBytes, err := json.Marshal(metadata)
	if err != nil {
		return "", err
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", "metadata.json")
	if err != nil {
		return "", err
	}

	_, err = part.Write(jsonBytes)
	if err != nil {
		return "", err
	}

	writer.Close()

	req, err := http.NewRequest("POST", PinataPinFileUrl, body)
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+pinataJWT)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Pinata API refused %d: %s", resp.StatusCode, string(respBody))
	}

	var parsed struct {
		IpfsHash string `json:"IpfsHash"`
	}
	err = json.Unmarshal(respBody, &parsed)
	if err != nil {
		return "", err
	}

	return parsed.IpfsHash, nil
}
