package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime/debug"
	"strings"
	"time"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
	"github.com/gorilla/websocket"
)

type SolanaAgent struct {
	cfg        SolanaConfig
	rpcClient  *rpc.Client
	httpClient *http.Client
	sseAgent   *SSEAgent
	telegram   *Telegram
	db         *DB
	ws         *websocket.Conn
}

type SolanaEventProcessor struct {
	httpClient *http.Client
	rpcClient  *rpc.Client
	programId  solana.PublicKey
}

type SolanaSync struct {
	Id              int
	LastSignature   string
	OldestSignature string
	Scanned         time.Time
	Created         time.Time
}

type SolanaNotificationStage string

const (
	SolanaStageTxError       SolanaNotificationStage = "transaction_error"
	SolanaStageInternalError SolanaNotificationStage = "internal_error"
	SolanaStageEventError    SolanaNotificationStage = "event_error"
	SolanaStageBusinessError SolanaNotificationStage = "business_error"
	SolanaStageDone          SolanaNotificationStage = "done"
)

type SolanaNotification struct {
	Jsonrpc string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  struct {
		Result struct {
			Context struct {
				Slot int64 `json:"slot"`
			} `json:"context"`
			Value struct {
				Signature string           `json:"signature"`
				Err       *json.RawMessage `json:"err"`
				Logs      []string         `json:"logs"`
			} `json:"value"`
		} `json:"result"`
	} `json:"params"`
	Stage   SolanaNotificationStage
	Created time.Time
	Events  []SolanaEvent
}

type SolanaEvent struct {
	ProgramData []byte
	Type        *string
	Payload     *json.RawMessage
	Error       *string
	Created     time.Time
}

var eventDiscriminators = map[[8]byte]string{
	{246, 253, 98, 133, 133, 132, 214, 224}:  "CardInstanceMinted",
	{132, 255, 152, 197, 240, 160, 251, 221}: "SparkCardInstanceMinted",
	{235, 37, 241, 232, 236, 3, 253, 195}:    "StoneInstanceMinted",
	{132, 192, 109, 134, 147, 251, 93, 42}:   "SparkUsed",
	{94, 87, 215, 142, 36, 14, 148, 19}:      "CardExchanged",
}

var ixDiscriminators = map[string][]byte{
	"StoneInstanceMinted":     {3, 147, 97, 164, 139, 153, 105, 248},
	"SparkCardInstanceMinted": {155, 166, 147, 157, 177, 27, 102, 227},
	"CardInstanceMinted":      {4, 182, 83, 217, 232, 35, 33, 64},
	"CardExchanged":           {143, 210, 95, 198, 96, 127, 195, 247},
}

type SparkUsedPayload struct {
	Mint            string
	SparksRemaining uint16
}

type CardInstancePayload struct {
	Mint         string
	Owner        string
	StoneMint    string
	SerialNumber uint32
	CardState    string
	UserId       int32
	ExperimentId int32
}

type SparkCardInstancePayload struct {
	Mint         string
	Owner        string
	SerialNumber uint32
	CardState    string
	UserId       int32
	ExperimentId int32
}

type SwapInstancePayload struct {
	User         string
	UserId       int32
	UserCardMint string
	PoolCardMint string
	UserFreeCard string
	PoolUserNft  string
}

type StoneInstancePayload struct {
	Mint         string
	Owner        string
	Stone        string
	SerialNumber uint32
	PricePaid    uint64
	StoneState   string
	UserId       int32
}

func NewSolanaAgent(cfg SolanaConfig, db *DB, rpcClient *rpc.Client, sseAgent *SSEAgent, telegram *Telegram) *SolanaAgent {
	return &SolanaAgent{
		cfg:       cfg,
		rpcClient: rpcClient,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				IdleConnTimeout:     90 * time.Second,
				MaxIdleConnsPerHost: 20,
			},
		},
		db:       db,
		sseAgent: sseAgent,
		telegram: telegram,
	}
}

func NewSolanaEventProcessor(programId solana.PublicKey, rpcClient *rpc.Client, httpClient *http.Client) *SolanaEventProcessor {

	rpc := &SolanaEventProcessor{
		httpClient: httpClient,
		rpcClient:  rpcClient,
		programId:  programId,
	}
	return rpc
}

func (sa *SolanaAgent) Start(ctx context.Context) {

	go sa.RunPolling(ctx)

	backoff := 1 * time.Second
	maxBackoff := 30 * time.Second
	maxAttempts := 10
	attempt := 0

	for {
		select {
		case <-ctx.Done():
			LogInfo("Solana", "Agent stopped")
			return
		default:
		}

		if err := sa.connectAndListen(ctx); err != nil {
			attempt++
			LogError("Solana", fmt.Sprintf("connection attempt %d failed", attempt), err)
			time.Sleep(backoff)
			if backoff < maxBackoff {
				backoff *= 2
			}
			if attempt >= maxAttempts {
				LogError("Solana", "Max connection attempts reached, exiting", nil)
				return
			}
		} else {
			backoff = 1 * time.Second
			attempt = 0
		}
	}
}

func (sa *SolanaAgent) RunPolling(ctx context.Context) {
	LogInfo("Solana", "Polling started")
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			LogInfo("Solana", "Polling stopped by context")
			return
		case <-ticker.C:
			func() {
				defer func() {
					if r := recover(); r != nil {
						LogError("Solana", "PANIC recovered in RunPolling",
							fmt.Errorf("%v\n%s", r, debug.Stack()))
					}
				}()

				if err := sa.PerformPoll(ctx); err != nil {
					LogError("Poll", "Sync failed", err)
				}
			}()
		}
	}
}

func (sa *SolanaAgent) PerformPoll(ctx context.Context) error {
	lastSignature, err := sa.db.GetLastSignature(ctx)
	if err != nil {
		return err
	}

	signatures, err := sa.rpcClient.GetSignaturesForAddressWithOpts(
		ctx,
		solana.MustPublicKeyFromBase58(sa.cfg.ProgramId),
		&rpc.GetSignaturesForAddressOpts{
			Until:      solana.MustSignatureFromBase58(lastSignature),
			Commitment: rpc.CommitmentConfirmed,
		},
	)
	if err != nil || len(signatures) == 0 {
		return err
	}

	LogInfo("Poll", fmt.Sprintf("Processing %d missed transactions", len(signatures)))

	for i := len(signatures) - 1; i >= 0; i-- {
		sig := signatures[i].Signature.String()
		slot := int64(signatures[i].Slot)

		if err := sa.processSingleSignature(ctx, sig, slot); err != nil {
			sa.telegram.SendMessage(DevChannel, "failed to process transaction %s. err: %s", sig, err)
			LogError("Poll", fmt.Sprintf("failed to process transaction %s", sig), err)
		}
	}
	if err := sa.db.SetLastSignature(ctx, signatures[0].Signature.String()); err != nil {
		return err
	}
	return nil
}

func (sa *SolanaAgent) connectAndListen(ctx context.Context) error {
	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}

	conn, _, err := dialer.Dial(rpc.DevNet.WS, nil)
	if err != nil {
		return err
	}

	sa.ws = conn

	defer func() {
		conn.Close()
		sa.ws = nil
	}()

	if err := sa.subscribeLogs(ctx); err != nil {
		return err
	}

	notifications := make(chan []byte, 100)
	readErrCh := make(chan error, 1)

	go func() {
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				readErrCh <- err
				return
			}
			select {
			case notifications <- msg:
			case <-ctx.Done():
				return
			}
		}
	}()

	pingTicker := time.NewTicker(19 * time.Second)
	defer pingTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			LogInfo("Solana", "Context cancelled, closing websocket...")
			return nil

		case err := <-readErrCh:
			return fmt.Errorf("read error: %w", err)

		case <-pingTicker.C:
			if err := conn.WriteMessage(websocket.PingMessage, []byte{}); err != nil {
				return fmt.Errorf("ping failed: %w", err)
			}

		case msg, ok := <-notifications:
			if !ok {
				return nil
			}
			go sa.processNotification(ctx, msg)
		}
	}
}

func (sa *SolanaAgent) subscribeLogs(ctx context.Context) error {

	maxRetries := 5

	isSubscribeSuccess := func(msg []byte) bool {
		var resp map[string]any
		if err := json.Unmarshal(msg, &resp); err != nil {
			return false
		}
		if _, ok := resp["error"]; ok {
			return false
		}
		return true
	}

	for attempt := 0; attempt < maxRetries; attempt++ {
		subscribeMsg := map[string]any{
			"jsonrpc": "2.0",
			"id":      1,
			"method":  "logsSubscribe",
			"params": []any{
				map[string]any{"mentions": []string{sa.cfg.ProgramId}},
				map[string]any{"commitment": "confirmed"},
			},
		}

		if err := sa.ws.WriteJSON(subscribeMsg); err != nil {
			LogError("Solana", fmt.Sprintf("subscribe attempt %d failed", attempt+1), err)
		} else {
			_, msg, err := sa.ws.ReadMessage()
			if err != nil {
				LogError("Solana", "failed to read subscription response", err)
			} else {
				if isSubscribeSuccess(msg) {
					LogInfo("Solana", fmt.Sprintf("Subscribed to program %s on attempt %d", sa.cfg.ProgramId, attempt+1))
					return nil
				} else {
					LogError("Solana", fmt.Sprintf("subscription rejected, attempt %d", attempt+1), nil)
				}
			}
		}
		select {
		case <-time.After(500 * time.Millisecond):
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	return fmt.Errorf("failed to subscribe after %d attempts", maxRetries)
}

func (sa *SolanaAgent) processNotification(ctx context.Context, input []byte) {
	defer func() {
		if r := recover(); r != nil {
			LogError("Solana", "panic in processNotification", fmt.Errorf("%v\n%s", r, debug.Stack()))
		}
	}()

	var raw struct {
		Method string `json:"method"`
		Params struct {
			Result struct {
				Context struct {
					Slot int64 `json:"slot"`
				} `json:"context"`
				Value struct {
					Signature string `json:"signature"`
				} `json:"value"`
			} `json:"result"`
		} `json:"params"`
	}

	if err := json.Unmarshal(input, &raw); err != nil {
		LogError("Solana", "failed to unmarshal ws message", err)
		return
	}

	if raw.Method != "logsNotification" {
		return
	}

	sig := raw.Params.Result.Value.Signature
	slot := raw.Params.Result.Context.Slot

	if err := sa.processSingleSignature(ctx, sig, slot); err != nil {
		LogError("Solana", fmt.Sprintf("WS processing failed for %s", sig), err)
	}
}

func (sa *SolanaAgent) processSingleSignature(ctx context.Context, sig string, slot int64) error {
	isNew, err := sa.db.RegisterNotificationIfNew(ctx, sig, slot)
	if err != nil {
		return fmt.Errorf("db registration failed: %w", err)
	}
	if !isNew {
		return nil
	}
	notification := SolanaNotification{
		Stage:   SolanaStageDone,
		Created: time.Now().UTC(),
	}
	notification.Params.Result.Value.Signature = sig
	notification.Params.Result.Context.Slot = slot

	uint8ptr := func(v uint64) *uint64 {
		return &v
	}
	txResp, err := sa.rpcClient.GetTransaction(ctx, solana.MustSignatureFromBase58(sig), &rpc.GetTransactionOpts{
		Commitment:                     rpc.CommitmentConfirmed,
		MaxSupportedTransactionVersion: uint8ptr(0),
	})
	if err != nil {
		notification.Stage = SolanaStageInternalError
		sa.db.UpdateSolanaNotification(ctx, &notification)
		return fmt.Errorf("rpc error for %s: %w", sig, err)
	}

	notification.Params.Result.Value.Logs = txResp.Meta.LogMessages
	if txResp.Meta.Err != nil {
		notification.Stage = SolanaStageTxError
	} else {
		programId := solana.MustPublicKeyFromBase58(sa.cfg.ProgramId)
		sep := NewSolanaEventProcessor(programId, sa.rpcClient, sa.httpClient)
		if err := sep.ExtractEvents(&notification); err != nil {
			notification.Stage = SolanaStageEventError
		} else {
			processResult, err := sep.ProcessEvents(ctx, &notification)
			if err != nil {
				notification.Stage = SolanaStageBusinessError
			} else {
				if processResult.Mutator.HasMutations() {
					if err := processResult.Mutator.ApplyAll(ctx, sa.db); err != nil {
						notification.Stage = SolanaStageInternalError
					}
				}
				if notification.Stage == SolanaStageDone && processResult.Applicator.HasApplications() {
					_ = processResult.Applicator.ApplyAll(ctx, sa.telegram, sa.sseAgent)
				}
			}
		}
	}

	if err := sa.db.UpdateSolanaNotification(ctx, &notification); err != nil {
		return fmt.Errorf("failed to update notification: %w", err)
	}

	if notification.Stage != SolanaStageDone && notification.Stage != SolanaStageTxError {
		return fmt.Errorf("processing stopped at stage: %s", notification.Stage)
	}

	return nil
}

func (sep *SolanaEventProcessor) ExtractEvents(notification *SolanaNotification) error {
	logs := notification.Params.Result.Value.Logs
	var events []SolanaEvent
	var maybeErr error

	for _, log := range logs {
		if base64Data, ok := strings.CutPrefix(log, "Program data: "); ok {
			decoded, err := base64.StdEncoding.DecodeString(base64Data)
			if err != nil {
				maybeErr = fmt.Errorf("cannot decode program data: %v", err)
				break
			}

			if len(decoded) < 8 {
				maybeErr = fmt.Errorf("invalid program data length: %v", len(decoded))
				break
			}

			programData, eventType, err := sep.decodeEvent(decoded)
			if err != nil {
				maybeErr = fmt.Errorf("cannot decode event: %v", err)
				break
			}

			event := SolanaEvent{
				ProgramData: programData,
				Type:        &eventType,
			}
			events = append(events, event)
		}
	}

	if maybeErr != nil {
		return maybeErr
	}
	if len(events) == 0 {
		return fmt.Errorf("events not found")
	}

	notification.Events = events
	return nil
}

func (sep *SolanaEventProcessor) decodeEvent(input []byte) ([]byte, string, error) {
	var discriminator [8]byte
	programData := input[8:]
	copy(discriminator[:], input[:8])

	eventType, ok := eventDiscriminators[discriminator]
	if !ok {
		return programData, "", fmt.Errorf("unknown event discriminator %v ", discriminator)
	}
	return programData, eventType, nil
}

func (sep *SolanaEventProcessor) ProcessEvents(ctx context.Context, notification *SolanaNotification) (*ProcessResult, error) {
	signature := notification.Params.Result.Value.Signature
	slot := notification.Params.Result.Context.Slot

	result := NewProcessResult()

	txDecoded, blocktime, err := sep.getTransaction(ctx, signature)
	if err != nil {
		return result, err
	}

	for i := range notification.Events {
		event := &notification.Events[i]
		var maybeError error
		eventType := *event.Type
		switch eventType {
		case "SparkCardInstanceMinted":
			{
				payload, err := sep.extractSparkCardPayload(event.ProgramData)
				if err != nil || payload == nil {
					maybeError = fmt.Errorf("cannot extract payload for event %s: %v", eventType, err)
					break
				}
				marshalled, err := json.Marshal(payload)
				if err != nil {
					maybeError = fmt.Errorf("cannot marshal payload for event %s: %v", eventType, err)
					break
				}
				rawJson := json.RawMessage(marshalled)
				event.Payload = &rawJson

				discriminator, ok := ixDiscriminators[*event.Type]
				if !ok {
					maybeError = fmt.Errorf("cannot find ix discriminator for event %v", eventType)
					break
				}

				cardMintIx, err := sep.findInstruction(txDecoded, discriminator, 13)
				if err != nil {
					maybeError = err
					break
				}
				mintPubKey := txDecoded.Message.AccountKeys[cardMintIx.Accounts[0]]
				ownerPubKey := txDecoded.Message.AccountKeys[cardMintIx.Accounts[1]]
				cardStatePubKey := txDecoded.Message.AccountKeys[cardMintIx.Accounts[7]]
				metadataUri, err := sep.getCardMetadataUri(ctx, mintPubKey)
				if err != nil || metadataUri == nil {
					maybeError = err
					break
				}
				metadataByte, err := sep.fetchIPFSMetadata(ctx, *metadataUri)
				if err != nil {
					maybeError = err
					break
				}
				metadata, err := sep.parseCardMetadata(metadataByte)
				if err != nil {
					maybeError = err
					break
				}
				biome, err := CheckBiome(metadata["biome"])
				if err != nil || biome == nil {
					maybeError = err
					break
				}
				rarity, err := CheckRarity(metadata["rarity"])
				if err != nil || rarity == nil {
					maybeError = err
					break
				}
				stone, err := CheckStone(metadata["stone"])
				if err != nil || stone == nil {
					maybeError = err
					break
				}
				ownerPubKeyStr := ownerPubKey.String()
				monster := &Monster{
					ExperimentId:     int(payload.ExperimentId),
					Signature:        signature,
					Slot:             slot,
					MintAddress:      mintPubKey.String(),
					OwnerAddress:     &ownerPubKeyStr,
					CardStateAddress: cardStatePubKey.String(),
					Name:             metadata["name"],
					Species:          metadata["species"],
					Lore:             metadata["lore"],
					MovementClass:    metadata["movement_class"],
					Behaviour:        metadata["behaviour"],
					Personality:      metadata["personality"],
					Abilities:        metadata["abilities"],
					Habitat:          metadata["habitat"],
					Biome:            *biome,
					Rarity:           *rarity,
					Stone:            *stone,
					SerialNumber:     int(payload.SerialNumber),
					Generation:       1,
					Status:           "active",
					MetadataUri:      *metadataUri,
					ImageCid:         metadata["image"],
					Minted:           time.Unix(int64(*blocktime), 0).UTC(),
				}
				result.Mutator.AddMutation(&UseStoneSparkMutation{Monster: monster})
				result.Mutator.AddMutation(&InsertMonsterMutation{Monster: monster})
				result.Applicator.AddApplication(&MintMonsterApplication{Monster: monster})
			}
		case "CardExchanged":
			{
				payload, err := sep.extractSwapPayload(event.ProgramData)
				if err != nil {
					maybeError = fmt.Errorf("cannot extract payload for SparkUsed: %w", err)
					break
				}

				marshalled, err := json.Marshal(payload)
				if err != nil {
					maybeError = fmt.Errorf("cannot marshal payload for event %s: %v", eventType, err)
					break
				}
				rawJson := json.RawMessage(marshalled)
				event.Payload = &rawJson

				discriminator, ok := ixDiscriminators[*event.Type]
				if !ok {
					maybeError = fmt.Errorf("cannot find ix discriminator for event %v", eventType)
					break
				}

				swapIx, err := sep.findInstruction(txDecoded, discriminator, 18)
				if err != nil {
					maybeError = fmt.Errorf("cannot find swap instruction in tx: %v", err)
					break
				}
				userPubKey := txDecoded.Message.AccountKeys[swapIx.Accounts[1]]
				lostMintPubKey := txDecoded.Message.AccountKeys[swapIx.Accounts[2]]
				gainedMintPubKey := txDecoded.Message.AccountKeys[swapIx.Accounts[5]]

				result.Mutator.AddMutation(&CardExchangeMutation{
					OwnerAddress: userPubKey.String(),
					LostMint:     lostMintPubKey.String(),
					GainedMint:   gainedMintPubKey.String(),
				})
				result.Applicator.AddApplication(&CardExchangeApplication{
					OwnerAddress: userPubKey.String(),
					LostMint:     lostMintPubKey.String(),
					GainedMint:   gainedMintPubKey.String(),
				})
			}
		default:
			{
				maybeError = fmt.Errorf("unknown event type %v ", eventType)
			}
		}

		if maybeError != nil {
			errText := maybeError.Error()
			event.Error = &errText
		}
	}

	return result, nil
}

func (sep *SolanaEventProcessor) extractSwapPayload(programData []byte) (*SwapInstancePayload, error) {
	r := NewReader(programData)

	user := r.ReadBytes(32)
	userId := r.ReadUint32()
	userCardMint := r.ReadBytes(32)
	poolCardMint := r.ReadBytes(32)
	userFreeCard := r.ReadBytes(32)
	poolUserNft := r.ReadBytes(32)

	r.EnsureEOF()

	if r.err != nil {
		return nil, fmt.Errorf("cannot extract SwapInstancePayload: %v", r.err)
	}

	payload := SwapInstancePayload{
		User:         solana.PublicKeyFromBytes(user).String(),
		UserId:       int32(userId),
		UserCardMint: solana.PublicKeyFromBytes(userCardMint).String(),
		PoolCardMint: solana.PublicKeyFromBytes(poolCardMint).String(),
		UserFreeCard: solana.PublicKeyFromBytes(userFreeCard).String(),
		PoolUserNft:  solana.PublicKeyFromBytes(poolUserNft).String(),
	}
	return &payload, nil
}

func (sep *SolanaEventProcessor) extractSparkCardPayload(programData []byte) (*SparkCardInstancePayload, error) {
	r := NewReader(programData)

	mintBytes := r.ReadBytes(32)
	ownerBytes := r.ReadBytes(32)
	serialNumber := r.ReadUint32()
	cardStateBytes := r.ReadBytes(32)
	userId := r.ReadUint32()
	experimentId := r.ReadUint32()
	r.EnsureEOF()

	if r.err != nil {
		return nil, fmt.Errorf("cannot extract CardInstancePayload: %v", r.err)
	}

	payload := SparkCardInstancePayload{
		Mint:         base64.StdEncoding.EncodeToString(mintBytes),
		Owner:        base64.StdEncoding.EncodeToString(ownerBytes),
		SerialNumber: serialNumber,
		CardState:    base64.StdEncoding.EncodeToString(cardStateBytes),
		UserId:       int32(userId),
		ExperimentId: int32(experimentId),
	}
	return &payload, nil
}

func (sep *SolanaEventProcessor) getTransaction(ctx context.Context, signature string) (*solana.Transaction, *solana.UnixTimeSeconds, error) {
	sig, err := solana.SignatureFromBase58(signature)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid signature %s: %v", signature, err)
	}

	uint8ptr := func(v uint64) *uint64 {
		return &v
	}

	rpcTx, err := sep.rpcClient.GetTransaction(ctx, sig, &rpc.GetTransactionOpts{
		Encoding:                       solana.EncodingBase64,
		Commitment:                     rpc.CommitmentConfirmed,
		MaxSupportedTransactionVersion: uint8ptr(0),
	})
	if err != nil {
		return nil, nil, fmt.Errorf("cannot get transaction from RPC: %v", err)
	}
	if rpcTx == nil {
		return nil, nil, fmt.Errorf("transaction not found: %s", signature)
	}
	if rpcTx.BlockTime == nil {
		return nil, nil, fmt.Errorf("transaction blocktime not available for %s", signature)
	}

	txBytes := rpcTx.Transaction.GetBinary()
	txDecoded, err := solana.TransactionFromBytes(txBytes)
	if err != nil {
		return nil, nil, fmt.Errorf("cannot decode transaction bytes: %v", err)
	}

	return txDecoded, rpcTx.BlockTime, nil
}

func (sep *SolanaEventProcessor) findInstruction(tx *solana.Transaction, discriminator []byte, minAccounts int) (*solana.CompiledInstruction, error) {
	var instruction *solana.CompiledInstruction
	for _, ix := range tx.Message.Instructions {
		programKey := tx.Message.AccountKeys[ix.ProgramIDIndex]
		if !programKey.Equals(sep.programId) {
			continue
		}
		if len(ix.Data) >= 8 {
			if bytes.Equal(ix.Data[:8], discriminator) {
				instruction = &ix
				break
			}
		}
	}
	if instruction == nil {
		return nil, fmt.Errorf("cannot find instruction for %v", discriminator)
	}
	if len(instruction.Accounts) < minAccounts {
		return nil, fmt.Errorf("not enough accounts in instruction %v", discriminator)
	}
	return instruction, nil
}

func (sep *SolanaEventProcessor) getCardMetadataUri(ctx context.Context, mintPubKey solana.PublicKey) (*string, error) {
	tokenMetadataProgramId := solana.MustPublicKeyFromBase58(TOKEN_METADATA_PROGRAM_ID)
	metadataPDA, _, err := solana.FindProgramAddress([][]byte{
		[]byte("metadata"), tokenMetadataProgramId.Bytes(), mintPubKey.Bytes(),
	}, tokenMetadataProgramId)
	if err != nil {
		return nil, fmt.Errorf("cannot find metadata PDA: %v", err)
	}

	metadataAccount, err := sep.rpcClient.GetAccountInfoWithOpts(ctx, metadataPDA, &rpc.GetAccountInfoOpts{
		Commitment: rpc.CommitmentConfirmed,
	})
	if err != nil {
		return nil, fmt.Errorf("cannot fetch metadata account: %v", err)
	}
	if metadataAccount == nil || metadataAccount.Value == nil {
		return nil, fmt.Errorf("metadata account not found")
	}

	metadataBinary := metadataAccount.Value.Data.GetBinary()
	if len(metadataBinary) < 200 {
		return nil, fmt.Errorf("metadata account too short")
	}

	// TODO: magic numbers. workaround via IDL libs
	metadataOffset := 65
	if len(metadataBinary) <= metadataOffset {
		return nil, fmt.Errorf("metadata binary too short for offset")
	}

	r := NewReader(metadataBinary[metadataOffset:])

	nameLen := r.ReadUint32()
	if r.err != nil {
		return nil, fmt.Errorf("failed to read name length: %v", r.err)
	}
	_ = r.ReadBytes(int(nameLen))
	if r.err != nil {
		return nil, fmt.Errorf("failed to read name bytes: %v", r.err)
	}

	symbolLen := r.ReadUint32()
	if r.err != nil {
		return nil, fmt.Errorf("failed to read symbol length: %v", r.err)
	}
	_ = r.ReadBytes(int(symbolLen))
	if r.err != nil {
		return nil, fmt.Errorf("failed to read symbol bytes: %v", r.err)
	}

	uriLen := r.ReadUint32()
	if r.err != nil {
		return nil, fmt.Errorf("failed to read URI length: %v", r.err)
	}
	uriBytes := r.ReadBytes(int(uriLen))
	if r.err != nil {
		return nil, fmt.Errorf("failed to read URI bytes: %v", r.err)
	}
	for i, b := range uriBytes {
		if b == 0 {
			uriBytes = uriBytes[:i]
			break
		}
	}

	uri := string(uriBytes)
	return &uri, nil
}

func (sep *SolanaEventProcessor) fetchIPFSMetadata(ctx context.Context, ipfsUri string) ([]byte, error) {
	cid, ok := strings.CutPrefix(ipfsUri, "ipfs://")
	if !ok || cid == "" {
		return nil, fmt.Errorf("invalid IPFS URI: %s", ipfsUri)
	}

	gateways := []string{
		"https://gateway.pinata.cloud/ipfs/",
		"https://cloudflare-ipfs.com/ipfs/",
		"https://ipfs.io/ipfs/",
		"https://dweb.link/ipfs/",
	}

	type result struct {
		data []byte
		err  error
	}

	resultCh := make(chan result, len(gateways))
	groupCtx, cancelAll := context.WithCancel(ctx)
	defer cancelAll()

	for _, gateway := range gateways {
		go func(gw string) {
			url := gw + cid
			req, err := http.NewRequestWithContext(groupCtx, "GET", url, nil)
			if err != nil {
				resultCh <- result{err: err}
				return
			}
			req.Header.Set("User-Agent", "SolanaIndexer/1.0")

			resp, err := sep.httpClient.Do(req)
			if err != nil {
				resultCh <- result{err: err}
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				resultCh <- result{err: fmt.Errorf("status %d", resp.StatusCode)}
				return
			}

			data, err := io.ReadAll(resp.Body)
			resultCh <- result{data: data, err: err}
		}(gateway)

		select {
		case res := <-resultCh:
			if res.err == nil {
				cancelAll()
				return res.data, nil
			}
		case <-time.After(5000 * time.Millisecond):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	for range gateways {
		select {
		case res := <-resultCh:
			if res.err == nil {
				cancelAll()
				return res.data, nil
			}
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	return nil, fmt.Errorf("failed to fetch metadata from all gateways")
}

func (sep *SolanaEventProcessor) parseCardMetadata(metadataJSON []byte) (map[string]string, error) {
	var data map[string]any
	if err := json.Unmarshal(metadataJSON, &data); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %v", err)
	}

	result := make(map[string]string)

	requiredKeys := []string{"name", "image", "attributes", "properties"}

	for _, key := range requiredKeys {
		if _, ok := data[key]; !ok {
			return nil, fmt.Errorf("missing required field: %s", key)
		}
	}

	name, ok := data["name"].(string)
	if !ok || name == "" {
		return nil, fmt.Errorf("invalid or empty 'name' field")
	}
	result["name"] = name

	imageCid, ok := data["image"].(string)
	if !ok || imageCid == "" {
		return nil, fmt.Errorf("invalid or empty 'image' field")
	}
	if image, ok := strings.CutPrefix(imageCid, "ipfs://"); ok {
		result["image"] = image
	} else {
		result["image"] = imageCid
	}

	attributes, ok := data["attributes"].([]any)
	if !ok || len(attributes) == 0 {
		return nil, fmt.Errorf("invalid or empty 'attributes'")
	}
	for _, attr := range attributes {
		attrMap, ok := attr.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("invalid attribute entry")
		}
		traitType, _ := attrMap["trait_type"].(string)
		value, _ := attrMap["value"].(string)

		switch traitType {
		case "Biome":
			result["biome"] = value
		case "Rarity":
			result["rarity"] = value
		case "Stone":
			result["stone"] = value
		}
	}

	properties, ok := data["properties"].(map[string]any)
	if !ok || len(properties) == 0 {
		return nil, fmt.Errorf("invalid or empty 'properties'")
	}

	extractString := func(key string) error {
		val, ok := properties[key].(string)
		if !ok || val == "" {
			return fmt.Errorf("missing or invalid property: %s", key)
		}
		result[key] = val
		return nil
	}

	for _, key := range []string{"species", "lore", "movement_class", "behaviour", "personality", "abilities", "habitat"} {
		if err := extractString(key); err != nil {
			return nil, err
		}
	}

	return result, nil
}

type ProcessResult struct {
	Mutator    *DBMutator
	Applicator *Applicator
}

func NewProcessResult() *ProcessResult {
	dbMutator := &DBMutator{
		mutations: make([]DBMutation, 0),
	}
	applicator := &Applicator{
		applications: make([]Application, 0),
	}
	return &ProcessResult{
		Mutator:    dbMutator,
		Applicator: applicator,
	}
}

type DBMutation interface {
	Apply(ctx context.Context, tx *sql.Tx, db *DB) error
}
type Application interface {
	Apply(ctx context.Context, telegram *Telegram, sseAgent *SSEAgent) error
}

type DBMutator struct {
	mutations []DBMutation
}
type Applicator struct {
	applications []Application
}

func (m *DBMutator) AddMutation(cmd DBMutation) {
	m.mutations = append(m.mutations, cmd)
}

func (m *DBMutator) HasMutations() bool {
	return len(m.mutations) > 0
}

func (m *DBMutator) ApplyAll(ctx context.Context, db *DB) error {
	if !m.HasMutations() {
		return nil
	}

	tx, err := db.Conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}

	defer func() {
		if rbe := tx.Rollback(); rbe != nil && rbe != sql.ErrTxDone {
			LogError("DBMutator", "Rollback error", rbe)
		}
	}()

	for i, cmd := range m.mutations {
		if err := cmd.Apply(ctx, tx, db); err != nil {
			return fmt.Errorf("mutation #%d failed: %w", i, err)
		}
	}

	return tx.Commit()
}

func (a *Applicator) AddApplication(application Application) {
	a.applications = append(a.applications, application)
}

func (a *Applicator) HasApplications() bool {
	return len(a.applications) > 0
}

func (a *Applicator) ApplyAll(ctx context.Context, telegram *Telegram, sseAgent *SSEAgent) error {
	for i, application := range a.applications {
		if err := application.Apply(ctx, telegram, sseAgent); err != nil {
			return fmt.Errorf("application #%d failed: %w", i, err)
		}
	}
	return nil
}

type MintMonsterApplication struct {
	Monster *Monster
}

func (m *MintMonsterApplication) Apply(ctx context.Context, telegram *Telegram, sseAgent *SSEAgent) error {
	var biomeEmojis = map[Biome]string{
		"amazonia":  "🌴",
		"plushland": "🧸",
	}
	var rarityEmojis = map[Rarity]string{
		"common":    "⚪",
		"rare":      "🔵",
		"epic":      "🟣",
		"mythic":    "🟡",
		"legendary": "🔴",
	}
	telegram.SendMessage(
		PubChannel,
		"New monster %s has been borfed.\nBiome: %s\nRarity: %s\nStone: %s",
		m.Monster.Name,
		biomeEmojis[m.Monster.Biome],
		rarityEmojis[m.Monster.Rarity],
		m.Monster.Stone,
	)
	sseAgent.Emit(
		*m.Monster.OwnerAddress,
		"confirmed",
		m.Monster,
	)
	return nil
}

type CardExchangeApplication struct {
	OwnerAddress string
	LostMint     string
	GainedMint   string
}

func (a *CardExchangeApplication) Apply(ctx context.Context, telegram *Telegram, sseAgent *SSEAgent) error {
	sseAgent.Emit(
		a.OwnerAddress,
		"confirmed",
		a.GainedMint,
	)
	return nil
}

type UseStoneSparkMutation struct {
	Monster *Monster
}

func (m *UseStoneSparkMutation) Apply(ctx context.Context, tx *sql.Tx, db *DB) error {
	return db.DecreaseStoneSparksTx(ctx, tx, m.Monster)
}

type InsertMonsterMutation struct {
	Monster *Monster
}

func (m *InsertMonsterMutation) Apply(ctx context.Context, tx *sql.Tx, db *DB) error {
	return db.InsertMonsterTx(ctx, tx, m.Monster)
}

type CardExchangeMutation struct {
	OwnerAddress string
	LostMint     string
	GainedMint   string
}

func (m *CardExchangeMutation) Apply(ctx context.Context, tx *sql.Tx, db *DB) error {
	return db.SwapMonsterTx(ctx, tx, m.OwnerAddress, m.LostMint, m.GainedMint)
}

type BinaryReader struct {
	data   []byte
	offset int
	err    error
}

func NewReader(data []byte) *BinaryReader {
	return &BinaryReader{data: data, offset: 0}
}

func (r *BinaryReader) ReadBytes(n int) []byte {
	if r.err != nil {
		return nil
	}
	if r.offset+n > len(r.data) {
		r.err = fmt.Errorf("unexpected EOF reading %d bytes at offset %d", n, r.offset)
		return nil
	}
	res := r.data[r.offset : r.offset+n]
	r.offset += n
	return res
}

func (r *BinaryReader) ReadUint16() uint16 {
	b := r.ReadBytes(2)
	if b == nil {
		return 0
	}
	return binary.LittleEndian.Uint16(b)
}

func (r *BinaryReader) ReadUint32() uint32 {
	b := r.ReadBytes(4)
	if b == nil {
		return 0
	}
	return binary.LittleEndian.Uint32(b)
}

func (r *BinaryReader) ReadUint64() uint64 {
	b := r.ReadBytes(8)
	if b == nil {
		return 0
	}
	return binary.LittleEndian.Uint64(b)
}

func (r *BinaryReader) ReadString() string {
	l := r.ReadUint32()
	if r.err != nil {
		return ""
	}
	if l > 1<<20 {
		r.err = fmt.Errorf("string length too large: %d", l)
		return ""
	}
	b := r.ReadBytes(int(l))
	if b == nil {
		return ""
	}
	return string(b)
}

func (r *BinaryReader) EnsureEOF() {
	if r.err == nil && r.offset != len(r.data) {
		r.err = fmt.Errorf("unread data remaining: %d bytes", len(r.data)-r.offset)
	}
}

func (sa *SolanaAgent) Log(notification SolanaNotification) {
	var eventTypes []string
	var level string
	if notification.Stage == SolanaStageDone {
		level = "[INFO]: "
	} else {
		level = "\033[31m[ERROR]:\033[0m"
	}
	for _, event := range notification.Events {
		if event.Type != nil {
			eventTypes = append(eventTypes, *event.Type)
		}
	}
	module := "Solana"
	logLine := fmt.Sprintf(
		"%s %s %-8s | %s | %s",
		time.Now().Format("02-01-2006 15:04:05"),
		level,
		module,
		strings.Join(eventTypes, ","),
		notification.Stage,
	)
	if notification.Stage != SolanaStageDone {
		logLine += fmt.Sprintf(
			"\n Tx: %s\nSlot: %v",
			notification.Params.Result.Value.Signature,
			notification.Params.Result.Context.Slot,
		)
	}

	fmt.Fprintln(os.Stdout, logLine)
}
