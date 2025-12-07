package main

import (
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
	AppId           string
	VerificationKey string
	Wallet          string
}

type SolanaConfig struct {
	ProgramId            string
	CardCollectionPubKey string

	AdminPublicKey            string
	StoneCollection           string
	CollectionUpdateAuthority string
	TreasuryPda               string
}

type PinataConfig struct {
	PinataKey    string
	PinataSecret string
	PinataToken  string
}

type Config struct {
	DB          DBConfig
	Telegram    TelegramConfig
	Privy       PrivyConfig
	Solana      SolanaConfig
	Pinata      PinataConfig
	OpenAIToken string
	Port        string
	Environment string
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
	privyKey, err := requireEnv("PRIVY_VERIFICATION_KEY")
	if err != nil {
		return nil, err
	}
	privyWallet, err := requireEnv("PRIVY_WALLET")
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
			VerificationKey: privyKey,
			AppId:           privyAppID,
			Wallet:          privyWallet,
		},
		Solana: SolanaConfig{
			ProgramId:            solanaProgramId,
			CardCollectionPubKey: cardCollectionPubKey,
		},
		Pinata: PinataConfig{
			PinataKey:    pinataKey,
			PinataSecret: pinataSecret,
			PinataToken:  pinataToken,
		},
		OpenAIToken: openAIToken,
		Port:        port,
		Environment: environment,
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
