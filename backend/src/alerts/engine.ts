import { AlertConfig, AlertEvent, ScoreBreakdown } from "../shared/types";

type AlertHandler = (event: AlertEvent) => Promise<void>;

const configs: AlertConfig[] = [
  {
    id: "default-high",
    name: "High risk > 0.7",
    threshold: 0.7,
    channels: ["webhook"],
    webhookUrl: "https://example.com/webhook",
  },
];

const handlers: AlertHandler[] = [
  async (event) => {
    // Placeholder: send webhook/email; here we log.
    console.log("[alert] would dispatch", event);
  },
];

export function evaluateAlerts(score: ScoreBreakdown) {
  const triggered = configs.filter((cfg) => score.overall >= cfg.threshold);
  triggered.forEach((cfg) => {
    const event: AlertEvent = {
      alertId: cfg.id,
      triggeredAt: Date.now(),
      score: score.overall,
      breakdown: score,
    };
    handlers.forEach((h) => h(event));
  });
}
