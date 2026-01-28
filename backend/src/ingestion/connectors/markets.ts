import { BaseConnector } from "./base";
import { SignalEnvelope } from "../../shared/types";
import axios from "axios";

export class MarketsConnector extends BaseConnector {
  private lastProb = 0.09;
  private polymarketUrl = "https://gamma-api.polymarket.com/markets";
  private predictitUrl = "https://www.predictit.org/api/marketdata/all/";

  async fetchSignals(): Promise<SignalEnvelope[]> {
    // Try to fetch real market data from both Polymarket and PredictIt
    const allMarketDetails: any[] = [];
    // Expanded keywords to catch more relevant markets
    const iranKeywords = [
      "iran", "iranian", "tehran", "persian", "persian gulf",
      "strike", "strikes", "striking", "struck",
      "attack", "attacks", "attacking", "attacked",
      "military", "militar", "war", "warfare", "conflict",
      "nuclear", "nuke", "missile", "missiles",
      "us strike", "american strike", "biden", "trump",
      "middle east", "mideast", "gulf", "israel", "israeli"
    ];

    // Fetch from Polymarket
    try {
      // Try to get markets - check both active and all markets
      let polyMarkets: any[] = [];
      
      // First try active markets
      try {
        const activeResponse = await axios.get(this.polymarketUrl, {
          params: {
            limit: 200, // Increased limit to get more markets
            active: true,
            closed: false
          },
          timeout: 15000,
          headers: {
            'Accept': 'application/json'
          }
        });
        
        // Handle different response formats
        if (Array.isArray(activeResponse.data)) {
          polyMarkets = activeResponse.data;
        } else if (activeResponse.data?.data && Array.isArray(activeResponse.data.data)) {
          polyMarkets = activeResponse.data.data;
        } else if (typeof activeResponse.data === 'object') {
          polyMarkets = Object.values(activeResponse.data);
        }
        
        console.log(`[MarketsConnector] Fetched ${polyMarkets.length} active markets from Polymarket`);
      } catch (e: any) {
        console.warn(`[MarketsConnector] Failed to fetch active markets:`, e.message);
      }
      
      // Also try all markets (including closed) if we got few results
      if (polyMarkets.length < 20) {
        try {
          const allResponse = await axios.get(this.polymarketUrl, {
            params: {
              limit: 200
            },
            timeout: 15000,
            headers: {
              'Accept': 'application/json'
            }
          });
          
          let allMarkets: any[] = [];
          if (Array.isArray(allResponse.data)) {
            allMarkets = allResponse.data;
          } else if (allResponse.data?.data && Array.isArray(allResponse.data.data)) {
            allMarkets = allResponse.data.data;
          } else if (typeof allResponse.data === 'object') {
            allMarkets = Object.values(allResponse.data);
          }
          
          // Merge, avoiding duplicates by ID
          const existingIds = new Set(polyMarkets.map((m: any) => m.id || m.slug));
          const newMarkets = allMarkets.filter((m: any) => m && !existingIds.has(m.id || m.slug));
          polyMarkets = [...polyMarkets, ...newMarkets];
          
          console.log(`[MarketsConnector] Added ${newMarkets.length} more markets (total: ${polyMarkets.length})`);
        } catch (e: any) {
          console.warn(`[MarketsConnector] Failed to fetch all markets:`, e.message);
        }
      }

      // Final check - ensure we have an array
      if (!Array.isArray(polyMarkets)) {
        polyMarkets = [];
      }
      
      console.log(`[MarketsConnector] Processing ${polyMarkets.length} total markets from Polymarket`);

      // Enhanced filtering - check question, description, and category
      const polyRelevant = polyMarkets.filter((market: any) => {
        if (!market) return false;
        
        // Build comprehensive text to search
        const question = (market.question || "").toLowerCase();
        const description = (market.description || "").toLowerCase();
        const category = (market.category || "").toLowerCase();
        const text = `${question} ${description} ${category}`;
        
        // Check if any keyword matches
        const hasKeyword = iranKeywords.some(keyword => text.includes(keyword));
        
        // Also check if it's a geopolitical/military category
        const isRelevantCategory = category.includes("politics") || 
                                   category.includes("geopolitics") ||
                                   category.includes("military") ||
                                   category.includes("war");
        
        return hasKeyword || (isRelevantCategory && (question.includes("strike") || question.includes("attack")));
      });

      polyRelevant.forEach((market: any) => {
        let prices: number[] = [];
        try {
          // Try multiple ways to parse prices
          if (typeof market.outcomePrices === 'string') {
            try {
              prices = JSON.parse(market.outcomePrices).map((p: string) => parseFloat(p));
            } catch (e) {
              // Try splitting by comma if JSON parse fails
              prices = market.outcomePrices.split(',').map((p: string) => parseFloat(p.trim()));
            }
          } else if (Array.isArray(market.outcomePrices)) {
            prices = market.outcomePrices.map((p: any) => parseFloat(p));
          }
        } catch (e) {
          // Skip if can't parse prices
          return;
        }

        // Get probability - use first outcome price (usually "Yes" outcome)
        // For binary markets, first price is usually "Yes"
        let yesProb = prices[0] || 0;
        
        // Fallback: try lastTradePrice or bestBuyYesCost
        if (yesProb === 0 || isNaN(yesProb)) {
          if (market.lastTradePrice) {
            yesProb = parseFloat(market.lastTradePrice);
          } else if (market.bestBuyYesCost) {
            yesProb = parseFloat(market.bestBuyYesCost);
          } else if (prices.length > 0 && prices[0] > 0) {
            yesProb = prices[0];
          }
        }
        
        // Get volume - try multiple fields
        const volume = market.volumeNum || 
                      market.volume24hr || 
                      market.volume || 
                      market.volume1wk ||
                      market.volume1mo ||
                      0;
        
        // Include markets even with low volume if they have valid probability
        // Closed markets can still provide signal if they had recent activity
        if (yesProb > 0 && !isNaN(yesProb) && yesProb <= 1) {
          allMarketDetails.push({
            source: "Polymarket",
            question: market.question || market.slug || "Unknown",
            prob: Math.max(0, Math.min(1, yesProb)), // Ensure 0-1 range
            volume: Math.max(0, volume),
            closed: market.closed || false,
            category: market.category || ""
          });
        }
      });
      
      console.log(`[MarketsConnector] Found ${polyRelevant.length} relevant markets out of ${polyMarkets.length} total (${allMarketDetails.length} with valid prices)`);
    } catch (error: any) {
      console.warn(`[MarketsConnector] Polymarket API failed:`, error.message);
    }

    // Fetch from PredictIt
    try {
      const predictitResponse = await axios.get(this.predictitUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      // PredictIt API returns an array of contracts (not markets)
      // Each contract has market info and contract-specific data
      let predictitContracts: any[] = [];
      
      if (Array.isArray(predictitResponse.data)) {
        predictitContracts = predictitResponse.data;
      } else if (predictitResponse.data?.markets && Array.isArray(predictitResponse.data.markets)) {
        predictitContracts = predictitResponse.data.markets;
      } else if (typeof predictitResponse.data === 'object') {
        predictitContracts = Object.values(predictitResponse.data);
      }
      
      console.log(`[MarketsConnector] Fetched ${predictitContracts.length} contracts from PredictIt`);
      
      // Filter for Iran-related contracts - enhanced search
      const predictitRelevant = predictitContracts.filter((contract: any) => {
        if (!contract) return false;
        
        // Build comprehensive text to search
        const name = (contract.name || "").toLowerCase();
        const shortName = (contract.shortName || "").toLowerCase();
        const contractName = (contract.contract_name || "").toLowerCase();
        const contractShortName = (contract.contract_shortName || "").toLowerCase();
        const marketName = (contract.market_name || "").toLowerCase();
        const text = `${name} ${shortName} ${contractName} ${contractShortName} ${marketName}`;
        
        return iranKeywords.some(keyword => text.includes(keyword));
      });
      
      console.log(`[MarketsConnector] Found ${predictitRelevant.length} relevant contracts from PredictIt`);

      // Group by market ID and find "Yes" contracts
      const marketGroups = new Map<string | number, any[]>();
      predictitRelevant.forEach((contract: any) => {
        // Use market ID or market name as key
        const marketId = contract.marketId || contract.id || contract.market_name || "unknown";
        if (!marketGroups.has(marketId)) {
          marketGroups.set(marketId, []);
        }
        marketGroups.get(marketId)!.push(contract);
      });

      marketGroups.forEach((contracts, marketId) => {
        // Find the "Yes" contract (usually the one with higher probability or specific naming)
        const yesContract = contracts.find((c: any) => {
          const name = (c.contract_name || c.name || "").toLowerCase();
          const shortName = (c.contract_shortName || c.shortName || "").toLowerCase();
          return name.includes("yes") || 
                 shortName.includes("yes") ||
                 (c.lastTradePrice || 0) > 0.5;
        }) || contracts[0]; // Fallback to first contract

        if (yesContract) {
          // Get probability from multiple possible fields
          let prob = 0;
          if (yesContract.lastTradePrice) {
            prob = parseFloat(yesContract.lastTradePrice);
          } else if (yesContract.bestBuyYesCost) {
            prob = parseFloat(yesContract.bestBuyYesCost);
          } else if (yesContract.bestSellYesCost) {
            prob = 1 - parseFloat(yesContract.bestSellYesCost); // Inverse of sell price
          }
          
          // PredictIt doesn't provide volume directly, use a proxy based on market activity
          // Use lastTradePrice and openInterest as proxy for liquidity/activity
          const openInterest = yesContract.openInterest || 0;
          const volume = prob > 0 ? Math.max(50, prob * 200 + openInterest * 0.1) : 0;
          
          if (prob > 0 && !isNaN(prob) && prob <= 1) {
            allMarketDetails.push({
              source: "PredictIt",
              question: yesContract.name || 
                       yesContract.contract_name || 
                       yesContract.market_name || 
                       "Unknown",
              prob: Math.max(0, Math.min(1, prob)), // Ensure 0-1 range
              volume: Math.max(0, volume),
              closed: false // PredictIt doesn't clearly mark closed markets
            });
          }
        }
      });
      
      console.log(`[MarketsConnector] Processed ${marketGroups.size} markets from PredictIt, added ${allMarketDetails.filter(m => m.source === "PredictIt").length} contracts`);
    } catch (error: any) {
      // PredictIt may have rate limiting, continue with Polymarket data only
      if (error.response?.status === 429) {
        console.warn(`[MarketsConnector] PredictIt rate limited (429), using Polymarket only`);
      } else {
        console.warn(`[MarketsConnector] PredictIt API failed:`, error.message);
      }
    }

    // If we have market data from either source, use it
    if (allMarketDetails.length > 0) {
      // Calculate weighted average probability
      let totalProb = 0;
      let totalVolume = 0;
      let totalWeight = 0;

      allMarketDetails.forEach((market) => {
        // Weight by volume, but give minimum weight to ensure all markets count
        const weight = Math.max(market.volume, 10); // Minimum weight of 10
        totalProb += market.prob * weight;
        totalVolume += market.volume;
        totalWeight += weight;
      });

      // Calculate weighted average
      const impliedProb = totalWeight > 0 ? totalProb / totalWeight : 
                         allMarketDetails.length > 0 ? 
                         allMarketDetails.reduce((sum, m) => sum + m.prob, 0) / allMarketDetails.length : 
                         0.09;
      
      // Update last probability for smoothing
      this.lastProb = impliedProb;

      const polyCount = allMarketDetails.filter(m => m.source === "Polymarket").length;
      const predictitCount = allMarketDetails.filter(m => m.source === "PredictIt").length;
      
      // Higher confidence with more markets and volume
      const confidence = Math.min(0.95, 
        0.3 + 
        (allMarketDetails.length / 5) * 0.2 + // More markets = higher confidence
        (totalVolume > 1000 ? 0.25 : totalVolume > 100 ? 0.15 : 0.1) + // Volume matters
        (polyCount > 0 && predictitCount > 0 ? 0.1 : 0) // Multiple sources = better
      );
      
      const intensity = Math.max(0, Math.min(1, impliedProb));

      // Get top markets for summary
      const topMarkets = allMarketDetails
        .sort((a, b) => (b.volume * b.prob) - (a.volume * a.prob))
        .slice(0, 3);
      
      const topMarket = topMarkets[0];
      const summary = topMarket
        ? `${topMarket.source}: ${(topMarket.question || "Market").substring(0, 50)}... (${Math.round(topMarket.prob * 100)}%, ${polyCount} Poly + ${predictitCount} PI)`
        : `Market implied strike prob ${Math.round(impliedProb * 100)}% (${allMarketDetails.length} markets)`;

      console.log(`[MarketsConnector] ✅ Real data: ${allMarketDetails.length} markets (${polyCount} Poly, ${predictitCount} PI), ${Math.round(impliedProb * 100)}% avg probability, ${Math.round(totalVolume)} total volume`);

      return [
        this.makeEnvelope({
          source: this.config.name,
          confidence,
          intensity,
          timestamp: Date.now(),
          summary,
          rawRef: {
            impliedProb,
            marketCount: allMarketDetails.length,
            polyCount,
            predictitCount,
            totalVolume,
            totalWeight,
            topMarkets: topMarkets.map(m => ({
              question: m.question,
              prob: m.prob,
              volume: m.volume,
              source: m.source
            }))
          },
        }),
      ];
    }

    // No relevant markets found - return unavailable status
    console.warn(`[MarketsConnector] No relevant markets found on Polymarket or PredictIt`);
    return [
      this.makeEnvelope({
        source: this.config.name,
        confidence: 0,
        intensity: 0,
        timestamp: Date.now(),
        summary: `No relevant markets found (Polymarket/PredictIt)`,
          rawRef: {
            impliedProb: null, // null = unavailable, 0 = zero probability from markets
            marketCount: null,
            polyCount: null,
            predictitCount: null,
            totalVolume: null,
            dataStatus: "unavailable"
          },
      }),
    ];
  }
}
