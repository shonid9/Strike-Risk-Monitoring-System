import { ScoreBreakdown, SignalEnvelope, SignalType } from "../shared/types";

const weights: Record<SignalType, number> = {
  newsIntel: 0.3,
  publicInterest: 0.2,
  civilAviation: 0.15,
  militaryTankers: 0.1,
  markets: 0.1,
  pizza: 0.1,
  weather: 0.05,
  custom: 0,
};

const ruleOverrides = [
  {
    id: "news-imminent-tone",
    label: "Imminent language in majors",
    match: (s: SignalEnvelope) => s.signalType === "newsIntel" && (s.rawRef as any)?.imminentTone >= 0.5,
    impact: 0.08,
  },
  {
    id: "wiki-spike",
    label: "Wikipedia spike >50%",
    match: (s: SignalEnvelope) => s.signalType === "publicInterest" && (s.rawRef as any)?.wikiSpike >= 0.5,
    impact: 0.05,
  },
  {
    id: "sky-empty",
    label: "Civil sky near empty",
    match: (s: SignalEnvelope) => s.signalType === "civilAviation" && (s.rawRef as any)?.dropRatio >= 0.6,
    impact: 0.08,
  },
  {
    id: "tanker-surge",
    label: "Tanker surge detected",
    match: (s: SignalEnvelope) => s.signalType === "militaryTankers" && (s.rawRef as any)?.tankerCount >= 3,
    impact: 0.1,
  },
  {
    id: "pizza-late-night",
    label: "Pentagon pizza surge",
    match: (s: SignalEnvelope) => s.signalType === "pizza" && (s.rawRef as any)?.loadIndex >= 0.3,
    impact: 0.04,
  },
];

function normalize(signal: SignalEnvelope) {
  // Use intensity as primary signal, confidence as reliability modifier
  // Apply consistent normalization based on actual data - no assumptions about baseline values
  const intensity = signal.intensity;
  // Normalize based on confidence: higher confidence = less reduction
  return Math.max(0, Math.min(1, intensity * (0.5 + signal.confidence * 0.5)));
}

export function scoreSignals(signals: SignalEnvelope[]): ScoreBreakdown {
  const usableSignals = signals.filter(
    (s) => (s.rawRef as any)?.dataStatus !== "unavailable"
  );
  const unavailableSignals = signals.filter(
    (s) => (s.rawRef as any)?.dataStatus === "unavailable"
  );
  
  // Track which signal types are unavailable
  const unavailableTypes = new Set<SignalType>(
    unavailableSignals.map(s => s.signalType)
  );
  
  const components: Record<SignalType, number> = {
    newsIntel: 0,
    publicInterest: 0,
    civilAviation: 0,
    militaryTankers: 0,
    markets: 0,
    pizza: 0,
    weather: 0,
    custom: 0,
  };

  usableSignals.forEach((s) => {
    components[s.signalType] += normalize(s);
  });

  // Average per channel (store unweighted for display)
  (Object.keys(components) as SignalType[]).forEach((key) => {
    const channelSignals = usableSignals.filter((s) => s.signalType === key);
    if (channelSignals.length > 0) {
      // Store unweighted normalized value (0-1) for display
      components[key] = components[key] / channelSignals.length;
    } else if (unavailableTypes.has(key)) {
      // Keep as 0 but mark as unavailable - frontend should display "N/A"
      components[key] = 0;
    }
    // If no signals at all (neither usable nor unavailable), keep 0
  });

  // Calculate weighted sum for overall score
  // Only include weights for signal types that have active signals
  const activeSignalTypes = new Set(usableSignals.map(s => s.signalType));
  const activeWeights = (Object.keys(weights) as SignalType[])
    .filter(key => activeSignalTypes.has(key) || key === "custom")
    .reduce((sum, key) => sum + weights[key], 0);
  
  const weightedSum = (Object.keys(components) as SignalType[]).reduce((sum, key) => {
    return sum + (components[key] * weights[key]);
  }, 0);
  
  // Divide by sum of active weights, or total weights if no active signals (shouldn't happen)
  let baseScore = activeWeights > 0 ? weightedSum / activeWeights : 0;

  const appliedRules: ScoreBreakdown["rules"] = [];
  ruleOverrides.forEach((rule) => {
    const hit = signals.some((s) => rule.match(s));
    if (hit) {
      baseScore = Math.min(1, baseScore + rule.impact);
      appliedRules.push({ id: rule.id, label: rule.label, impact: rule.impact });
    }
  });

  return {
    overall: Math.max(0, Math.min(1, baseScore)),
    components,
    unavailable: Array.from(unavailableTypes),
    rules: appliedRules,
    updatedAt: Date.now(),
  };
}
