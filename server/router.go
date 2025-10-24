package main

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"sync/atomic"
	"time"
)

type Router struct {
	mux *http.ServeMux
}

func NewRouter(mddlwr *Middleware, api *api) *Router {

	mux := http.NewServeMux()

	mux.Handle("/ping", mddlwr.RequireAuth(api.Ping))
	mux.Handle("/analyze", mddlwr.RequireAuth(api.AnalyzeSpecimen))
	mux.Handle("/progress/", mddlwr.RequireAuth(api.Progress))
	mux.Handle("/mint/", mddlwr.RequireAuth(api.Mint))
	mux.Handle("/users/sync", mddlwr.RequireAuth(api.SyncUser))

	return &Router{mux}
}

func (r *Router) Handle(pattern string, handler http.Handler) {
	r.mux.Handle(pattern, handler)
}

func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	start := time.Now()
	rw := &Responder{
		ResponseWriter: w,
		StatusCode:     http.StatusOK,
	}

	_, pattern := r.mux.Handler(req)

	if pattern == "" {
		rw.SendNotFound()
	} else {
		r.mux.ServeHTTP(rw, req)
	}

	if req.Method != http.MethodOptions {
		id := atomic.AddUint64(&requestIdCounter, 1)

		code := strconv.Itoa(rw.StatusCode)
		if rw.StatusCode >= 200 && rw.StatusCode < 300 {
			code = "\033[32m" + code + "\033[0m"
		} else {
			code = "\033[31m" + code + "\033[0m"
		}

		logLine := fmt.Sprintf(
			"%s | %06d | %s | %s | %-6s | %s | %s",
			start.Format("02-01-2006 15:04:05"),
			id,
			accessLogDuration(time.Since(start)),
			code,
			req.Method,
			req.URL.Path,
			rw.UserId,
		)
		if req.URL.RawQuery != "" {
			logLine += "\n params: ?" + req.URL.RawQuery
		}

		fmt.Fprintln(os.Stdout, logLine)
	}
}

func accessLogDuration(d time.Duration) string {
	switch {
	case d >= time.Second:
		return fmt.Sprintf("%4ds", int(d.Seconds()))
	case d >= time.Millisecond:
		return fmt.Sprintf("%4dms", int(d.Milliseconds()))
	default:
		return fmt.Sprintf("%4dµs", int(d.Microseconds()))
	}
}
