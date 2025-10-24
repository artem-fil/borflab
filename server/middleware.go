package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime/debug"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Middleware struct {
	cfg PrivyConfig
}

func NewMiddleware(cfg PrivyConfig) *Middleware {
	return &Middleware{cfg: cfg}
}

var requestIdCounter uint64

type PrivyClaims struct {
	Id             string `json:"sub,omitempty"`
	AppId          string `json:"aud,omitempty"`
	Expiration     uint64 `json:"exp,omitempty"`
	Issuer         string `json:"iss,omitempty"`
	LinkedAccounts string `json:"linked_accounts,omitempty"`
	jwt.RegisteredClaims
}

type PrivyLinkedAccount struct {
	Type    string `json:"type"`
	Address string `json:"address"`
}

func (c *PrivyClaims) ParseLinkedAccounts() ([]PrivyLinkedAccount, error) {
	if c.LinkedAccounts == "" {
		return []PrivyLinkedAccount{}, nil
	}

	var accs []PrivyLinkedAccount
	if err := json.Unmarshal([]byte(c.LinkedAccounts), &accs); err != nil {
		return nil, err
	}
	return accs, nil
}

func (c *PrivyClaims) Email() (string, bool) {
	accs, err := c.ParseLinkedAccounts()
	if err != nil {
		return "", false
	}

	for _, acc := range accs {
		if acc.Type == "email" {
			return acc.Address, true
		}
	}
	return "", false
}

// TODO: func (c *PrivyClaims) Account(type string) {} instead?
func (c *PrivyClaims) Wallet() (string, bool) {
	accs, err := c.ParseLinkedAccounts()
	if err != nil {
		return "", false
	}

	for _, acc := range accs {
		if acc.Type == "wallet" {
			return acc.Address, true
		}
	}
	return "", false
}

func (c *PrivyClaims) Valid(appId string) error {
	if c.Expiration < uint64(time.Now().Unix()) {
		return errors.New("token is expired")
	}
	if c.AppId != appId {
		return fmt.Errorf("invalid app id: got %s", c.AppId)
	}
	if c.Issuer != "privy.io" {
		return fmt.Errorf("invalid issuer: %s", c.Issuer)
	}

	return nil
}

func (m *Middleware) RequireAuth(next func(*Responder, *http.Request)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		rw, ok := w.(*Responder)
		if !ok {
			LogError("Middleware", "Cannot cast w into Responder", nil)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		auth := r.Header.Get("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			rw.SendUnauthorized("Malformed authorization token")
			return
		}

		tokenString := strings.TrimPrefix(auth, "Bearer ")

		token, err := jwt.ParseWithClaims(
			tokenString,
			&PrivyClaims{},
			func(token *jwt.Token) (any, error) {

				// TODO: fix this. store as .pem file or read+format once at app start.
				pem := fmt.Sprintf("-----BEGIN PUBLIC KEY-----\n%s\n-----END PUBLIC KEY-----", m.cfg.VerificationKey)

				if token.Method.Alg() != jwt.SigningMethodES256.Alg() {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}

				pubKey, err := jwt.ParseECPublicKeyFromPEM([]byte(pem))
				if err != nil {
					return nil, fmt.Errorf("failed to parse ECDSA public key: %w", err)
				}
				return pubKey, nil
			},
		)
		if err != nil {
			LogError("Middleware", "Cannot parse JWT", err)
			rw.SendUnauthorized()
			return
		}

		claims, ok := token.Claims.(*PrivyClaims)

		if !ok {
			LogError("Middleware", "Cannot cast claims", err)
			rw.SendUnauthorized()
			return
		}

		if err := claims.Valid(m.cfg.AppId); err != nil {
			LogError("Middleware", "Cannot validate JWT", err)
			rw.SendUnauthorized()
			return
		}

		if id, ok := strings.CutPrefix(claims.Id, "did:privy:"); ok {
			rw.UserId = id
		} else {
			rw.UserId = claims.Id
		}

		ctx := context.WithValue(r.Context(), "claims", *claims)

		next(rw, r.WithContext(ctx))
	})
}

func (m *Middleware) CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		allowed := map[string]bool{
			"https://borflab.com":   true,
			"http://localhost:7007": true,
		}

		// curl, postman
		if origin == "" {
			host := r.Host
			if strings.HasPrefix(host, "localhost") || strings.HasPrefix(host, "127.0.0.1") {
				next.ServeHTTP(w, r)
				return
			}
			http.Error(w, "Missing Origin not allowed", http.StatusForbidden)
			return
		}

		if !allowed[origin] {
			http.Error(w, "Origin not allowed", http.StatusForbidden)
			return
		}

		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (m *Middleware) PanicRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("Panic recovered: %v\n", rec)
				log.Println(string(debug.Stack()))
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func (m *Middleware) Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodOptions {
			start := time.Now()
			id := atomic.AddUint64(&requestIdCounter, 1)

			rw := &Responder{ResponseWriter: w, StatusCode: http.StatusOK}
			next.ServeHTTP(rw, r)

			code := strconv.Itoa(rw.StatusCode)
			if rw.StatusCode >= 200 && rw.StatusCode < 300 {
				code = "\033[32m" + code + "\033[0m"
			} else {
				code = "\033[31m" + code + "\033[0m"
			}

			// TODO: dead code rn as claims appears in request only after requireAuth
			userId := "-"
			if claims, exists := Claims(r); exists {
				if id, ok := strings.CutPrefix(claims.Id, "did:privy:"); ok {
					userId = id
				}
			}

			logLine := fmt.Sprintf(
				"%s | %06d | %s | %-6s | %s | %s | %s",
				start.Format("02-01-2006 15:04:05"),
				id,
				code,
				r.Method,
				r.URL.Path,
				userId,
				time.Since(start).Round(time.Millisecond),
			)
			if r.URL.RawQuery != "" {
				logLine += "\n params: ?" + r.URL.RawQuery
			}

			fmt.Fprintln(os.Stdout, logLine)
		}
	})
}

func (m *Middleware) Wrap(next http.Handler) http.Handler {
	return m.CORS(m.PanicRecovery(next))
}

func Claims(r *http.Request) (PrivyClaims, bool) {
	claims, ok := r.Context().Value("claims").(PrivyClaims)
	return claims, ok
}
