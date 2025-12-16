package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gagliardetto/solana-go/rpc"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

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

	telegram := NewTelegram(cfg.Telegram, cfg.Environment)
	mddlwr := NewMiddleware(cfg.Privy)
	rpcClient := rpc.New(rpc.DevNet.RPC)

	// SSE agent
	sseAgent := NewSSEAgent()

	// Solana agent
	solanaAgent := NewSolanaAgent(cfg.Solana, db, rpcClient, sseAgent)
	solanaAgentCtx, solanaAgentCancel := context.WithCancel(context.Background())
	go solanaAgent.Start(solanaAgentCtx)

	api := NewApi(cfg, db, telegram, rpcClient, sseAgent)
	mux := NewRouter(mddlwr, api)

	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: mddlwr.Wrap(mux),
	}

	go func() {
		err := server.ListenAndServe()
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			LogError("Main", "ListenAndServe", err)
		}
	}()

	LogInfo("Main", fmt.Sprintf("🚀 Server started on %s", cfg.Port))

	// graceful shutdown
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig

	LogInfo("Main", "Shutting down gracefully...")

	solanaAgentCancel()

	ctxShutdown, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelShutdown()
	if err := server.Shutdown(ctxShutdown); err != nil {
		LogError("Main", "Server shutdown error", err)
	}

	LogInfo("Main", "Shutdown complete")
}
