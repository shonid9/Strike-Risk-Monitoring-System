import { BaseConnector } from "./base";
import { SignalEnvelope } from "../../shared/types";

export class CustomConnector extends BaseConnector {
  constructor() {
    super({ name: "custom-feed", signalType: "custom" });
  }

  async fetchSignals(): Promise<SignalEnvelope[]> {
    // Placeholder: hook for internal/private signals.
    return [
      this.makeEnvelope({
        source: this.config.name,
        confidence: 0.5,
        intensity: 0.1,
        timestamp: Date.now(),
        summary: "No custom signals connected yet",
      }),
    ];
  }
}
