export type SignalType =
  | "newsIntel"
  | "publicInterest"
  | "civilAviation"
  | "militaryTankers"
  | "markets"
  | "pizza"
  | "weather"
  | "custom";

export interface SignalEnvelope {
  id: string;
  source: string;
  signalType: SignalType;
  confidence: number; // 0-1 likelihood that this signal is relevant
  intensity: number; // 0-1 normalized strength
  timestamp: number;
  geo?: { lat: number; lon: number; label?: string };
  summary: string;
  rawRef?: unknown;
}

export interface ScoreBreakdown {
  overall: number; // 0-1 risk
  components: Record<SignalType, number>;
  unavailable: SignalType[]; // Signal types that are unavailable (not included in score)
  rules: Array<{ id: string; label: string; impact: number }>;
  updatedAt: number;
}

export interface TrendPoint {
  timestamp: number;
  score: number;
}

export interface AlertConfig {
  id: string;
  name: string;
  threshold: number;
  channels: Array<"email" | "webhook">;
  webhookUrl?: string;
  email?: string;
}

export interface AlertEvent {
  alertId: string;
  triggeredAt: number;
  score: number;
  breakdown: ScoreBreakdown;
}
