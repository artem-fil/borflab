package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

type App struct {
	db       *DB
	cfg      *Config
	telegram *Telegram
}

func main() {
	log.SetFlags(0)

	// load config
	if err := godotenv.Load(); err != nil {
		LogError("Main", "No .env file found", err)
		return
	}
	cfg, err := LoadConfig()
	if err != nil {
		LogError("Main", "Cannot load config", err)
		return
	}

	// open DB connection
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := NewDB(ctx, cfg.DB)
	if err != nil {
		LogError("Main", "Cannot open DB connection", err)
		return
	}
	defer db.Close()

	// setup telegram
	telegram := NewTelegram(cfg.Telegram, cfg.Environment)

	mddlwr := NewMiddleware(cfg.Privy)

	api := NewApi(cfg, db, telegram)

	mux := http.NewServeMux()

	mux.Handle("/ping", mddlwr.RequireAuth(api.Ping))
	mux.Handle("/analyze", mddlwr.RequireAuth(api.AnalyzeSpecimen))
	mux.Handle("/progress", mddlwr.RequireAuth(api.Progress))
	mux.Handle("/users/sync", mddlwr.RequireAuth(api.SyncUser))

	server := mddlwr.Wrap(mux)

	LogInfo("Main", fmt.Sprintf("🚀 Server started on %s", cfg.Port))
	LogError("Main", "ListenAndServe", http.ListenAndServe(":"+cfg.Port, server))
}
