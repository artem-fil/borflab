package main

import (
	"encoding/json"
	"errors"
	"os"
	"strconv"
)

type DBConfig struct {
	ConnURL string
}

type TelegramConfig struct {
	Enabled    bool
	Token      string
	DevChannel string
	PubChannel string
}

type PrivyConfig struct {
	AppId string
}

type SolanaConfig struct {
	PoolKey               []uint8
	SecretKey             []uint8
	ProgramId             string
	CardCollectionPubKey  string
	StoneCollectionPubKey string
}

type PinataConfig struct {
	PinataKey    string
	PinataSecret string
	PinataToken  string
}

type R2Config struct {
	R2Id     string
	R2Token  string
	R2Key    string
	R2Url    string
	R2Secret string
	R2Bucket string
}

type Config struct {
	DB               DBConfig
	Telegram         TelegramConfig
	Privy            PrivyConfig
	Solana           SolanaConfig
	Pinata           PinataConfig
	R2               R2Config
	OpenAIToken      string
	StripePrivateKey string
	StripeSecret     string
	Port             string
	Environment      string
}

func LoadConfig() (*Config, error) {
	dbURL, err := requireEnv("DB_URL")
	if err != nil {
		return nil, err
	}
	port, err := requireEnv("PORT")
	if err != nil {
		return nil, err
	}
	environment, err := requireEnv("ENVIRONMENT")
	if err != nil {
		return nil, err
	}
	openAIToken, err := requireEnv("OPENAI_TOKEN")
	if err != nil {
		return nil, err
	}
	pinataKey, err := requireEnv("PINATA_KEY")
	if err != nil {
		return nil, err
	}
	pinataSecret, err := requireEnv("PINATA_SECRET")
	if err != nil {
		return nil, err
	}
	pinataToken, err := requireEnv("PINATA_TOKEN")
	if err != nil {
		return nil, err
	}
	privyAppID, err := requireEnv("PRIVY_APP_ID")
	if err != nil {
		return nil, err
	}
	r2Id, err := requireEnv("R2_ID")
	if err != nil {
		return nil, err
	}
	r2Token, err := requireEnv("R2_TOKEN")
	if err != nil {
		return nil, err
	}
	r2Key, err := requireEnv("R2_KEY")
	if err != nil {
		return nil, err
	}
	r2Url, err := requireEnv("R2_URL")
	if err != nil {
		return nil, err
	}
	r2Secret, err := requireEnv("R2_SECRET")
	if err != nil {
		return nil, err
	}
	r2Bucket, err := requireEnv("R2_BUCKET")
	if err != nil {
		return nil, err
	}
	solanaProgramId, err := requireEnv("SOLANA_PROGRAM_ID")
	if err != nil {
		return nil, err
	}
	cardCollectionPubKey, err := requireEnv("SOLANA_CARD_COLLECTION")
	if err != nil {
		return nil, err
	}
	stoneCollectionPubKey, err := requireEnv("SOLANA_STONE_COLLECTION")
	if err != nil {
		return nil, err
	}
	stripePrivateKey, err := requireEnv("STRIPE_PRIVATE_KEY")
	if err != nil {
		return nil, err
	}
	stripeSecret, err := requireEnv("STRIPE_SECRET")
	if err != nil {
		return nil, err
	}

	telegramEnabled := requireEnvBool("TELEGRAM_ENABLED", false)
	telegramToken, err := requireEnv("TELEGRAM_TOKEN")
	if err != nil {
		return nil, err
	}
	telegramDev, err := requireEnv("TELEGRAM_DEV_CHANNEL")
	if err != nil {
		return nil, err
	}
	telegramPub, err := requireEnv("TELEGRAM_PUB_CHANNEL")
	if err != nil {
		return nil, err
	}

	keyData, err := os.ReadFile("secrets/admin_keypair.json")
	if err != nil {
		return nil, err
	}
	var secretKey []uint8
	err = json.Unmarshal(keyData, &secretKey)
	if err != nil {
		return nil, err
	}

	poolKeyData, err := os.ReadFile("secrets/pool_keypair.json")
	if err != nil {
		return nil, err
	}
	var poolKey []uint8
	err = json.Unmarshal(poolKeyData, &poolKey)
	if err != nil {
		return nil, err
	}

	cfg := &Config{
		DB: DBConfig{
			ConnURL: dbURL,
		},
		Telegram: TelegramConfig{
			Enabled:    telegramEnabled,
			Token:      telegramToken,
			DevChannel: telegramDev,
			PubChannel: telegramPub,
		},
		Privy: PrivyConfig{
			AppId: privyAppID,
		},
		Solana: SolanaConfig{
			SecretKey:             secretKey,
			PoolKey:               poolKey,
			ProgramId:             solanaProgramId,
			CardCollectionPubKey:  cardCollectionPubKey,
			StoneCollectionPubKey: stoneCollectionPubKey,
		},
		Pinata: PinataConfig{
			PinataKey:    pinataKey,
			PinataSecret: pinataSecret,
			PinataToken:  pinataToken,
		},
		R2: R2Config{
			R2Id:     r2Id,
			R2Url:    r2Url,
			R2Token:  r2Token,
			R2Key:    r2Key,
			R2Secret: r2Secret,
			R2Bucket: r2Bucket,
		},
		OpenAIToken:      openAIToken,
		StripePrivateKey: stripePrivateKey,
		StripeSecret:     stripeSecret,
		Port:             port,
		Environment:      environment,
	}

	return cfg, nil
}

func requireEnv(key string) (string, error) {
	v := os.Getenv(key)
	if v == "" {
		return "", errors.New(key + " is not set")
	}
	return v, nil
}

func requireEnvBool(key string, def bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}
