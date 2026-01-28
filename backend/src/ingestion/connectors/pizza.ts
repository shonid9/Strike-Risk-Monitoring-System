import { BaseConnector } from "./base";
import { SignalEnvelope } from "../../shared/types";

export class PizzaConnector extends BaseConnector {
  private lastLoad = 0.18;

  async fetchSignals(): Promise<SignalEnvelope[]> {
    // Pizza delivery patterns with realistic variation
    const now = Date.now() / 1000;
    const hourOfDay = new Date().getHours();
    
    // Higher activity during evening/night (17:00-23:00)
    const timeMultiplier = hourOfDay >= 17 && hourOfDay <= 23 ? 1.3 : 0.8;
    
    const shortCycle = Math.sin(now / 300) * 0.08; // 5 min
    const mediumCycle = Math.sin(now / 1200 + 4) * 0.12; // 20 min
    const noise = (Math.random() - 0.5) * 0.05;
    
    const variation = (shortCycle + mediumCycle + noise) * timeMultiplier;
    
    // Smooth transitions
    this.lastLoad = Math.max(0.05, Math.min(0.45, 
      this.lastLoad * 0.6 + (0.18 + variation) * 0.4
    ));
    
    const loadIndex = this.lastLoad;
    const confidence = 0;
    const intensity = 0;
    
    return [
      this.makeEnvelope({
        source: this.config.name,
        confidence,
        intensity,
        timestamp: Date.now(),
        summary: `Pizza meter unavailable (simulated signal disabled)`,
        rawRef: { loadIndex, dataStatus: "unavailable", dataSource: "simulated" },
      }),
    ];
  }
}
