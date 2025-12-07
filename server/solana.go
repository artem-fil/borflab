package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
	"github.com/gorilla/websocket"
)

type SolanaAgent struct {
	cfg       SolanaConfig
	db        *DB
	ws        *websocket.Conn
	rpcClient *rpc.Client
}

type SolanaProcessStage string

const (
	SolanaStageTxError        SolanaProcessStage = "transaction_error"
	SolanaStageDecodeError    SolanaProcessStage = "decode_error"
	SolanaStageUnknownEvent   SolanaProcessStage = "unknown_event"
	SolanaStageInvalidPayload SolanaProcessStage = "invalid_payload"
	SolanaStageBusinessError  SolanaProcessStage = "business_error"
	SolanaStageDone           SolanaProcessStage = "done"
)

type SolanaMessage struct {
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
}

type AnchorError struct {
	InstructionIndex int    `json:"InstructionIndex"`
	Custom           uint32 `json:"Custom"`
}

var eventDiscriminators = map[[8]byte]string{
	{246, 253, 98, 133, 133, 132, 214, 224}: "CardInstanceMinted",
	{235, 37, 241, 232, 236, 3, 253, 195}:   "StoneInstanceMinted",
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

type SolanaEvent struct {
	Signature   string
	Slot        int64
	Stage       SolanaProcessStage
	Error       *string
	Type        *string
	RawInput    *json.RawMessage
	ProgramData []byte
	Payload     *json.RawMessage
	Created     time.Time
}

func NewSolanaAgent(cfg SolanaConfig, db *DB) *SolanaAgent {
	rpcClient := rpc.New(rpc.DevNet.RPC)
	sa := &SolanaAgent{
		cfg:       cfg,
		db:        db,
		rpcClient: rpcClient,
	}
	go sa.Start()
	return sa
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
		_, message, err := sa.ws.ReadMessage()
		if err != nil {
			return err
		}

		sa.processLogMessage(message)
	}
}

func (sa *SolanaAgent) processLogMessage(input []byte) {
	var msg SolanaMessage
	if err := json.Unmarshal(input, &msg); err != nil {
		LogError("Solana", "failed to parse log message", err)
		return
	}

	if msg.Method != "logsNotification" {
		return
	}

	signature := msg.Params.Result.Value.Signature
	slot := msg.Params.Result.Context.Slot
	logs := msg.Params.Result.Value.Logs
	txError := msg.Params.Result.Value.Err

	event := SolanaEvent{
		Signature: signature,
		Slot:      slot,
	}

	if txError != nil {
		event.Stage = SolanaStageTxError
		errStr := string(*txError)
		event.Error = &errStr
	} else {
		programDataBlocks, err := sa.extractProgramData(logs)
		if err != nil {
			event.Stage = SolanaStageDecodeError
			errStr := err.Error()
			event.Error = &errStr
		} else {
			for _, pd := range programDataBlocks {
				if len(pd) >= 8 {
					var discriminator [8]byte
					copy(discriminator[:], pd[:8])

					eventType, ok := eventDiscriminators[discriminator]
					if ok {
						event.Type = &eventType
						payload, err := sa.extractEventPayload(eventType, pd[8:])
						if err != nil {
							event.Stage = SolanaStageInvalidPayload
							errStr := err.Error()
							event.Error = &errStr
						} else {
							event.Payload = payload
							if err := sa.handleEvent(event); err != nil {
								event.Stage = SolanaStageBusinessError
								errStr := err.Error()
								event.Error = &errStr
							} else {
								event.Stage = SolanaStageDone
							}
						}
					}
				}
			}
		}
	}

	if event.Stage != SolanaStageDone {
		raw := make([]byte, len(input))
		copy(raw, input)
		rawMessage := json.RawMessage(raw)
		event.RawInput = &rawMessage
	}

	fmt.Printf("\n%+v\n", event)

	if _, err := sa.db.InsertSolanaEvent(context.Background(), &event); err != nil {
		LogError("Solana", "cannot insert event", err)
	}
}

func (sa *SolanaAgent) extractProgramData(logs []string) ([][]byte, error) {
	var programData [][]byte
	for _, log := range logs {
		if base64Data, ok := strings.CutPrefix(log, "Program data: "); ok {
			decoded, err := base64.StdEncoding.DecodeString(base64Data)
			if err != nil {
				return nil, fmt.Errorf("failed to decode program data: %v", err)
			}
			programData = append(programData, decoded)
		}
	}
	if len(programData) == 0 {
		return programData, errors.New("missing program data")
	}
	return programData, nil
}

func (sa *SolanaAgent) extractEventPayload(eventType string, data []byte) (*json.RawMessage, error) {

	var extractors = map[string]func([]byte) (any, error){
		"StoneInstanceMinted": sa.extractStoneInstanceMinted,
		"CardInstanceMinted":  sa.extractCardInstanceMinted,
		// "SparkCardInstanceMinted": sa.handleSparkCardInstanceMinted,
		// "CardSelected":        sa.handleCardSelected,
		// "CardSwapped":         sa.handleCardSwapped,
	}

	handler, ok := extractors[eventType]
	if !ok {
		return nil, fmt.Errorf("cannot find extractor for event %s", eventType)
	}
	payload, err := handler(data)
	if err != nil || payload == nil {
		return nil, fmt.Errorf("cannot extract payload for event %s: %v", eventType, err)
	}

	rawBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("cannot marshal payload for event %s: %v", eventType, err)
	}

	raw := json.RawMessage(rawBytes)
	return &raw, nil
}

func (sa *SolanaAgent) handleEvent(event SolanaEvent) error {

	var eventHandlers = map[string]func(SolanaEvent) error{
		"StoneInstanceMinted": sa.handleStoneInstanceMinted,
		"CardInstanceMinted":  sa.handleCardInstanceMinted,
		// "SparkCardInstanceMinted": sa.handleSparkCardInstanceMinted,
		// "CardSelected":        sa.handleCardSelected,
		// "CardSwapped":         sa.handleCardSwapped,
	}

	handler, ok := eventHandlers[*event.Type]
	if !ok {
		return fmt.Errorf("cannot find handler for event: %v", event.Type)
	}
	err := handler(event)
	if err != nil {
		return err
	}
	return nil
}

func (sa *SolanaAgent) extractStoneInstanceMinted(data []byte) (any, error) {

	offset := 0

	mintBytes, err := sa.readBytes(data, &offset, 32)
	if err != nil {
		return nil, err
	}

	ownerBytes, err := sa.readBytes(data, &offset, 32)
	if err != nil {
		return nil, err
	}

	stoneTypeLen, err := sa.readUint32(data, &offset)
	if err != nil {
		return nil, err
	}
	stoneTypeBytes, err := sa.readBytes(data, &offset, int(stoneTypeLen))
	if err != nil {
		return nil, err
	}

	serialNumber, err := sa.readUint32(data, &offset)
	if err != nil {
		return nil, err
	}

	pricePaid, err := sa.readUint64(data, &offset)
	if err != nil {
		return nil, err
	}
	stateBytes, err := sa.readBytes(data, &offset, 32)
	if err != nil {
		return nil, err
	}

	userId, err := sa.readUint32(data, &offset)
	if err != nil {
		return nil, err
	}

	if offset != len(data) {
		return nil, fmt.Errorf("parsed %d bytes but data length is %d", offset, len(data))
	}

	payload := StoneInstancePayload{
		Mint:         base64.StdEncoding.EncodeToString(mintBytes),
		Owner:        base64.StdEncoding.EncodeToString(ownerBytes),
		SerialNumber: serialNumber,
		StoneType:    string(stoneTypeBytes),
		StoneState:   base64.StdEncoding.EncodeToString(stateBytes),
		PricePaid:    pricePaid,
		UserId:       int32(userId),
	}

	return payload, nil
}

func (sa *SolanaAgent) extractCardInstanceMinted(data []byte) (any, error) {
	offset := 0

	mintBytes, err := sa.readBytes(data, &offset, 32)
	if err != nil {
		return nil, err
	}

	ownerBytes, err := sa.readBytes(data, &offset, 32)
	if err != nil {
		return nil, err
	}

	stoneMintBytes, err := sa.readBytes(data, &offset, 32)
	if err != nil {
		return nil, err
	}

	nameLen, err := sa.readUint32(data, &offset)
	if err != nil {
		return nil, err
	}
	nameBytes, err := sa.readBytes(data, &offset, int(nameLen))
	if err != nil {
		return nil, err
	}

	descriptionLen, err := sa.readUint32(data, &offset)
	if err != nil {
		return nil, err
	}
	descriptionBytes, err := sa.readBytes(data, &offset, int(descriptionLen))
	if err != nil {
		return nil, err
	}

	biomeLen, err := sa.readUint32(data, &offset)
	if err != nil {
		return nil, err
	}
	biomeBytes, err := sa.readBytes(data, &offset, int(biomeLen))
	if err != nil {
		return nil, err
	}

	rarityLen, err := sa.readUint32(data, &offset)
	if err != nil {
		return nil, err
	}
	rarityBytes, err := sa.readBytes(data, &offset, int(rarityLen))
	if err != nil {
		return nil, err
	}

	serialNumber, err := sa.readUint32(data, &offset)
	if err != nil {
		return nil, err
	}

	cardStateBytes, err := sa.readBytes(data, &offset, 32)
	if err != nil {
		return nil, err
	}

	userId, err := sa.readUint32(data, &offset)
	if err != nil {
		return nil, err
	}

	experimentId, err := sa.readUint32(data, &offset)
	if err != nil {
		return nil, err
	}

	if offset != len(data) {
		return nil, fmt.Errorf("parsed %d bytes but data length is %d", offset, len(data))
	}

	payload := CardInstancePayload{
		Mint:         base64.StdEncoding.EncodeToString(mintBytes),
		Owner:        base64.StdEncoding.EncodeToString(ownerBytes),
		StoneMint:    base64.StdEncoding.EncodeToString(stoneMintBytes),
		Name:         string(nameBytes),
		Description:  string(descriptionBytes),
		Biome:        string(biomeBytes),
		Rarity:       string(rarityBytes),
		SerialNumber: serialNumber,
		CardState:    base64.StdEncoding.EncodeToString(cardStateBytes),
		UserId:       int32(userId),
		ExperimentId: int32(experimentId),
	}

	return payload, nil
}

func (sa *SolanaAgent) handleStoneInstanceMinted(event SolanaEvent) error {

	ctx := context.Background()
	programId, err := solana.PublicKeyFromBase58(sa.cfg.ProgramId)
	if err != nil {
		return fmt.Errorf("cannot encode public key: %v", err)
	}

	signature, err := solana.SignatureFromBase58(event.Signature)
	if err != nil {
		return fmt.Errorf("cannot decode tx signature: %v", err)
	}

	tx, err := sa.rpcClient.GetTransaction(
		ctx,
		signature,
		&rpc.GetTransactionOpts{
			Encoding:   solana.EncodingBase64,
			Commitment: rpc.CommitmentConfirmed,
		},
	)
	if err != nil {
		return fmt.Errorf("cannot fetch transaction: %v. tx: %s", err, signature)
	}
	if tx.BlockTime == nil {
		return fmt.Errorf("cannot find block time. tx: %s", signature)
	}

	txBytes := tx.Transaction.GetBinary()

	txDecoded, err := solana.TransactionFromBytes(txBytes)
	if err != nil {
		return fmt.Errorf("cannot decode transaction: %v. %s", err, signature)
	}

	var mintIx *solana.CompiledInstruction
	for _, ix := range txDecoded.Message.Instructions {
		programKey := txDecoded.Message.AccountKeys[ix.ProgramIDIndex]

		if !programKey.Equals(programId) {
			continue
		}
		if len(ix.Data) >= 8 {
			discriminator := ix.Data[:8]

			if bytes.Equal(discriminator, []byte{3, 147, 97, 164, 139, 153, 105, 248}) {
				mintIx = &ix
				break
			}
		}
	}

	if mintIx == nil {
		return fmt.Errorf("cannot find mint_stone_instance instruction. tx: %s", signature)
	}

	if len(mintIx.Accounts) < 4 {
		return fmt.Errorf("not enough accounts in instruction. tx: %s", signature)
	}

	mintPubKey := txDecoded.Message.AccountKeys[mintIx.Accounts[0]]
	ownerPubKey := txDecoded.Message.AccountKeys[mintIx.Accounts[1]]
	stoneStatePubKey := txDecoded.Message.AccountKeys[mintIx.Accounts[3]]

	stoneStateAccount, err := sa.rpcClient.GetAccountInfoWithOpts(
		ctx,
		stoneStatePubKey,
		&rpc.GetAccountInfoOpts{
			Commitment: rpc.CommitmentConfirmed,
		},
	)
	if err != nil {
		return fmt.Errorf("cannot get stone state account: %v", err)
	}

	if stoneStateAccount == nil || stoneStateAccount.Value == nil {
		return fmt.Errorf("cannot validate stone state account: %v", err)
	}
	stoneState := stoneStateAccount.Value.Data.GetBinary()
	if len(stoneState) < 2 {
		return fmt.Errorf("stone state data too short")
	}

	sparksRemaining := binary.LittleEndian.Uint16(stoneState[40:42])

	if sparksRemaining <= 0 {
		return fmt.Errorf("selected stone has no sparks")
	}

	var payload map[string]any
	if err := json.Unmarshal(*event.Payload, &payload); err != nil {
		return fmt.Errorf("cannot find stone type PDA: %v", err)
	}

	maybeStoneType := payload["StoneType"].(string)
	stoneType, err := CheckStone(maybeStoneType)
	if err != nil || stoneType == nil {
		return fmt.Errorf("cannot cast stone type %s", maybeStoneType)
	}

	user, err := sa.db.SelectUserByWallet(ctx, ownerPubKey.String())
	if err != nil {
		return err
	}

	stone := &Stone{
		UserId:       user.PrivyId,
		MintAddress:  mintPubKey.String(),
		OwnerAddress: ownerPubKey.String(),
		PdaAddress:   stoneStatePubKey.String(),
		Signature:    event.Signature,
		Slot:         event.Slot,
		Minted:       time.Now().UTC(),
		SparkCount:   int(sparksRemaining),
		Type:         *stoneType,
	}

	if err := sa.db.InsertStone(ctx, stone); err != nil {
		LogError("Solana", "failed to insert stone", err)
	}

	return nil
}

func (sa *SolanaAgent) handleCardInstanceMinted(event SolanaEvent) error {
	ctx := context.Background()
	programId, err := solana.PublicKeyFromBase58(sa.cfg.ProgramId)
	if err != nil {
		return fmt.Errorf("cannot encode public key: %v", err)
	}

	signature, err := solana.SignatureFromBase58(event.Signature)
	if err != nil {
		return fmt.Errorf("cannot decode tx signature: %v", err)
	}

	tx, err := sa.rpcClient.GetTransaction(
		ctx,
		signature,
		&rpc.GetTransactionOpts{
			Encoding:   solana.EncodingBase64,
			Commitment: rpc.CommitmentConfirmed,
		},
	)
	if err != nil {
		return fmt.Errorf("cannot fetch transaction: %v. tx: %s", err, signature)
	}
	if tx.BlockTime == nil {
		return fmt.Errorf("cannot find block time. tx: %s", signature)
	}

	txBytes := tx.Transaction.GetBinary()
	txDecoded, err := solana.TransactionFromBytes(txBytes)
	if err != nil {
		return fmt.Errorf("cannot decode transaction: %v. %s", err, signature)
	}

	var cardMintIx *solana.CompiledInstruction
	for _, ix := range txDecoded.Message.Instructions {
		programKey := txDecoded.Message.AccountKeys[ix.ProgramIDIndex]
		if !programKey.Equals(programId) {
			continue
		}
		if len(ix.Data) >= 8 {
			discriminator := ix.Data[:8]
			if bytes.Equal(discriminator, []byte{4, 182, 83, 217, 232, 35, 33, 64}) {
				cardMintIx = &ix
				break
			}
		}
	}

	if cardMintIx == nil {
		return fmt.Errorf("cannot find mint_card_instance instruction. tx: %s", signature)
	}

	if len(cardMintIx.Accounts) < 13 {
		return fmt.Errorf("not enough accounts in instruction. tx: %s", signature)
	}

	mintPubKey := txDecoded.Message.AccountKeys[cardMintIx.Accounts[0]]
	ownerPubKey := txDecoded.Message.AccountKeys[cardMintIx.Accounts[1]]
	stoneMintPubKey := txDecoded.Message.AccountKeys[cardMintIx.Accounts[5]]
	cardStatePubKey := txDecoded.Message.AccountKeys[cardMintIx.Accounts[9]]

	tokenMetadataProgramId := solana.MustPublicKeyFromBase58(TOKEN_METADATA_PROGRAM_ID)

	metadataPDA, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramId.Bytes(),
			mintPubKey.Bytes(),
		},
		tokenMetadataProgramId,
	)
	if err != nil {
		return fmt.Errorf("cannot find metadata address: %v", err)
	}

	metadataAccount, err := sa.rpcClient.GetAccountInfoWithOpts(
		ctx,
		metadataPDA,
		&rpc.GetAccountInfoOpts{
			Commitment: rpc.CommitmentConfirmed,
		},
	)
	if err != nil {
		return fmt.Errorf("cannot get metadata account: %v", err)
	}
	if metadataAccount == nil || metadataAccount.Value == nil {
		return fmt.Errorf("cannot validate metadata account")
	}

	metadataBinary := metadataAccount.Value.Data.GetBinary()
	if len(metadataBinary) < 200 {
		return fmt.Errorf("metadata too short")
	}

	offset := 65

	nameLen, err := sa.readUint32(metadataBinary, &offset)
	if err != nil {
		return fmt.Errorf("failed to read name length: %v", err)
	}
	offset += int(nameLen)

	symbolLen, err := sa.readUint32(metadataBinary, &offset)
	if err != nil {
		return fmt.Errorf("failed to read symbol length: %v", err)
	}
	offset += int(symbolLen)

	uriLen, err := sa.readUint32(metadataBinary, &offset)
	if err != nil {
		return fmt.Errorf("failed to read uri length: %v", err)
	}

	uriBytes, err := sa.readBytes(metadataBinary, &offset, int(uriLen))
	if err != nil {
		return fmt.Errorf("failed to read uri data: %v", err)
	}

	for i, b := range uriBytes {
		if b == 0 {
			uriBytes = uriBytes[:i]
			break
		}
	}

	uri := string(uriBytes)

	metadataJSON, err := sa.fetchIPFSMetadata(uri)

	if err != nil {
		return fmt.Errorf("cannot fetch metadata: %v", err)

	}

	metadata, err := sa.parseNFTMetadata(metadataJSON)
	if err != nil {
		return fmt.Errorf("cannot parse metadata JSON: %v", err)

	}

	user, err := sa.db.SelectUserByWallet(ctx, ownerPubKey.String())
	if err != nil {
		return err
	}

	var payload map[string]any
	if err := json.Unmarshal(*event.Payload, &payload); err != nil {
		return fmt.Errorf("cannot unmarshall event payload: %v", err)
	}
	fmt.Println("%+v", payload)
	experimentId, ok := payload["ExperimentId"].(float64)
	if !ok {
		return fmt.Errorf("cannot convert experiment id")
	}
	serialNumber, ok := payload["SerialNumber"].(float64)
	if !ok {
		return fmt.Errorf("cannot convert serial number")
	}

	monster := &Monster{
		UserId:           user.PrivyId,
		ExperimentId:     int(experimentId),
		Signature:        event.Signature,
		Slot:             event.Slot,
		MintAddress:      mintPubKey.String(),
		OwnerAddress:     ownerPubKey.String(),
		StoneMintAddress: stoneMintPubKey.String(),
		CardStateAddress: cardStatePubKey.String(),

		Name:          metadata["name"],
		Species:       metadata["species"],
		Lore:          metadata["lore"],
		MovementClass: metadata["movement_class"],
		Behaviour:     metadata["behaviour"],
		Personality:   metadata["personality"],
		Abilities:     metadata["abilities"],
		Habitat:       metadata["habitat"],
		Biome:         Biome(metadata["biome"]),
		Rarity:        Rarity(metadata["rarity"]),
		SerialNumber:  int(serialNumber),
		Generation:    1,

		MetadataUri: uri,
		ImageCid:    metadata["image"],

		Minted: time.Unix(int64(*tx.BlockTime), 0).UTC(),
	}

	if err := sa.db.InsertMonster(ctx, monster); err != nil {
		LogError("Solana", "failed to insert monster", err)
		return err
	}

	return nil
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

func (sa *SolanaAgent) readUint32(data []byte, offset *int) (uint32, error) {
	if *offset+4 > len(data) {
		return 0, errors.New("not enough data for uint32")
	}
	val := binary.LittleEndian.Uint32(data[*offset : *offset+4])
	*offset += 4
	return val, nil
}

func (sa *SolanaAgent) readUint64(data []byte, offset *int) (uint64, error) {
	if *offset+8 > len(data) {
		return 0, errors.New("not enough data for uint64")
	}
	val := binary.LittleEndian.Uint64(data[*offset : *offset+8])
	*offset += 8
	return val, nil
}

func (sa *SolanaAgent) readBytes(data []byte, offset *int, length int) ([]byte, error) {
	if *offset+length > len(data) {
		return nil, fmt.Errorf("not enough data for %d bytes", length)
	}
	val := data[*offset : *offset+length]
	*offset += length
	return val, nil
}

func (sa *SolanaAgent) fetchIPFSMetadata(ipfsURI string) ([]byte, error) {
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

func (sa *SolanaAgent) parseNFTMetadata(metadataJSON []byte) (map[string]string, error) {
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
