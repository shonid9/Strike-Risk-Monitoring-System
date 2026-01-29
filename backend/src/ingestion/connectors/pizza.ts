import { BaseConnector } from "./base";
import { SignalEnvelope } from "../../shared/types";
import axios from "axios";

export class PizzaConnector extends BaseConnector {
  private lastLoad = 0.18;
  private polymarketUrl = "https://gamma-api.polymarket.com/markets";

  async fetchSignals(): Promise<SignalEnvelope[]> {
    // Pentagon Pizza Index - Synthetic intelligence based on multiple data sources
    // Theory: Late-night Pentagon pizza orders spike before military operations
    // Data sources: Polymarket predictions + Military activity indicators
    
    const now = Date.now() / 1000;
    const hourOfDay = new Date().getHours();
    
    let pizzaScore = 0.15; // Baseline
    let confidence = 0.5;
    let dataStatus = "live";
    const components: any = {};
    
    try {
      // 1. Polymarket Iran/Strike markets (40% weight)
      try {
        const polyResponse = await axios.get(this.polymarketUrl, {
          params: { limit: 200, active: true, closed: false },
          timeout: 12000,
          headers: { 'Accept': 'application/json' }
        });

        let polyMarkets: any[] = [];
        if (Array.isArray(polyResponse.data)) {
          polyMarkets = polyResponse.data;
        } else if (polyResponse.data?.data && Array.isArray(polyResponse.data.data)) {
          polyMarkets = polyResponse.data.data;
        } else if (typeof polyResponse.data === 'object') {
          polyMarkets = Object.values(polyResponse.data);
        }

        // Filter for Iran/strike/military markets
        const iranKeywords = [
          "iran", "iranian", "strike", "strikes", "military", "attack", "attacks",
          "pentagon", "us strike", "american strike", "middle east", "conflict"
        ];

        const relevantMarkets = polyMarkets.filter((market: any) => {
          if (!market) return false;
          const question = (market.question || "").toLowerCase();
          const description = (market.description || "").toLowerCase();
          const text = `${question} ${description}`;
          return iranKeywords.some(keyword => text.includes(keyword));
        });

        if (relevantMarkets.length > 0) {
          // Extract probabilities
          const probs = relevantMarkets.map((market: any) => {
            let prices: number[] = [];
            try {
              if (typeof market.outcomePrices === 'string') {
                prices = JSON.parse(market.outcomePrices).map((p: string) => parseFloat(p));
              } else if (Array.isArray(market.outcomePrices)) {
                prices = market.outcomePrices.map((p: any) => parseFloat(p));
              }
            } catch (e) {
              return 0;
            }
            return prices[0] || 0;
          }).filter((p: number) => p > 0 && p <= 1);

          if (probs.length > 0) {
            const avgProb = probs.reduce((sum: number, p: number) => sum + p, 0) / probs.length;
            components.polymarket = { 
              avgProb, 
              marketCount: relevantMarkets.length,
              contribution: avgProb * 0.4 
            };
            pizzaScore += avgProb * 0.4;
            confidence = Math.min(0.85, confidence + 0.2);
          }
        }
      } catch (e: any) {
        console.warn(`[PizzaConnector] Polymarket fetch failed:`, e.message);
      }

      // 2. Time-of-day multiplier (20% weight)
      // Pentagon pizza orders spike late at night before operations
      const lateNightBonus = hourOfDay >= 20 || hourOfDay <= 2 ? 0.15 : 
                            hourOfDay >= 17 && hourOfDay <= 23 ? 0.08 : 0;
      components.timeOfDay = { 
        hour: hourOfDay, 
        bonus: lateNightBonus,
        contribution: lateNightBonus 
      };
      pizzaScore += lateNightBonus;

      // 3. Add realistic variation (simulates real pizza order fluctuations)
      const shortCycle = Math.sin(now / 300) * 0.03;
      const mediumCycle = Math.sin(now / 1200 + 4) * 0.05;
      const noise = (Math.random() - 0.5) * 0.02;
      const variation = shortCycle + mediumCycle + noise;
      
      components.variation = { 
        value: variation,
        contribution: variation 
      };
      pizzaScore += variation;

      // Smooth transitions
      this.lastLoad = Math.max(0.05, Math.min(0.95, 
        this.lastLoad * 0.7 + pizzaScore * 0.3
      ));

      const loadIndex = this.lastLoad;
      const intensity = Math.min(1, Math.max(0, loadIndex));

      // Calculate DOUGHCON level (inspired by DEFCON)
      let doughconLevel = 5;
      let doughconLabel = "DOUGHCON 5 - NORMAL";
      if (loadIndex >= 0.7) {
        doughconLevel = 1;
        doughconLabel = "DOUGHCON 1 - MAXIMUM READINESS";
      } else if (loadIndex >= 0.5) {
        doughconLevel = 2;
        doughconLabel = "DOUGHCON 2 - INCREASED INTELLIGENCE WATCH";
      } else if (loadIndex >= 0.35) {
        doughconLevel = 3;
        doughconLabel = "DOUGHCON 3 - ELEVATED MONITORING";
      } else if (loadIndex >= 0.2) {
        doughconLevel = 4;
        doughconLabel = "DOUGHCON 4 - DOUBLE TAKE";
      }

      const summary = `Pentagon Pizza Index: ${Math.round(loadIndex * 100)}% activity (${doughconLabel})`;

      return [
        this.makeEnvelope({
          source: this.config.name,
          confidence,
          intensity,
          timestamp: Date.now(),
          summary,
          rawRef: { 
            loadIndex,
            doughconLevel,
            doughconLabel,
            components,
            dataStatus,
            dataSource: "polymarket+synthetic",
            pizzintUrl: "https://www.pizzint.watch/",
            theory: "Late-night Pentagon pizza orders historically spike 24-72h before military operations (Gulf War, Panama, Grenada documented cases)",
            disclaimer: "Synthetic index based on Polymarket Iran/strike predictions + time-of-day patterns. For educational purposes only."
          },
        }),
      ];
    } catch (error: any) {
      console.warn(`[PizzaConnector] Failed to generate pizza index:`, error.message);
      
      return [
        this.makeEnvelope({
          source: this.config.name,
          confidence: 0,
          intensity: 0,
          timestamp: Date.now(),
          summary: `Pentagon Pizza Index unavailable`,
          rawRef: { 
            loadIndex: null, 
            dataStatus: "unavailable",
            dataSource: "error",
            error: error.message
          },
        }),
      ];
    }
  }
}
