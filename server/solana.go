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
	"strings"
	"time"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
	"github.com/gorilla/websocket"
)

type SolanaAgent struct {
	cfg SolanaConfig
	db  *DB
	ws  *websocket.Conn
}

type SolanaNotificationStage string

const (
	SolanaStageTxError       SolanaNotificationStage = "transaction_error"
	SolanaStageDecodeError   SolanaNotificationStage = "decode_error"
	SolanaStageEventError    SolanaNotificationStage = "event_error"
	SolanaStageBusinessError SolanaNotificationStage = "business_error"
	SolanaStageDone          SolanaNotificationStage = "done"
	SolanaStagePlaceholder   SolanaNotificationStage = "---"
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
	Events  json.RawMessage
}

type SolanaEvent struct {
	ProgramData []byte
	Type        *string
	Payload     *json.RawMessage
	Error       *string
	Created     time.Time
}

var eventDiscriminators = map[[8]byte]string{
	{246, 253, 98, 133, 133, 132, 214, 224}: "CardInstanceMinted",
	{235, 37, 241, 232, 236, 3, 253, 195}:   "StoneInstanceMinted",
	{132, 192, 109, 134, 147, 251, 93, 42}:  "SparkUsed",
}

var ixDiscriminators = map[string][]byte{
	"StoneInstanceMinted": {3, 147, 97, 164, 139, 153, 105, 248},
	"CardInstanceMinted":  {4, 182, 83, 217, 232, 35, 33, 64},
}

type SparkUsedPayload struct {
	Mint            string
	SparksRemaining uint16
}

type CardInstancePayload struct {
	Mint         string
	Owner        string
	StoneMint    string
	Name         string
	Description  string
	Biome        string
	Rarity       string
	SerialNumber uint32
	CardState    string
	UserId       int32
	ExperimentId int32
}

type StoneInstancePayload struct {
	Mint         string
	Owner        string
	StoneType    string
	SerialNumber uint32
	PricePaid    uint64
	StoneState   string
	UserId       int32
}

func NewSolanaAgent(cfg SolanaConfig, db *DB) *SolanaAgent {
	sa := &SolanaAgent{
		cfg: cfg,
		db:  db,
	}
	go sa.Start()
	return sa
}

func (sa *SolanaAgent) Start() {
	backoff := 1 * time.Second
	for {
		if err := sa.connectAndListen(); err != nil {
			LogError("Solana", "connection error", err)
			time.Sleep(backoff)
			if backoff < 30*time.Second {
				backoff *= 2
			}
		} else {
			backoff = 1 * time.Second
		}
	}
}

func (sa *SolanaAgent) connectAndListen() error {
	c, _, err := websocket.DefaultDialer.Dial(rpc.DevNet.WS, nil)
	if err != nil {
		return err
	}
	sa.ws = c
	defer sa.ws.Close()

	subscribeMsg := map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "logsSubscribe",
		"params": []any{
			map[string]any{
				"mentions": []string{sa.cfg.ProgramId},
			},
			map[string]any{
				"commitment": "confirmed",
			},
		},
	}

	if err := sa.ws.WriteJSON(subscribeMsg); err != nil {
		return err
	}

	LogInfo("Solana", fmt.Sprintf("Subscribed to logs for program %s", sa.cfg.ProgramId))

	pingTicker := time.NewTicker(19 * time.Second)
	defer pingTicker.Stop()

	go func() {
		for range pingTicker.C {
			if err := sa.ws.WriteMessage(websocket.PingMessage, []byte{}); err != nil {
				LogError("Solana", "ping error", err)
				return
			}
		}
	}()

	for {
		_, notification, err := sa.ws.ReadMessage()
		if err != nil {
			return err
		}

		sa.processNotification(notification)
	}
}

func (sa *SolanaAgent) processNotification(input []byte) {
	var notification SolanaNotification
	if err := json.Unmarshal(input, &notification); err != nil {
		LogError("Solana", "failed to parse notification", err)
		return
	}

	if notification.Method != "logsNotification" {
		return
	}

	txError := notification.Params.Result.Value.Err
	if txError != nil {
		notification.Stage = SolanaStageTxError
	}
	ctx := context.Background()

	programId, err := solana.PublicKeyFromBase58(sa.cfg.ProgramId)
	if err != nil {
		notification.Stage = SolanaStagePlaceholder
	}
	srm := NewSolanaRpcManager(programId)

	events, dbMutator, err := srm.ProcessLogs(ctx, notification)

	if err != nil || len(events) == 0 {
		notification.Stage = SolanaStageDecodeError
	}

	eventsJSON, err := json.Marshal(events)
	if err != nil {
		notification.Stage = SolanaStageBusinessError
	}

	notification.Events = eventsJSON

	if notification.Stage != SolanaStageBusinessError {
		notification.Stage = SolanaStageDone
	}

	if dbMutator.HasMutations() {
		if err := dbMutator.ApplyAll(ctx, sa.db); err != nil {
			notification.Stage = SolanaStagePlaceholder
		}
	}

	err = sa.db.InsertSolanaNotification(ctx, &notification)
	if err != nil {
		notification.Stage = SolanaStagePlaceholder
	}

	sa.Log(notification)
}

type SolanaEventExtractor struct{}

func (see *SolanaEventExtractor) DecodeEvent(input []byte) ([]byte, string, error) {
	var discriminator [8]byte
	programData := input[8:]
	copy(discriminator[:], input[:8])

	eventType, ok := eventDiscriminators[discriminator]
	if !ok {
		return programData, "", fmt.Errorf("unknown event discriminator %v ", discriminator)
	}
	return programData, eventType, nil
}

func (see *SolanaEventExtractor) ExtractStonePayload(programData []byte) (*StoneInstancePayload, error) {
	r := NewReader(programData)
	mintBytes := r.ReadBytes(32)
	ownerBytes := r.ReadBytes(32)
	stoneType := r.ReadString()
	serialNumber := r.ReadUint32()
	pricePaid := r.ReadUint64()
	stateBytes := r.ReadBytes(32)
	userId := r.ReadUint32()
	r.EnsureEOF()

	if r.err != nil {
		return nil, r.err
	}

	payload := StoneInstancePayload{
		Mint:         base64.StdEncoding.EncodeToString(mintBytes),
		Owner:        base64.StdEncoding.EncodeToString(ownerBytes),
		SerialNumber: serialNumber,
		StoneType:    stoneType,
		StoneState:   base64.StdEncoding.EncodeToString(stateBytes),
		PricePaid:    pricePaid,
		UserId:       int32(userId),
	}
	return &payload, nil
}

func (see *SolanaEventExtractor) ExtractCardPayload(programData []byte) (*CardInstancePayload, error) {
	r := NewReader(programData)

	mintBytes := r.ReadBytes(32)
	ownerBytes := r.ReadBytes(32)
	stoneMintBytes := r.ReadBytes(32)
	name := r.ReadString()
	description := r.ReadString()
	biome := r.ReadString()
	rarity := r.ReadString()
	serialNumber := r.ReadUint32()
	cardStateBytes := r.ReadBytes(32)
	userId := r.ReadUint32()
	experimentId := r.ReadUint32()
	r.EnsureEOF()

	if r.err != nil {
		return nil, r.err
	}

	payload := CardInstancePayload{
		Mint:         base64.StdEncoding.EncodeToString(mintBytes),
		Owner:        base64.StdEncoding.EncodeToString(ownerBytes),
		StoneMint:    base64.StdEncoding.EncodeToString(stoneMintBytes),
		Name:         name,
		Description:  description,
		Biome:        biome,
		Rarity:       rarity,
		SerialNumber: serialNumber,
		CardState:    base64.StdEncoding.EncodeToString(cardStateBytes),
		UserId:       int32(userId),
		ExperimentId: int32(experimentId),
	}
	return &payload, nil
}

func (see *SolanaEventExtractor) ExtractSparkPayload(programData []byte) (*SparkUsedPayload, error) {
	r := NewReader(programData)

	mintBytes := r.ReadBytes(32)
	sparksRemaining := r.ReadUint16()

	r.EnsureEOF()

	if r.err != nil {
		return nil, r.err
	}

	payload := SparkUsedPayload{
		Mint:            base64.StdEncoding.EncodeToString(mintBytes),
		SparksRemaining: sparksRemaining,
	}
	return &payload, nil
}

type SolanaRpcManager struct {
	rpcClient *rpc.Client
	programId solana.PublicKey
}

func NewSolanaRpcManager(programId solana.PublicKey) *SolanaRpcManager {
	rpcClient := rpc.New(rpc.DevNet.RPC)
	rpc := &SolanaRpcManager{
		rpcClient: rpcClient,
		programId: programId,
	}
	return rpc
}

func (srm *SolanaRpcManager) getTransaction(ctx context.Context, signature string) (*solana.Transaction, *solana.UnixTimeSeconds, error) {

	sig, err := solana.SignatureFromBase58(signature)
	if err != nil {
		return nil, nil, err
	}
	rpcTx, err := srm.rpcClient.GetTransaction(ctx, sig, &rpc.GetTransactionOpts{
		Encoding:   solana.EncodingBase64,
		Commitment: rpc.CommitmentConfirmed,
	})
	if err != nil {
		return nil, nil, err
	}
	if rpcTx.BlockTime == nil {
		return nil, nil, err
	}
	txBytes := rpcTx.Transaction.GetBinary()
	txDecoded, err := solana.TransactionFromBytes(txBytes)
	if err != nil {
		return nil, nil, err
	}
	return txDecoded, rpcTx.BlockTime, nil
}

func (srm *SolanaRpcManager) ProcessLogs(ctx context.Context, notification SolanaNotification) ([]SolanaEvent, *DBMutator, error) {
	signature := notification.Params.Result.Value.Signature
	slot := notification.Params.Result.Context.Slot
	logs := notification.Params.Result.Value.Logs

	var events []SolanaEvent
	dbMutator := NewDBMutator()
	txDecoded, blocktime, err := srm.getTransaction(ctx, signature)
	if err != nil {
		return events, dbMutator, err
	}

	for _, log := range logs {
		if base64Data, ok := strings.CutPrefix(log, "Program data: "); ok {
			decoded, err := base64.StdEncoding.DecodeString(base64Data)
			if err != nil || len(decoded) < 8 {
				notification.Stage = SolanaStagePlaceholder
				break
			}

			var maybeError error

			extractor := SolanaEventExtractor{}

			programData, eventType, err := extractor.DecodeEvent(decoded)
			if err != nil {
				notification.Stage = SolanaStagePlaceholder
				break
			}
			event := SolanaEvent{
				ProgramData: programData,
				Type:        &eventType,
			}

			switch eventType {
			case "CardInstanceMinted":
				{
					payload, err := extractor.ExtractCardPayload(programData)
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

					cardMintIx, err := srm.findInstruction(txDecoded, discriminator, 13)
					if err != nil {
						maybeError = err
						break
					}
					mintPubKey := txDecoded.Message.AccountKeys[cardMintIx.Accounts[0]]
					ownerPubKey := txDecoded.Message.AccountKeys[cardMintIx.Accounts[1]]
					stoneMintPubKey := txDecoded.Message.AccountKeys[cardMintIx.Accounts[5]]
					cardStatePubKey := txDecoded.Message.AccountKeys[cardMintIx.Accounts[9]]

					metadataUri, err := srm.getCardMetadataUri(ctx, mintPubKey)
					if err != nil || metadataUri == nil {
						maybeError = err
						break
					}
					metadataByte, err := srm.fetchIPFSMetadata(*metadataUri)
					if err != nil {
						maybeError = err
						break
					}
					metadata, err := srm.parseCardMetadata(metadataByte)
					if err != nil {
						maybeError = err
						break
					}
					monster := &Monster{
						ExperimentId:     int(payload.ExperimentId),
						Signature:        signature,
						Slot:             slot,
						MintAddress:      mintPubKey.String(),
						OwnerAddress:     ownerPubKey.String(),
						StoneMintAddress: stoneMintPubKey.String(),
						CardStateAddress: cardStatePubKey.String(),
						Name:             metadata["name"],
						Species:          metadata["species"],
						Lore:             metadata["lore"],
						MovementClass:    metadata["movement_class"],
						Behaviour:        metadata["behaviour"],
						Personality:      metadata["personality"],
						Abilities:        metadata["abilities"],
						Habitat:          metadata["habitat"],
						Biome:            Biome(metadata["biome"]),
						Rarity:           Rarity(metadata["rarity"]),
						SerialNumber:     int(payload.SerialNumber),
						Generation:       1,
						MetadataUri:      *metadataUri,
						ImageCid:         metadata["image"],
						Minted:           time.Unix(int64(*blocktime), 0).UTC(),
					}
					dbMutator.AddMutation(&InsertMonsterMutation{Monster: monster})
				}
			case "StoneInstanceMinted":
				{
					payload, err := extractor.ExtractStonePayload(programData)
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

					stoneMintIx, err := srm.findInstruction(txDecoded, discriminator, 4)
					if err != nil {
						maybeError = err
						break
					}
					mintPubKey := txDecoded.Message.AccountKeys[stoneMintIx.Accounts[0]]
					ownerPubKey := txDecoded.Message.AccountKeys[stoneMintIx.Accounts[1]]
					stoneStatePubKey := txDecoded.Message.AccountKeys[stoneMintIx.Accounts[3]]

					sparksRemaining, err := srm.getStoneState(ctx, stoneStatePubKey)
					if err != nil {
						maybeError = err
						break
					}
					stone := &Stone{
						MintAddress:  mintPubKey.String(),
						OwnerAddress: ownerPubKey.String(),
						PdaAddress:   stoneStatePubKey.String(),
						Signature:    signature,
						Slot:         slot,
						Minted:       time.Now().UTC(),
						SparkCount:   int(sparksRemaining),
						Type:         StoneType(payload.StoneType),
					}
					dbMutator.AddMutation(&InsertStoneMutation{Stone: stone})
				}
			case "SparkUsed":
				{
					payload, err := extractor.ExtractSparkPayload(programData)
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

					dbMutator.AddMutation(&UpdateStoneMutation{Mint: payload.Mint, SparksRemaining: int(payload.SparksRemaining)})
				}
			default:
				{
					maybeError = fmt.Errorf("unknown event type %v ", eventType)
				}
			}

			if maybeError != nil {
				notification.Stage = SolanaStageEventError
				errText := maybeError.Error()
				event.Error = &errText
			}
			events = append(events, event)
		}
	}
	return events, dbMutator, nil
}

func (srm *SolanaRpcManager) findInstruction(tx *solana.Transaction, discriminator []byte, minAccounts int) (*solana.CompiledInstruction, error) {
	var instruction *solana.CompiledInstruction
	for _, ix := range tx.Message.Instructions {
		programKey := tx.Message.AccountKeys[ix.ProgramIDIndex]
		if !programKey.Equals(srm.programId) {
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

func (srm *SolanaRpcManager) getStoneState(ctx context.Context, stoneStatePubKey solana.PublicKey) (int, error) {
	stoneStateAccount, err := srm.rpcClient.GetAccountInfoWithOpts(
		ctx,
		stoneStatePubKey,
		&rpc.GetAccountInfoOpts{
			Commitment: rpc.CommitmentConfirmed,
		},
	)
	if err != nil {
		return 0, fmt.Errorf("cannot get stone state account: %v", err)
	}
	if stoneStateAccount == nil || stoneStateAccount.Value == nil {
		return 0, fmt.Errorf("cannot validate stone state account: %v", err)
	}
	stoneState := stoneStateAccount.Value.Data.GetBinary()
	if len(stoneState) < 2 {
		return 0, fmt.Errorf("stone state data too short")
	}
	sparksRemaining := binary.LittleEndian.Uint16(stoneState[40:42])
	if sparksRemaining <= 0 {
		return 0, fmt.Errorf("selected stone has no sparks")
	}
	return int(sparksRemaining), nil
}

func (srm *SolanaRpcManager) getCardMetadataUri(ctx context.Context, mintPubKey solana.PublicKey) (*string, error) {

	tokenMetadataProgramId := solana.MustPublicKeyFromBase58(TOKEN_METADATA_PROGRAM_ID)
	metadataPDA, _, err := solana.FindProgramAddress([][]byte{
		[]byte("metadata"), tokenMetadataProgramId.Bytes(), mintPubKey.Bytes(),
	}, tokenMetadataProgramId)
	if err != nil {
		return nil, fmt.Errorf("cannot find metadata address: %v", err)
	}
	metadataAccount, err := srm.rpcClient.GetAccountInfoWithOpts(
		ctx,
		metadataPDA,
		&rpc.GetAccountInfoOpts{
			Commitment: rpc.CommitmentConfirmed,
		},
	)
	if err != nil {
		return nil, fmt.Errorf("cannot get metadata account: %v", err)
	}
	if metadataAccount == nil || metadataAccount.Value == nil {
		return nil, fmt.Errorf("cannot validate metadata account")
	}
	metadataBinary := metadataAccount.Value.Data.GetBinary()
	if len(metadataBinary) < 200 {
		return nil, fmt.Errorf("metadata too short")
	}
	metadataOffset := 65
	r := NewReader(metadataBinary[metadataOffset:])

	nameLen := r.ReadUint32()
	_ = r.ReadBytes(int(nameLen))
	symbolLen := r.ReadUint32()
	_ = r.ReadBytes(int(symbolLen))
	uriLen := r.ReadUint32()
	uriBytes := r.ReadBytes(int(uriLen))
	if err != nil {
		return nil, fmt.Errorf("failed to read uri data: %v", err)
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

func (srm *SolanaRpcManager) fetchIPFSMetadata(ipfsURI string) ([]byte, error) {
	if !strings.HasPrefix(ipfsURI, "ipfs://") {
		return nil, fmt.Errorf("not an IPFS URI: %s", ipfsURI)
	}

	cid := strings.TrimPrefix(ipfsURI, "ipfs://")
	if cid == "" {
		return nil, fmt.Errorf("empty CID in IPFS URI")
	}

	gateways := []string{
		"https://ipfs.io/ipfs/",
		"https://gateway.pinata.cloud/ipfs/",
		"https://cloudflare-ipfs.com/ipfs/",
		"https://dweb.link/ipfs/",
		"https://ipfs.infura.io/ipfs/",
	}

	var lastErr error
	for _, gateway := range gateways {
		url := gateway + cid

		client := &http.Client{
			Timeout: 15 * time.Second,
		}

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			lastErr = err
			continue
		}

		req.Header.Set("User-Agent", "Mozilla/5.0")

		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("HTTP %d from %s", resp.StatusCode, gateway)
			continue
		}

		data, err := io.ReadAll(resp.Body)
		if err != nil {
			lastErr = err
			continue
		}

		return data, nil
	}

	return nil, fmt.Errorf("failed to fetch from all gateways, last error: %v", lastErr)
}

func (srm *SolanaRpcManager) parseCardMetadata(metadataJSON []byte) (map[string]string, error) {
	var data map[string]any
	if err := json.Unmarshal(metadataJSON, &data); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %v", err)
	}

	result := make(map[string]string)

	extractString := func(key string, data map[string]any) {
		if val, ok := data[key]; ok {
			result[key] = val.(string)
		}
	}

	extractString("name", data)

	if imageCid, ok := data["image"].(string); ok {
		if image, ok := strings.CutPrefix(imageCid, "ipfs://"); ok {
			result["image"] = image
		} else {
			result["image"] = image
		}
	}

	if attributes, ok := data["attributes"].([]any); ok {
		for _, attr := range attributes {
			if attrMap, ok := attr.(map[string]any); ok {
				traitType, _ := attrMap["trait_type"].(string)
				value, _ := attrMap["value"].(string)

				switch traitType {
				case "Biome":
					result["biome"] = value
				case "Rarity":
					result["rarity"] = value
				}
			}
		}
	}

	if properties, ok := data["properties"].(map[string]any); ok {
		extractString("species", properties)
		extractString("lore", properties)
		extractString("movement_class", properties)
		extractString("behaviour", properties)
		extractString("personality", properties)
		extractString("abilities", properties)
		extractString("habitat", properties)
	}

	return result, nil
}

type DBMutation interface {
	Apply(ctx context.Context, tx *sql.Tx, db *DB) error
}

type DBMutator struct {
	mutations []DBMutation
}

func NewDBMutator() *DBMutator {
	return &DBMutator{
		mutations: make([]DBMutation, 0),
	}
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

type InsertMonsterMutation struct {
	Monster *Monster
}

func (m *InsertMonsterMutation) Apply(ctx context.Context, tx *sql.Tx, db *DB) error {
	return db.InsertMonsterTx(ctx, tx, m.Monster)
}

type InsertStoneMutation struct {
	Stone *Stone
}

func (m *InsertStoneMutation) Apply(ctx context.Context, tx *sql.Tx, db *DB) error {
	return db.InsertStoneTx(ctx, tx, m.Stone)
}

type UpdateStoneMutation struct {
	Mint            string
	SparksRemaining int
}

func (m *UpdateStoneMutation) Apply(ctx context.Context, tx *sql.Tx, db *DB) error {
	return db.UpdateStoneTx(ctx, tx, m.Mint, m.SparksRemaining)
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
		logLine += fmt.Sprintf("\n Tx: %s, Slot: %v", notification.Params.Result.Value.Signature, notification.Params.Result.Context.Slot)
	}

	fmt.Fprintln(os.Stdout, logLine)
}
