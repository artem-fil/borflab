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
	OPENAI_COMPLETION_URL     = "https://api.openai.com/v1/chat/completions"
	OPENAI_GENERATION_URL     = "https://api.openai.com/v1/images/generations"
	PINATA_PIN_FILE_URL       = "https://api.pinata.cloud/pinning/pinFileToIPFS"
	TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
)

var (
	tasks = sync.Map{}
)

type TaskStatus struct {
	Progress   int    `json:"progress"`
	Done       bool   `json:"done"`
	Error      string `json:"error,omitempty"`
	Result     any    `json:"result,omitempty"`
	NextTaskId string `json:"nextTask,omitempty"`
}

type api struct {
	cfg         *Config
	db          *DB
	telegram    *Telegram
	solanaAgent *SolanaAgent
}

type mintForm struct {
	UserPubKey  string `json:"userPubKey"`
	StonePubKey string `json:"stonePubKey"`
}

func NewApi(cfg *Config, db *DB, telegram *Telegram, solanaAgent *SolanaAgent) *api {
	return &api{cfg, db, telegram, solanaAgent}
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

func (a *api) GetStones(w *Responder, r *http.Request) {

	ctx := r.Context()
	claims, _ := Claims(r)

	stones, err := a.db.SelectStones(ctx, claims.Id)
	if err != nil {
		a.DbError(w, err)
		return
	}
	w.Send(stones)
}

func (a *api) GetMonsters(w *Responder, r *http.Request) {

	ctx := r.Context()
	claims, _ := Claims(r)

	query := r.URL.Query()

	page := ParseInt(query.Get("page"), 1, 1, 1000)
	limit := ParseInt(query.Get("limit"), 10, 1, 9)
	allowedSorts := map[string]bool{
		"created": true,
		"rarity":  true,
		"biome":   true,
		"name":    true,
	}
	sort := query.Get("sort")
	if !allowedSorts[sort] {
		sort = "created"
	}
	order := query.Get("order")
	if order != "asc" && order != "desc" {
		order = "desc"
	}

	offset := (page - 1) * limit

	monsters, total, err := a.db.SelectMonsters(ctx, claims.Id, limit, offset, sort, order)
	if err != nil {
		a.DbError(w, err)
		return
	}

	pages := 0
	if total > 0 {
		pages = (total + limit - 1) / limit
	}
	response := struct {
		Monsters []Monster
		Total    int
		Pages    int
	}{
		Monsters: monsters,
		Total:    total,
		Pages:    pages,
	}
	w.Send(response)
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

	ctx := r.Context()
	claims, _ := Claims(r)

	selectedStone, err := a.db.SelectStone(ctx, r.FormValue("stone"), claims.Id)
	if err != nil {
		a.DbError(w, fmt.Errorf("cannot select stone %v", err))
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
		Stone:           StoneType(selectedStone.Type),
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

	taskRaw, ok := tasks.Load(taskID)
	if !ok {
		LogError("API", "task not found", nil)
		return
	}
	task, ok := taskRaw.(*TaskStatus)
	if !ok {
		LogError("API", "cannot cast TaskStatus", nil)
		return
	}

	doneChan := make(chan struct{})

	go simulateProgress(taskID, 1, 99, 40*time.Second, doneChan)

	fail := func(msg string, err error) {
		select {
		case <-doneChan:
		default:
			close(doneChan)
		}

		LogError("API", msg, err)
		task.Error = msg
		task.Done = true
		task.Progress = 100
	}

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

	req, err := http.NewRequest(http.MethodPost, OPENAI_COMPLETION_URL, bytes.NewReader(bodyBytes))
	if err != nil {
		fail("cannot create request", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.cfg.OpenAIToken)

	resp, err := http.DefaultClient.Do(req)
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

	if len(rawResp.Choices) == 0 {
		fail("empty choices in OpenAI response", nil)
		return
	}

	content := rawResp.Choices[0].Message.Content
	sanitizedJson, err := sanitizeJSON(content)
	if err != nil {
		fail("malformed json response", err)
		return
	}

	var parsed map[string]any
	if err := json.Unmarshal(sanitizedJson, &parsed); err != nil {
		fail("invalid json result", err)
		return
	}

	if maybeError, hasError := parsed["Error"]; hasError {
		task.Error = fmt.Sprint(maybeError)
		task.Done = true
		task.Progress = 100
		return
	}

	analyzed := time.Now().UTC()
	experiment.Specimen = sanitizedJson
	experiment.Analyzed = &analyzed

	_, err = a.db.AnalyzeExperiment(context.Background(), experiment)
	if err != nil {
		fail("cannot continue experiment", err)
		return
	}

	nextTaskID := uuid.NewString()
	tasks.Store(nextTaskID, &TaskStatus{Progress: 0, Done: false})

	go a.generateImage(nextTaskID, parsed, *experiment)

	task.Progress = 100
	task.Done = true
	task.Result = parsed
	task.NextTaskId = nextTaskID
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
	if !promptOk || !profileOk {
		fail("cannot parse speciment", fmt.Errorf("donno"))
		return
	}

	getProfileField := func(profile map[string]any, key string) string {
		if value, ok := profile[key].(string); ok && value != "" {
			return value
		}

		fallbacks := map[string]string{
			"name":           "Unnamed Creature",
			"species":        "Mysterious Species",
			"lore":           "Its origins are lost to time",
			"movement_class": "Unknown Locomotion",
			"behaviour":      "Behavior undocumented",
			"personality":    "Enigmatic",
			"abilities":      "Abilities yet to be discovered",
			"habitat":        "Habitat unknown",
			"description":    "A creature of mystery",
		}

		if fallback, ok := fallbacks[key]; ok {
			return fallback
		}

		return "Not specified"
	}

	name := getProfileField(profile, "name")
	species := getProfileField(profile, "species")
	lore := getProfileField(profile, "lore")
	movementClass := getProfileField(profile, "movement_class")
	behaviour := getProfileField(profile, "behaviour")
	personality := getProfileField(profile, "personality")
	abilities := getProfileField(profile, "abilities")
	habitat := getProfileField(profile, "habitat")
	// description := getProfileField(profile, "description")

	requestBody := map[string]any{
		"model":      "gpt-image-1",
		"n":          1,
		"size":       "1024x1024",
		"quality":    "medium",
		"prompt":     prompt,
		"moderation": "low",
	}
	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		fail("cannot marshal json", err)
		return
	}

	req, err := http.NewRequest(http.MethodPost, OPENAI_GENERATION_URL, bytes.NewReader(bodyBytes))
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

	imageCid, err := uploadImageToPinata(a.cfg.Pinata.PinataToken, base64Image, name)
	if err != nil {
		fail("cannot upload image to ipfs", err)
		return
	}

	stats, err := a.db.SelectRarities(context.Background())
	if err != nil {
		fail("cannot select rarities", err)
		return
	}

	rarity := stats.PickRarity(StoneAmazonite)

	experiment.Rarity = rarity

	metadataBody := map[string]any{
		"name":                    name,
		"symbol":                  "MON",
		"description":             "d",
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
			"species":        species,
			"lore":           lore,
			"movement_class": movementClass,
			"behaviour":      behaviour,
			"personality":    personality,
			"abilities":      abilities,
			"habitat":        habitat,
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

	form := &mintForm{}
	if err := ParseBody(r, &form); err != nil {
		a.BadRequestError(w, err)
		return
	}

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
	description := "d" // profile["personality"].(string)
	biome := string(experiment.Biome)
	rarity := string(experiment.Rarity)
	uri := fmt.Sprintf("ipfs://%s", experiment.MetadataCID)
	user_id := 12345
	experiment_id := experiment.Id

	// === SOLANA logic ===

	// 1. Prepare keys
	ctx := context.Background()
	programId, err := solana.PublicKeyFromBase58(a.cfg.Solana.ProgramId)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot encode public key: %v", err))
		return
	}
	userPubKey, err := solana.PublicKeyFromBase58(form.UserPubKey)
	if err != nil {
		fmt.Printf("invalid wallet public key: %v", err)
		return
	}
	cardCollectionPubKey, err := solana.PublicKeyFromBase58(a.cfg.Solana.CardCollectionPubKey)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot encode public key: %v", err))
		return
	}
	stonePubKey, err := solana.PublicKeyFromBase58(form.StonePubKey)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot encode public key: %v", err))
		return
	}
	tokenMetadataProgramId, err := solana.PublicKeyFromBase58(TOKEN_METADATA_PROGRAM_ID)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot encode public key: %v", err))
		return
	}

	keyData, err := os.ReadFile("admin_keypair.json")
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot read keypair file: %v", err))
		return
	}

	var secretKey []uint8
	if err := json.Unmarshal(keyData, &secretKey); err != nil {
		a.InternalError(w, fmt.Errorf("cannot parse keypair file: %v", err))
		return
	}

	adminPrivateKey := solana.PrivateKey(secretKey)
	if err := adminPrivateKey.Validate(); err != nil {
		a.InternalError(w, fmt.Errorf("invalid admin key"))
		return
	}

	// 2. Find PDAs

	cardTypePda, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("card_type")},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	stoneStatePda, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("stone_state"), stonePubKey.Bytes()},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	collectionAuthorityPda, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("collection_authority")},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	cardMintAdminPda, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("card_mint_admin")},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	// 3. Admin verification
	adminAccount, err := a.solanaAgent.rpcClient.GetAccountInfoWithOpts(
		ctx,
		cardMintAdminPda,
		&rpc.GetAccountInfoOpts{
			Commitment: rpc.CommitmentConfirmed,
		},
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot get admin account: %v", err))
		return
	}

	if adminAccount == nil || adminAccount.Value == nil || len(adminAccount.Value.Data.GetBinary()) < 32 {
		a.InternalError(w, fmt.Errorf("cannot validate admin account: %v", err))
		return
	}

	registeredAdmin := solana.PublicKeyFromBytes(adminAccount.GetBinary()[8:40])
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot encode public key: %v", err))
		return
	}

	if !registeredAdmin.Equals(adminPrivateKey.PublicKey()) {
		a.InternalError(w, fmt.Errorf("unauthorized admin keypair"))
		return
	}

	// 4. Stone state verification

	stoneStateAccount, err := a.solanaAgent.rpcClient.GetAccountInfoWithOpts(
		ctx,
		stoneStatePda,
		&rpc.GetAccountInfoOpts{
			Commitment: rpc.CommitmentConfirmed,
		},
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot get stone state account: %v", err))
		return
	}
	if stoneStateAccount == nil || stoneStateAccount.Value == nil {
		a.InternalError(w, fmt.Errorf("cannot validate stone state account: %v", err))
		return
	}
	stoneState := stoneStateAccount.Value.Data.GetBinary()
	if len(stoneState) < 2 {
		a.InternalError(w, fmt.Errorf("stone state data too short"))
		return
	}

	sparksRemaining := binary.LittleEndian.Uint16(stoneState[32:34])

	if sparksRemaining <= 0 {
		a.BadRequestError(w, fmt.Errorf("selected stone has no sparks"))
		return
	}

	// 5. Card verification

	cardTypeAccount, err := a.solanaAgent.rpcClient.GetAccountInfoWithOpts(
		ctx,
		cardTypePda,
		&rpc.GetAccountInfoOpts{
			Commitment: rpc.CommitmentConfirmed,
		},
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot get card type account: %v", err))
		return
	}

	if cardTypeAccount == nil || cardTypeAccount.Value == nil {
		a.InternalError(w, fmt.Errorf("cannot validate card type account: %v", err))
		return
	}
	cardTypeData := cardTypeAccount.Value.Data.GetBinary()
	if len(cardTypeData) < 8 {
		a.InternalError(w, fmt.Errorf("card type too short"))
		return
	}

	mintedCount := binary.LittleEndian.Uint32(cardTypeData[0:4])
	supplyCap := binary.LittleEndian.Uint32(cardTypeData[4:8])

	if mintedCount >= supplyCap {
		a.BadRequestError(w, fmt.Errorf("card supply cap reached"))
		return
	}

	// 6. Generate new mint
	mint := solana.NewWallet()
	mintPubKey := mint.PublicKey()

	cardStatePda, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("card_state"), mintPubKey.Bytes()},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	// 7. Find ATAs
	ownerAta, _, err := solana.FindAssociatedTokenAddress(userPubKey, mintPubKey)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find owner ATA: %v", err))
		return
	}

	stoneOwnerAta, _, err := solana.FindAssociatedTokenAddress(userPubKey, stonePubKey)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find stone owner ATA: %v", err))
		return
	}

	// 8. Find metaplex PDAs
	metadata, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramId.Bytes(),
			mintPubKey.Bytes(),
		},
		tokenMetadataProgramId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	masterEdition, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramId.Bytes(),
			mintPubKey.Bytes(),
			[]byte("edition"),
		},
		tokenMetadataProgramId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	collectionMetadata, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramId.Bytes(),
			cardCollectionPubKey.Bytes()},
		tokenMetadataProgramId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	collectionMasterEdition, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramId.Bytes(),
			cardCollectionPubKey.Bytes(),
			[]byte("edition"),
		},
		tokenMetadataProgramId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	mintRent, err := a.solanaAgent.rpcClient.GetMinimumBalanceForRentExemption(
		ctx,
		82,
		rpc.CommitmentConfirmed,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot get mint rent: %v", err))
		return
	}

	createMintAccountIx := system.NewCreateAccountInstruction(
		mintRent,
		82,
		solana.TokenProgramID,
		userPubKey,
		mintPubKey,
	).Build()

	mintCardIx := solana.NewInstruction(
		programId,
		[]*solana.AccountMeta{
			solana.NewAccountMeta(mintPubKey, true, false),
			solana.NewAccountMeta(userPubKey, true, true),
			solana.NewAccountMeta(ownerAta, true, false),
			solana.NewAccountMeta(adminPrivateKey.PublicKey(), false, true),
			solana.NewAccountMeta(cardMintAdminPda, false, false),
			solana.NewAccountMeta(stonePubKey, false, false),
			solana.NewAccountMeta(stoneOwnerAta, true, false),
			solana.NewAccountMeta(stoneStatePda, true, false),
			solana.NewAccountMeta(cardTypePda, true, false),
			solana.NewAccountMeta(cardStatePda, true, false),
			solana.NewAccountMeta(cardCollectionPubKey, false, false),
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
		encodeMintCardInstructionData(name, description, biome, rarity, uri, user_id, experiment_id),
	)

	computeBudgetIx := computebudget.NewSetComputeUnitLimitInstruction(300000).Build()

	recent, err := a.solanaAgent.rpcClient.GetLatestBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot get latest blockhash: %v", err))
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
		solana.TransactionPayer(userPubKey),
	)

	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot create transaction: %v", err))
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
		a.InternalError(w, fmt.Errorf("cannot sign transaction: %v", err))
		return
	}

	txBytes, err := tx.MarshalBinary()
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot marshal transaction: %v", err))
		return
	}

	txBase64 := base64.StdEncoding.EncodeToString(txBytes)

	response := struct {
		TxBase64 string
	}{
		TxBase64: txBase64,
	}

	w.Send(response)

}

func encodeMintCardInstructionData(name, description, biome, rarity, uri string, user_id, experiment_id int) []byte {
	encodeAnchorString := func(s string) []byte {
		buf := make([]byte, 4+len(s))
		binary.LittleEndian.PutUint32(buf[0:4], uint32(len(s)))
		copy(buf[4:], []byte(s))
		return buf
	}
	encodeAnchorInt := func(i int) []byte {
		buf := make([]byte, 4)
		binary.LittleEndian.PutUint32(buf, uint32(i))
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
	data = append(data, encodeAnchorInt(user_id)...)
	data = append(data, encodeAnchorInt(experiment_id)...)

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

	req, err := http.NewRequest("POST", PINATA_PIN_FILE_URL, body)
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
		return "", fmt.Errorf("pinata API refused %d: %s", resp.StatusCode, string(respBody))
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

	req, err := http.NewRequest("POST", PINATA_PIN_FILE_URL, body)
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
		return "", fmt.Errorf("pinata API refused %d: %s", resp.StatusCode, string(respBody))
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
