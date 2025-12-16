package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type Route struct {
	Method   string
	Pattern  string
	Handler  http.Handler
	Segments []string
}

type Router struct {
	mux    *http.ServeMux
	routes []Route
}

type PathParamsKey struct{}
type HandlerFunc any

func NewRouter(mddlwr *Middleware, api *api) *Router {
	mux := http.NewServeMux()
	router := &Router{mux: mux}

	router.Handle("GET", "/stones", mddlwr.RequireAuth(api.GetStones))
	router.Handle("GET", "/monsters", mddlwr.RequireAuth(api.GetMonsters))
	router.Handle("POST", "/users/sync", mddlwr.RequireAuth(api.SyncUser))
	router.Handle("POST", "/analyze", mddlwr.RequireAuth(api.AnalyzeSpecimen))
	router.Handle("GET", "/progress/:id", mddlwr.RequireAuth(api.Progress))
	router.Handle("POST", "/prepare-monster-mint/:id", mddlwr.RequireAuth(api.PrepareMonsterMint))
	router.Handle("POST", "/prepare-stone-mint", mddlwr.RequireAuth(api.PrepareStoneMint))

	// SSE
	router.Handle("GET", "/check-mint/:id", api.CheckMint)

	return router
}

func (r *Router) Handle(method, pattern string, handler HandlerFunc) {
	var h http.Handler

	switch handler := handler.(type) {
	case http.Handler:
		h = handler
	case func(http.ResponseWriter, *http.Request):
		h = http.HandlerFunc(handler)
	}

	segments := strings.Split(strings.Trim(pattern, "/"), "/")

	route := Route{
		Method:   method,
		Pattern:  pattern,
		Handler:  h,
		Segments: segments,
	}

	r.routes = append(r.routes, route)
}

func (r *Router) matchRoute(method, path string) (*Route, map[string]string) {
	pathSegments := strings.Split(strings.Trim(path, "/"), "/")

	for _, route := range r.routes {
		if route.Method != method {
			continue
		}
		if len(route.Segments) != len(pathSegments) {
			continue
		}

		params := make(map[string]string)
		matches := true
		for i, routeSeg := range route.Segments {
			pathSeg := pathSegments[i]

			if after, ok := strings.CutPrefix(routeSeg, ":"); ok {
				paramName := after
				params[paramName] = pathSeg
			} else if routeSeg != pathSeg {
				matches = false
				break
			}
		}

		if matches {
			return &route, params
		}
	}

	return nil, nil
}

func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	start := time.Now()
	rw := &Responder{
		ResponseWriter: w,
		StatusCode:     http.StatusOK,
	}

	route, params := r.matchRoute(req.Method, req.URL.Path)

	if route == nil {
		rw.SendNotFound()
	} else {
		if len(params) > 0 {
			ctx := context.WithValue(req.Context(), PathParamsKey{}, params)
			req = req.WithContext(ctx)
		}

		route.Handler.ServeHTTP(rw, req)
	}

	if req.Method != http.MethodOptions {
		// id := atomic.AddUint64(&requestIdCounter, 1)

		code := strconv.Itoa(rw.StatusCode)
		var level string
		if rw.StatusCode >= 200 && rw.StatusCode < 300 {
			code = "\033[32m" + code + "\033[0m"
			level = "[INFO]: "
		} else {
			code = "\033[31m" + code + "\033[0m"
			level = "\033[31m[ERROR]\033[0m:"
		}
		module := "API"
		logLine := fmt.Sprintf(
			"%s %s %-8s | %s | %s | %-6s | %s | %s",
			start.Format("02-01-2006 15:04:05"),
			level,
			module,
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

func Params(req *http.Request) map[string]string {
	if params, ok := req.Context().Value(PathParamsKey{}).(map[string]string); ok {
		return params
	}
	return nil
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
