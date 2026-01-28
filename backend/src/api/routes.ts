import express from "express";
import rateLimit from "express-rate-limit";
import axios from "axios";
import { collectSignals } from "../ingestion/index";
import { scoreSignals } from "../scoring/model";
import { ScoreBreakdown, SignalEnvelope } from "../shared/types";
import { evaluateAlerts } from "../alerts/engine";
import { analyzeAllIndicators } from "../analysis/analyzer";

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
});

router.use(limiter);

let latestSignals: SignalEnvelope[] = [];
let latestScore: ScoreBreakdown | null = null;
let latestAircraft: Array<{
  source: "opensky" | "adsb.lol";
  category: "tanker" | "aircraft";
  classification: "verified_military" | "unknown";
  icao24?: string;
  callsign?: string;
  originCountry?: string;
  aircraftCategory?: number | null;
  lat: number;
  lon: number;
  altitudeM?: number | null;
  velocityMs?: number | null;
  headingDeg?: number | null;
  onGround?: boolean | null;
  lastContact?: number | null;
  raw?: Record<string, unknown>;
}> = [];
let latestAircraftUpdatedAt: number | null = null;
let latestAircraftScope: "regional" | "global" = "regional";
let openSkyToken: string | null = null;
let openSkyTokenExpiresAt: number | null = null;

async function refresh() {
  latestSignals = await collectSignals();
  latestScore = scoreSignals(latestSignals);
  if (latestScore) {
    evaluateAlerts(latestScore);
  }
}

async function refreshAircraft(scope: "regional" | "global" = "regional") {
  const OPENSKY_URL = "https://opensky-network.org/api/states/all";
  const OPENSKY_BBOX =
    scope === "global"
      ? null
      : {
          lamin: 12, // Middle East / Iran region
          lomin: 20,
          lamax: 45,
          lomax: 70,
        };

  const openskyAuth =
    process.env.OPENSKY_USERNAME && process.env.OPENSKY_PASSWORD
      ? { username: process.env.OPENSKY_USERNAME, password: process.env.OPENSKY_PASSWORD }
      : undefined;

  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

  const getOpenSkyToken = async () => {
    if (!clientId || !clientSecret) return null;
    const now = Date.now();
    if (openSkyToken && openSkyTokenExpiresAt && now < openSkyTokenExpiresAt - 60_000) {
      return openSkyToken;
    }
    try {
      const tokenUrl =
        "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
      const body = new URLSearchParams();
      body.set("grant_type", "client_credentials");
      body.set("client_id", clientId);
      body.set("client_secret", clientSecret);

      const tokenRes = await axios.post(tokenUrl, body.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 12000,
      });
      const accessToken = tokenRes.data?.access_token;
      const expiresIn = tokenRes.data?.expires_in;
      if (accessToken) {
        openSkyToken = accessToken;
        openSkyTokenExpiresAt = Date.now() + (typeof expiresIn === "number" ? expiresIn * 1000 : 25 * 60 * 1000);
        return accessToken;
      }
    } catch (error: any) {
      console.warn(`[aircraft] OpenSky token fetch failed:`, error?.message || error);
    }
    return null;
  };

  const aircraft: typeof latestAircraft = [];

  try {
    const token = await getOpenSkyToken();
    const response = await axios.get(OPENSKY_URL, {
      params: { ...(OPENSKY_BBOX || {}), extended: 1 },
      timeout: 12000,
      auth: token ? undefined : openskyAuth,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const states: any[] = Array.isArray(response.data?.states) ? response.data.states : [];
    states.forEach((state) => {
      if (!Array.isArray(state)) return;
      const [
        icao24,
        callsign,
        originCountry,
        timePosition,
        lastContact,
        longitude,
        latitude,
        baroAltitude,
        onGround,
        velocity,
        trueTrack,
        _verticalRate,
        _sensors,
        _geoAltitude,
        _squawk,
        _spi,
        _positionSource,
        category,
      ] = state;

      if (typeof latitude !== "number" || typeof longitude !== "number") return;

      const normalizedCallsign = typeof callsign === "string" ? callsign.trim() : undefined;

      aircraft.push({
        source: "opensky",
        category: "aircraft",
        classification: "unknown",
        icao24,
        callsign: normalizedCallsign,
        originCountry,
        aircraftCategory: typeof category === "number" ? category : null,
        lat: latitude,
        lon: longitude,
        altitudeM: typeof baroAltitude === "number" ? baroAltitude : null,
        velocityMs: typeof velocity === "number" ? velocity : null,
        headingDeg: typeof trueTrack === "number" ? trueTrack : null,
        onGround: typeof onGround === "boolean" ? onGround : null,
        lastContact: typeof lastContact === "number" ? lastContact : null,
        raw: { timePosition },
      });
    });
  } catch (error: any) {
    console.warn(`[aircraft] OpenSky fetch failed:`, error?.message || error);
  }

  // Add tanker positions from ADS-B (if available in latest signals)
  const tankerSignal = latestSignals.find((s) => s.signalType === "militaryTankers");
  const tankerLocations = (tankerSignal?.rawRef as any)?.locations || [];
  tankerLocations.forEach((loc: any) => {
    if (typeof loc.lat !== "number" || typeof loc.lon !== "number") return;
    aircraft.push({
      source: "adsb.lol",
      category: "tanker",
      classification: "verified_military",
      icao24: loc.hex,
      callsign: loc.flight,
      originCountry: undefined,
      aircraftCategory: null,
      lat: loc.lat,
      lon: loc.lon,
      altitudeM: typeof loc.alt === "number" ? loc.alt : null,
      velocityMs: null,
      headingDeg: null,
      onGround: null,
      lastContact: null,
      raw: { type: loc.type },
    });
  });

  latestAircraft = aircraft;
  latestAircraftUpdatedAt = Date.now();
  latestAircraftScope = scope;
}

// Initial refresh on boot - wrapped in IIFE to avoid top-level await issues
(async () => {
  await refresh();
  await refreshAircraft();
})();

// Auto-refresh every 60 seconds to simulate live data
setInterval(async () => {
  await refresh();
  await refreshAircraft();
  console.log(`[refresh] Updated at ${new Date().toISOString()}, score: ${latestScore?.overall.toFixed(2)}`);
}, 60000);

router.get("/health", (_req, res) => {
  res.json({ status: "ok", updatedAt: latestScore?.updatedAt ?? Date.now() });
});

router.get("/status", async (_req, res) => {
  // Check if signals contain simulated data
  const isSimulated = latestSignals.some(s => 
    s.summary?.includes("(simulated)") || 
    s.summary?.includes("simulation")
  );
  
  // Check API connectivity
  const hasRealData = latestSignals.some(s => 
    !s.summary?.includes("(simulated)") && 
    !s.summary?.includes("simulation") &&
    !s.summary?.includes("API failed")
  );
  
  res.json({ 
    isSimulated,
    hasRealData,
    signalCount: latestSignals.length,
    lastUpdate: latestScore?.updatedAt ?? Date.now()
  });
});

router.get("/score", async (_req, res) => {
  if (!latestScore) await refresh();
  res.json(latestScore);
});

router.get("/signals", async (_req, res) => {
  if (!latestSignals.length) await refresh();
  res.json(latestSignals);
});

router.get("/trend", async (_req, res) => {
  if (!latestScore) await refresh();
  const base = latestScore?.overall ?? 0.2;
  const now = Date.now();
  const trend = Array.from({ length: 9 }).map((_, idx) => ({
    timestamp: now + idx * 60 * 60 * 1000,
    score: Math.max(0, Math.min(1, base + (idx - 4) * 0.02)),
  }));
  res.json(trend);
});

router.get("/analysis", async (_req, res) => {
  if (!latestScore || !latestSignals.length) await refresh();
  const analyses = analyzeAllIndicators(latestScore!, latestSignals);
  res.json(analyses);
});

router.get("/aircraft", async (req, res) => {
  const scopeParam = req.query.scope === "global" ? "global" : "regional";
  const scope = scopeParam as "global" | "regional";
  const stale = !latestAircraftUpdatedAt || Date.now() - latestAircraftUpdatedAt > 55_000;
  if (stale || latestAircraftScope !== scope) {
    await refreshAircraft(scope);
  }
  res.json({
    updatedAt: latestAircraftUpdatedAt ?? Date.now(),
    scope: latestAircraftScope,
    aircraft: latestAircraft,
  });
});

router.get("/events/sse", async (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const push = async () => {
    await refresh();
    res.write(`data: ${JSON.stringify({ score: latestScore, signals: latestSignals })}\n\n`);
  };

  const interval = setInterval(push, 15000);
  push();
  _req.on("close", () => {
    clearInterval(interval);
  });
});

export default router;
