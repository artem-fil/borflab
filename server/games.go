package main // ← поправь на свой package

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"time"
)

const (
	sessionTTL        = 2 * time.Hour
	sessionsPerMinute = 20
	maxBodyBytes      = 256 << 10
	maxMoves          = 20000
)

// ───────────────────────── реестр игр ─────────────────────────
// Новая игра = одна запись здесь + validate. Миграции не нужны:
// метрики лежат в jsonb, а в SQL попадают только ключи из этого реестра.

type MetricDef struct {
	Key   string
	Label string
	Unit  string // "count" | "seconds"
	Desc  bool   // true — чем больше, тем лучше
}

type GameDef struct {
	Id      string
	Name    string
	Metrics []MetricDef // [0] — метрика по умолчанию; остальные — тай-брейки в заданном порядке

	validate func(m map[string]float64, elapsed float64) error // не сериализуется
}

var gameList = []*GameDef{
	{
		Id:   "dodge", // должен совпадать с id в клиентском GAMES (/play/:gameId)
		Name: "Dodge",
		Metrics: []MetricDef{
			{Key: "orbs", Label: "Orbs dodged", Unit: "count", Desc: true},
			{Key: "seconds", Label: "Survival time", Unit: "seconds", Desc: true},
		},
		validate: validateDodge,
	},
}

var games = func() map[string]*GameDef {
	m := make(map[string]*GameDef, len(gameList))
	for _, g := range gameList {
		m[g.Id] = g
	}
	return m
}()

func (g *GameDef) metric(key string) *MetricDef {
	for i := range g.Metrics {
		if g.Metrics[i].Key == key {
			return &g.Metrics[i]
		}
	}
	return nil
}

// ───────────────────────── античит: Dodge ─────────────────────────
// Зеркало GAME из клиентского движка. Меняешь GAME — меняй и здесь.
const (
	dStartDelay = 1.0
	dRamp       = 110.0
	dTravelA    = 2.1
	dTravelB    = 0.9
	dIntA       = 1.2
	dIntB       = 0.45
	dMinInt     = 0.4
	dJitter     = 0.2
	dPairStart  = 0.2
	dPairMax    = 0.4
	dHitGrace   = 0.07
)

func lerpf(a, b, t float64) float64 { return a + (b-a)*t }

func dodgeDiff(t float64) float64 {
	x := math.Min(1, math.Max(0, t/dRamp))
	return 1 - (1-x)*(1-x)
}

// dodgeMaxOrbs — верхняя граница числа увёрнутых орбов за sec секунд игры.
// События спавна идут не чаще минимального интервала; орб засчитывается не раньше
// spawn+travel+hitGrace. Парные орбы случайны (вероятность p по сложности),
// поэтому для них берём матожидание + 5σ — честный игрок не упрётся в потолок.
func dodgeMaxOrbs(sec float64) int {
	events, expPairs, variance := 0.0, 0.0, 0.0
	t := dStartDelay
	for {
		d := dodgeDiff(t)
		travel := lerpf(dTravelA, dTravelB, d)
		if t+travel+dHitGrace > sec+0.1 {
			break
		}
		p := math.Max(0, d-dPairStart) * (dPairMax / (1 - dPairStart))
		events++
		expPairs += p
		variance += p * (1 - p)
		t += math.Max(dMinInt, lerpf(dIntA, dIntB, d)*(1-dJitter))
	}
	return int(math.Ceil(events + expPairs + 5*math.Sqrt(variance) + 2))
}

func validateDodge(m map[string]float64, elapsed float64) error {
	orbs, sec := m["orbs"], m["seconds"]
	// игровое время не может превышать реальное (dt в движке только режется сверху)
	if sec > elapsed+1.0 {
		return errors.New("run is longer than the session")
	}
	if int(orbs) > dodgeMaxOrbs(sec) {
		return errors.New("score is not plausible")
	}
	return nil
}

// ───────────────────────── хелперы ─────────────────────────

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F-]{36}$`)

func pathParam(r *http.Request, name string) string { return Params(r)[name] }

func readJSON(w *Responder, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		w.SendBadRequest("invalid json body")
		return false
	}
	return true
}

func noCache(w *Responder) {
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
}

func validateMetrics(g *GameDef, m map[string]float64) error {
	if len(m) != len(g.Metrics) {
		return errors.New("bad metrics")
	}
	for _, d := range g.Metrics {
		v, ok := m[d.Key]
		if !ok || math.IsNaN(v) || math.IsInf(v, 0) || v < 0 || v > 1e7 {
			return fmt.Errorf("bad metric %q", d.Key)
		}
		switch d.Unit {
		case "count":
			if v != math.Trunc(v) {
				return fmt.Errorf("metric %q must be an integer", d.Key)
			}
		case "seconds":
			m[d.Key] = math.Round(v*100) / 100
		}
	}
	return nil
}

// ───────────────────────── хендлеры ─────────────────────────

// GET /api/games
func (a *api) GetGames(w *Responder, r *http.Request) {
	w.Send(struct{ Games []*GameDef }{Games: gameList})
}

// POST /api/games/:game/sessions   {monster_id}
func (a *api) StartGameSession(w *Responder, r *http.Request) {
	ctx := r.Context()
	claims, _ := Claims(r)

	game := games[pathParam(r, "game")]
	if game == nil {
		w.SendNotFound("unknown game")
		return
	}
	var req struct {
		MonsterId int `json:"monster_id"`
	}
	if !readJSON(w, r, &req) {
		return
	}

	owns, err := a.db.OwnsMonster(ctx, claims.Id, req.MonsterId)
	if err != nil {
		a.DbError(w, err)
		return
	}
	if !owns {
		w.SendForbidden("not your monster")
		return
	}

	n, err := a.db.CountRecentSessions(ctx, claims.Id, time.Now().Add(-time.Minute))
	if err != nil {
		a.DbError(w, err)
		return
	}
	if n >= sessionsPerMinute {
		w.sendError(http.StatusTooManyRequests, "too many sessions, slow down")
		return
	}

	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		w.SendInternalError()
		return
	}
	seed := int32(binary.BigEndian.Uint32(b[:]) & 0x7fffffff)

	id, err := a.db.CreateGameSession(ctx, game.Id, claims.Id, req.MonsterId, seed)
	if err != nil {
		a.DbError(w, err)
		return
	}
	w.SendCreated(struct {
		SessionId string
		Seed      int32
	}{id, seed})
}

// POST /api/games/:game/sessions/:id/finish   {metrics:{...}, moves:[[t,dir],...]}
// Сессия сжигается ПЕРЕД валидацией: одна сессия — одна попытка сдать результат.
func (a *api) FinishGameSession(w *Responder, r *http.Request) {
	ctx := r.Context()
	claims, _ := Claims(r)

	game := games[pathParam(r, "game")]
	if game == nil {
		w.SendNotFound("unknown game")
		return
	}
	sid := pathParam(r, "id")
	if !uuidRe.MatchString(sid) {
		w.SendBadRequest("bad session id")
		return
	}
	var req struct {
		Metrics map[string]float64 `json:"metrics"`
		Moves   json.RawMessage    `json:"moves"`
	}
	if !readJSON(w, r, &req) {
		return
	}

	sess, err := a.db.ClaimGameSession(ctx, sid, claims.Id, game.Id)
	if err != nil {
		a.DbError(w, err)
		return
	}
	if sess == nil {
		w.SendBadRequest("session not found or already finished")
		return
	}
	if sess.Elapsed > sessionTTL.Seconds() {
		w.SendBadRequest("session expired")
		return
	}
	if err := validateMetrics(game, req.Metrics); err != nil {
		w.SendBadRequest(err.Error())
		return
	}
	if err := game.validate(req.Metrics, sess.Elapsed); err != nil {
		w.SendBadRequest(err.Error())
		return
	}

	var moves json.RawMessage
	if len(req.Moves) > 0 && string(req.Moves) != "null" {
		var mv [][2]int
		if json.Unmarshal(req.Moves, &mv) != nil || len(mv) > maxMoves {
			w.SendBadRequest("bad moves")
			return
		}
		moves = req.Moves
	}

	primary := game.Metrics[0]
	prev, had, err := a.db.BestMetric(ctx, game.Id, sess.MonsterId, primary.Key, primary.Desc)
	if err != nil {
		a.DbError(w, err)
		return
	}
	v := req.Metrics[primary.Key]
	record := !had || (primary.Desc && v > prev) || (!primary.Desc && v < prev)

	if err := a.db.InsertGameRun(ctx, sid, game.Id, sess.MonsterId, claims.Id, req.Metrics, moves); err != nil {
		a.DbError(w, err)
		return
	}

	rank, total, _, _, err := a.db.SelectMonsterRank(ctx, game, primary.Key, sess.MonsterId, time.Unix(0, 0).UTC())
	if err != nil {
		a.DbError(w, err)
		return
	}
	w.Send(struct {
		Record bool
		Rank   int
		Total  int
	}{record, rank, total})
}

// GET /api/games/stats?monster_id=   — рекорд и место монстра (all-time) по каждой игре
func (a *api) GetGameStats(w *Responder, r *http.Request) {
	noCache(w)
	ctx := r.Context()
	claims, _ := Claims(r)

	monsterId := ParseInt(r.URL.Query().Get("monster_id"), 0, 0, 1<<30)
	if monsterId == 0 {
		w.SendBadRequest("monster_id is required")
		return
	}
	owns, err := a.db.OwnsMonster(ctx, claims.Id, monsterId)
	if err != nil {
		a.DbError(w, err)
		return
	}
	if !owns {
		w.SendForbidden("not your monster")
		return
	}

	type stat struct {
		Rank    int
		Total   int
		Primary string
		Metrics map[string]float64
	}
	out := map[string]stat{}
	for _, g := range gameList {
		rank, total, metrics, found, err := a.db.SelectMonsterRank(ctx, g, g.Metrics[0].Key, monsterId, time.Unix(0, 0).UTC())
		if err != nil {
			a.DbError(w, err)
			return
		}
		if found {
			out[g.Id] = stat{rank, total, g.Metrics[0].Key, metrics}
		}
	}
	w.Send(struct{ Stats map[string]stat }{out})
}

// В games.go УДАЛИ: функцию periodStart и старый GetLeaderboard — они заменены ниже.

var farFuture = time.Date(3000, 1, 1, 0, 0, 0, 0, time.UTC)

// Границы календарного периода (UTC), содержащего момент at: [start, end).
// "all" → [epoch, farFuture).
func periodBounds(period string, at time.Time) (start, end time.Time, ok bool) {
	at = at.UTC()
	switch period {
	case "week":
		off := (int(at.Weekday()) + 6) % 7 // понедельник = 0
		start = time.Date(at.Year(), at.Month(), at.Day()-off, 0, 0, 0, 0, time.UTC)
		end = start.AddDate(0, 0, 7)
	case "month":
		start = time.Date(at.Year(), at.Month(), 1, 0, 0, 0, 0, time.UTC)
		end = start.AddDate(0, 1, 0)
	case "year":
		start = time.Date(at.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
		end = start.AddDate(1, 0, 0)
	case "all":
		return time.Unix(0, 0).UTC(), farFuture, true
	default:
		return start, end, false
	}
	return start, end, true
}

// GET /api/games/:game/leaderboard?period=&metric=&monster_id=&size=&at=YYYY-MM-DD
// at — любая дата внутри нужного периода; без at — текущий период.
func (a *api) GetLeaderboard(w *Responder, r *http.Request) {
	noCache(w)
	ctx := r.Context()
	claims, _ := Claims(r)

	game := games[pathParam(r, "game")]
	if game == nil {
		w.SendNotFound("unknown game")
		return
	}
	q := r.URL.Query()

	period := q.Get("period")
	if period == "" {
		period = "week"
	}
	metric := q.Get("metric")
	if metric == "" {
		metric = game.Metrics[0].Key
	}
	if game.metric(metric) == nil {
		w.SendBadRequest("unknown metric")
		return
	}

	now := time.Now().UTC()
	at := now
	if s := q.Get("at"); s != "" && period != "all" {
		t, err := time.Parse("2006-01-02", s)
		if err != nil {
			w.SendBadRequest("bad at, expected YYYY-MM-DD")
			return
		}
		if t.After(now) {
			t = now
		}
		at = t
	}
	start, end, ok := periodBounds(period, at)
	if !ok {
		w.SendBadRequest("unknown period")
		return
	}

	monsterId := ParseInt(q.Get("monster_id"), 0, 0, 1<<30)
	win := Window{Full: 20, Head: 5, Neighbors: 3}
	if q.Get("size") == "compact" {
		win = Window{Full: 8, Head: 3, Neighbors: 1}
	}

	res, err := a.db.SelectLeaderboard(ctx, game, metric, start, end, monsterId, claims.Id, win)
	if err != nil {
		a.DbError(w, err)
		return
	}
	if res.Rows == nil {
		res.Rows = []LBRow{}
	}

	hasPrev := false
	var endPtr *time.Time
	current := true
	if period != "all" {
		if hasPrev, err = a.db.HasRunsBefore(ctx, game.Id, start); err != nil {
			a.DbError(w, err)
			return
		}
		endPtr = &end
		current = end.After(now)
	}

	w.Send(struct {
		Game    string
		Period  string
		Metric  string
		Start   time.Time
		End     *time.Time // nil для "all"
		Current bool       // период ещё идёт
		HasPrev bool
		Total   int
		MyRank  int
		Rows    []LBRow
	}{game.Id, period, metric, start, endPtr, current, hasPrev, res.Total, res.MyRank, res.Rows})
}

// GET /api/games/:game/history?period=week|month|year&metric=&year=2024
// Чемпион каждого периода. Для period=year параметр year игнорируется (отдаются все годы).
func (a *api) GetLeaderboardHistory(w *Responder, r *http.Request) {
	noCache(w)
	ctx := r.Context()

	game := games[pathParam(r, "game")]
	if game == nil {
		w.SendNotFound("unknown game")
		return
	}
	q := r.URL.Query()

	period := q.Get("period")
	if period != "week" && period != "month" && period != "year" {
		w.SendBadRequest("period must be week, month or year")
		return
	}
	metric := q.Get("metric")
	if metric == "" {
		metric = game.Metrics[0].Key
	}
	if game.metric(metric) == nil {
		w.SendBadRequest("unknown metric")
		return
	}

	years, err := a.db.RunYears(ctx, game.Id)
	if err != nil {
		a.DbError(w, err)
		return
	}
	year := ParseInt(q.Get("year"), 0, 0, 3000)
	if year == 0 && len(years) > 0 {
		year = years[0]
	}

	from, to := time.Unix(0, 0).UTC(), farFuture
	if period != "year" {
		if year == 0 { // забегов нет вообще
			w.Send(struct {
				Game, Period, Metric string
				Year                 int
				Years                []int
				Entries              []HistoryEntry
			}{game.Id, period, metric, 0, years, []HistoryEntry{}})
			return
		}
		from = time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
		to = time.Date(year+1, 1, 1, 0, 0, 0, 0, time.UTC)
	}

	entries, err := a.db.SelectPeriodChampions(ctx, game, metric, period, from, to)
	if err != nil {
		a.DbError(w, err)
		return
	}
	w.Send(struct {
		Game, Period, Metric string
		Year                 int
		Years                []int
		Entries              []HistoryEntry
	}{game.Id, period, metric, year, years, entries})
}
