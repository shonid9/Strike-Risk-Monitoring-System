import { BaseConnector } from "./base";
import { SignalEnvelope } from "../../shared/types";
import axios from "axios";

export class PublicInterestConnector extends BaseConnector {
  private lastValues = { gdeltTone: -2.1, wikiSpike: 0.42 };
  private baselineViews: Map<string, number> = new Map();
  private wikiBaseUrl = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article";
  private gdeltDocUrl = "https://api.gdeltproject.org/api/v2/doc/doc";
  private gdeltEventUrl = "https://api.gdeltproject.org/api/v2/event/event";
  private polymarketUrl = "https://gamma-api.polymarket.com/markets";
  private lastEnvelope: SignalEnvelope[] | null = null;
  private lastFetchedAt = 0;
  private readonly minIntervalMs = 5 * 60 * 1000;
  private readonly defaultHeaders = {
    "Accept": "application/json",
    "User-Agent": "StrikeRiskMonitor/1.0 (+https://github.com/shonid9/Strike-Risk-Monitoring-System)",
  };

  async fetchSignals(): Promise<SignalEnvelope[]> {
    const now = Date.now();
    // Only use cache if last fetch was successful (had real data)
    const cachedRef = this.lastEnvelope?.[0]?.rawRef as { dataStatus?: string } | undefined;
    if (this.lastEnvelope && 
        now - this.lastFetchedAt < this.minIntervalMs && 
        cachedRef?.dataStatus === "live") {
      return this.lastEnvelope;
    }
    let gdeltTone: number | null = null;
    let gdeltArticleCount = 0;
    let wikiSpike = 0.42;
    let hasRealData = false;
    let avgToday = 0;
    let avgWeekAgo = 0;
    let gdeltStatus = "unavailable";
    let polymarketMarkets: any[] = [];
    let polymarketStatus = "unavailable";

    // Try to fetch real Wikipedia pageviews data
    try {
      // Iran-related Wikipedia pages to monitor
      const iranPages = [
        "Iran",
        "Iran–United_States_relations",
        "Iranian_Revolutionary_Guards",
        "Nuclear_program_of_Iran",
        "Tehran"
      ];

      const now = new Date();
      const today = now.toISOString().split('T')[0].replace(/-/g, '');
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0].replace(/-/g, '');
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0].replace(/-/g, '');

      let totalViewsToday = 0;
      let totalViewsWeekAgo = 0;
      let pageCount = 0;

      // Get pageviews for each relevant page
      for (const page of iranPages.slice(0, 3)) { // Limit to 3 pages to avoid rate limits
        try {
          // Get today's views
          const todayResponse = await axios.get(
            `${this.wikiBaseUrl}/en.wikipedia.org/all-access/all-agents/${encodeURIComponent(page)}/daily/${today}00/${today}00`,
            { timeout: 8000, headers: this.defaultHeaders }
          );

          // Get week ago views for baseline
          const weekAgoResponse = await axios.get(
            `${this.wikiBaseUrl}/en.wikipedia.org/all-access/all-agents/${encodeURIComponent(page)}/daily/${weekAgo}00/${weekAgo}00`,
            { timeout: 8000, headers: this.defaultHeaders }
          );

          const todayData = todayResponse.data?.items?.[0]?.views || 0;
          const weekAgoData = weekAgoResponse.data?.items?.[0]?.views || 0;

          totalViewsToday += todayData;
          totalViewsWeekAgo += weekAgoData;
          pageCount++;

          // Store baseline if not exists
          if (!this.baselineViews.has(page)) {
            this.baselineViews.set(page, weekAgoData || 1000); // Default baseline
          }
        } catch (e: any) {
          // Continue with other pages if one fails
          console.warn(`[PublicInterestConnector] Failed to fetch Wikipedia data for ${page}:`, e.message);
        }
      }

      if (pageCount > 0 && totalViewsWeekAgo > 0) {
        // Calculate spike percentage
        avgToday = totalViewsToday / pageCount;
        avgWeekAgo = totalViewsWeekAgo / pageCount;
        const spikePercent = ((avgToday - avgWeekAgo) / avgWeekAgo) * 100; // Percentage
        
        // Normalize spike to 0-1 range
        // Spike of 0% = 0.25, +50% = 0.5, +100% = 0.75, +200%+ = 1.0
        // Negative spikes (decrease) map to 0-0.25 range
        const normalizedSpike = spikePercent >= 0 
          ? Math.min(1, 0.25 + (spikePercent / 200)) // Positive: 0.25 to 1.0
          : Math.max(0, 0.25 + (spikePercent / 200)); // Negative: 0 to 0.25
        
        // Update last value for smoothing (prevent sudden jumps)
        this.lastValues.wikiSpike = this.lastValues.wikiSpike * 0.5 + normalizedSpike * 0.5;
        wikiSpike = this.lastValues.wikiSpike;
        hasRealData = true;
        
        console.log(`[PublicInterestConnector] ✅ Real Wikipedia data: ${Math.round(spikePercent)}% spike (${Math.round(avgToday)} views today vs ${Math.round(avgWeekAgo)} week ago, ${pageCount} pages)`);
      } else if (pageCount > 0) {
        // We got some data but no baseline - use current as baseline
        hasRealData = true;
        wikiSpike = 0.3; // Neutral spike if no baseline
        console.log(`[PublicInterestConnector] Partial Wikipedia data: ${pageCount} pages, no baseline yet`);
      }
    } catch (error: any) {
      console.warn(`[PublicInterestConnector] Wikipedia API failed:`, error.message);
    }

    // Try to fetch GDELT data for sentiment analysis
    try {
      // Search for Iran-related articles in last 24 hours
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterday.toISOString().split('T')[0].replace(/-/g, '');
      
      // Use GDELT DOC API to get articles about Iran
      const gdeltResponse = await axios.get(this.gdeltDocUrl, {
        params: {
          query: "Iran AND (strike OR attack OR military OR nuclear OR conflict)",
          mode: "artlist",
          format: "json",
          maxrecords: 100,
          startdatetime: `${yesterdayStr}000000`,
          enddatetime: new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
        },
        timeout: 15000,
        headers: this.defaultHeaders
      });

      const gdeltData = gdeltResponse.data;
      const articles = gdeltData?.articles || [];
      gdeltArticleCount = articles.length;

      if (articles.length > 0) {
        // Try to get tone from GDELT Event API for more detailed sentiment
        try {
          const eventResponse = await axios.get(this.gdeltEventUrl, {
            params: {
              query: "Iran",
              format: "json",
              maxrecords: 50,
              startdatetime: `${yesterdayStr}000000`,
              enddatetime: new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
            },
            timeout: 15000,
            headers: this.defaultHeaders
          });

          const eventData = eventResponse.data;
          const events = Array.isArray(eventData) ? eventData : (eventData?.events || []);
          
          if (events.length > 0) {
            // Calculate average tone from events (GDELT tone ranges from -100 to +100)
            const tones = events
              .map((e: any) => e.AvgTone || e.avgtone || e.tone)
              .filter((t: any) => typeof t === 'number' && !isNaN(t));
            
            if (tones.length > 0) {
              const avgTone = tones.reduce((a: number, b: number) => a + b, 0) / tones.length;
              // Normalize GDELT tone (-100 to +100) to our scale (-2.5 to +2.5, where negative = concern)
              gdeltTone = avgTone / 40; // Scale down to reasonable range
              gdeltStatus = "ok";
              console.log(`[PublicInterestConnector] ✅ GDELT data: ${events.length} events, avg tone: ${avgTone.toFixed(2)} (normalized: ${gdeltTone.toFixed(2)})`);
            } else {
              // Fallback: estimate tone from article count (more articles = more concern)
              // Negative tone indicates concern/conflict
              gdeltTone = Math.min(-1.5, -0.5 - (gdeltArticleCount / 20));
              gdeltStatus = "ok";
              console.log(`[PublicInterestConnector] ✅ GDELT data: ${gdeltArticleCount} articles (estimated tone: ${gdeltTone.toFixed(2)})`);
            }
          } else {
            // No events but have articles - estimate tone
            gdeltTone = Math.min(-1.5, -0.5 - (gdeltArticleCount / 20));
            gdeltStatus = "ok";
            console.log(`[PublicInterestConnector] ✅ GDELT data: ${gdeltArticleCount} articles (estimated tone: ${gdeltTone.toFixed(2)})`);
          }
        } catch (eventError: any) {
          // Event API failed, but we have articles - estimate tone
          gdeltTone = Math.min(-1.5, -0.5 - (gdeltArticleCount / 20));
          gdeltStatus = "ok";
          console.log(`[PublicInterestConnector] ✅ GDELT DOC data: ${gdeltArticleCount} articles (Event API failed, estimated tone: ${gdeltTone.toFixed(2)})`);
        }
      } else {
        gdeltStatus = "empty";
        console.log(`[PublicInterestConnector] GDELT: No articles found for Iran in last 24 hours`);
      }
    } catch (error: any) {
      console.warn(`[PublicInterestConnector] GDELT API failed:`, error.message);
      gdeltStatus = "error";
    }

    // Try to fetch Polymarket data for public interest/sentiment
    try {
      // Fetch from Polymarket
      try {
        const activeResponse = await axios.get(this.polymarketUrl, {
          params: {
            limit: 200,
            active: true,
            closed: false
          },
          timeout: 15000,
          headers: this.defaultHeaders
        });

        let polyMarkets: any[] = [];
        if (Array.isArray(activeResponse.data)) {
          polyMarkets = activeResponse.data;
        } else if (activeResponse.data?.data && Array.isArray(activeResponse.data.data)) {
          polyMarkets = activeResponse.data.data;
        } else if (typeof activeResponse.data === 'object') {
          polyMarkets = Object.values(activeResponse.data);
        }

        // Filter for Iran-US conflict markets ONLY - must contain Iran AND relevant topic
        const relevantMarkets = polyMarkets.filter((market: any) => {
          if (!market) return false;
          const question = (market.question || "").toLowerCase();
          const description = (market.description || "").toLowerCase();
          const category = (market.category || "").toLowerCase();
          const text = `${question} ${description} ${category}`;
          
          // Must contain Iran-related terms
          const hasIran = 
            text.includes("iran") || 
            text.includes("iranian") || 
            text.includes("tehran") ||
            text.includes("irgc");
          
          if (!hasIran) return false;
          
          // Must be about military/conflict/US relations
          const isRelevant = 
            text.includes("strike") || 
            text.includes("attack") || 
            text.includes("war") ||
            text.includes("military") ||
            text.includes("us ") ||
            text.includes("u.s.") ||
            text.includes("united states") ||
            text.includes("america") ||
            text.includes("trump") ||
            text.includes("biden") ||
            text.includes("conflict") ||
            text.includes("nuclear") ||
            text.includes("missile") ||
            text.includes("israel") ||
            text.includes("middle east");
          
          return isRelevant;
        });

        // Extract market details
        relevantMarkets.forEach((market: any) => {
          let prices: number[] = [];
          try {
            if (typeof market.outcomePrices === 'string') {
              try {
                prices = JSON.parse(market.outcomePrices).map((p: string) => parseFloat(p));
              } catch (e) {
                prices = market.outcomePrices.split(',').map((p: string) => parseFloat(p.trim()));
              }
            } else if (Array.isArray(market.outcomePrices)) {
              prices = market.outcomePrices.map((p: any) => parseFloat(p));
            }
          } catch (e) {
            return;
          }

          let yesProb = prices[0] || 0;
          if (yesProb === 0 || isNaN(yesProb)) {
            if (market.lastTradePrice) {
              yesProb = parseFloat(market.lastTradePrice);
            } else if (market.bestBuyYesCost) {
              yesProb = parseFloat(market.bestBuyYesCost);
            }
          }

          const volume = market.volumeNum || market.volume24hr || market.volume || 0;

          if (yesProb > 0 && !isNaN(yesProb) && yesProb <= 1) {
            polymarketMarkets.push({
              question: market.question || market.slug || "Unknown",
              prob: Math.max(0, Math.min(1, yesProb)),
              volume: Math.max(0, volume),
              category: market.category || "",
              source: "Polymarket",
              url: market.marketSlug ? `https://polymarket.com/event/${market.marketSlug}` : null,
              endDate: market.endDate || market.closeTime || null,
              liquidity: market.liquidity || 0,
              outcomes: market.outcomes || []
            });
          }
        });

        if (polymarketMarkets.length > 0) {
          polymarketStatus = "ok";
          console.log(`[PublicInterestConnector] ✅ Polymarket data: ${polymarketMarkets.length} relevant markets found`);
        } else {
          polymarketStatus = "empty";
          console.log(`[PublicInterestConnector] Polymarket: No relevant markets found`);
        }
      } catch (error: any) {
        console.warn(`[PublicInterestConnector] Polymarket API failed:`, error.message);
        polymarketStatus = "error";
      }
    } catch (error: any) {
      console.warn(`[PublicInterestConnector] Polymarket fetch failed:`, error.message);
      polymarketStatus = "error";
    }

    // Calculate combined intensity from Wikipedia spike, GDELT sentiment, and Polymarket
    // Wikipedia spike (0-1) is primary, GDELT tone (negative = concern) adds to it, Polymarket adds sentiment
    let combinedIntensity = 0;
    if (hasRealData) {
      combinedIntensity = Math.min(1, wikiSpike);
    }
    // GDELT negative tone (concern) increases intensity
    if (gdeltTone !== null && gdeltTone < 0) {
      const gdeltBoost = Math.min(0.3, Math.abs(gdeltTone) * 0.1); // Up to +0.3 from GDELT
      combinedIntensity = Math.min(1, combinedIntensity + gdeltBoost);
    }
    // Polymarket probability adds to intensity (weighted average of relevant markets)
    if (polymarketMarkets.length > 0) {
      const avgProb = polymarketMarkets.reduce((sum, m) => sum + m.prob, 0) / polymarketMarkets.length;
      const polyBoost = Math.min(0.2, avgProb * 0.2); // Up to +0.2 from Polymarket
      combinedIntensity = Math.min(1, combinedIntensity + polyBoost);
    }
    
    // If no data sources available, use baseline estimate based on current geopolitical situation
    if (!hasRealData && gdeltStatus !== "ok" && polymarketStatus !== "ok") {
      // Baseline: moderate concern (Iran-US tensions are ongoing)
      combinedIntensity = 0.25; // 25% baseline for known tensions
      console.log(`[PublicInterestConnector] Using baseline estimate (all APIs unavailable)`);
    }
    
    // Confidence based on data quality and real data availability
    const confidence = Math.min(0.95,
      (hasRealData ? 0.4 : 0.15) + // Real Wikipedia data = base confidence
      (gdeltStatus === "ok" ? 0.25 : 0) + // GDELT data adds significant confidence
      (polymarketStatus === "ok" ? 0.2 : 0) + // Polymarket data adds confidence
      (gdeltTone !== null ? Math.abs(gdeltTone) * 0.05 : 0) + // GDELT tone adds some confidence
      (hasRealData ? wikiSpike * 0.15 : 0) + // Wiki spike adds confidence
      (hasRealData && wikiSpike > 0.3 ? 0.1 : 0) // Significant real spike adds confidence
    );
    
    const intensity = combinedIntensity;
    
    // Consider data "live" if at least one source is working, or use degraded mode
    const hasAnyData = hasRealData || gdeltStatus === "ok" || polymarketStatus === "ok";
    const dataStatus = hasAnyData ? "live" : "degraded";
    
    // Generate summary
    let summaryParts: string[] = [];
    if (hasRealData) {
      summaryParts.push(`Wikipedia spike ${Math.round((wikiSpike - 0.25) * 400)}%`);
    }
    if (gdeltStatus === "ok") {
      if (gdeltTone !== null) {
        summaryParts.push(`GDELT tone ${gdeltTone.toFixed(2)}`);
      }
      if (gdeltArticleCount > 0) {
        summaryParts.push(`${gdeltArticleCount} articles`);
      }
    }
    if (polymarketStatus === "ok" && polymarketMarkets.length > 0) {
      const avgProb = polymarketMarkets.reduce((sum, m) => sum + m.prob, 0) / polymarketMarkets.length;
      summaryParts.push(`${polymarketMarkets.length} Polymarket markets (avg ${Math.round(avgProb * 100)}%)`);
    }
    
    // If we have partial data, show it. If no data at all, use baseline estimate
    let summary: string;
    if (summaryParts.length > 0) {
      summary = summaryParts.join(" + ");
    } else if (polymarketMarkets.length > 0) {
      // Have Polymarket data but no other sources
      const avgProb = polymarketMarkets.reduce((sum, m) => sum + m.prob, 0) / polymarketMarkets.length;
      summary = `${polymarketMarkets.length} Polymarket markets (avg ${Math.round(avgProb * 100)}%)`;
    } else {
      // Fallback: use historical baseline estimate
      summary = `Public interest baseline estimate (historical average)`;
    }
    
    const envelope = [
      this.makeEnvelope({
        source: this.config.name,
        confidence,
        intensity,
        timestamp: Date.now(),
        summary,
        rawRef: { 
          gdeltTone, 
          gdeltArticleCount,
          wikiSpike,
          hasRealData,
          baselineSize: this.baselineViews.size,
          avgToday,
          avgWeekAgo,
          polymarketMarkets: polymarketMarkets.sort((a, b) => b.volume - a.volume).slice(0, 15), // Top 15 by volume
          polymarketCount: polymarketMarkets.length,
          polymarketAvgProb: polymarketMarkets.length > 0 
            ? polymarketMarkets.reduce((sum, m) => sum + m.prob, 0) / polymarketMarkets.length 
            : 0,
          polymarketTotalVolume: polymarketMarkets.reduce((sum, m) => sum + m.volume, 0),
          dataStatus,
          dataSource: {
            wikipedia: hasRealData ? "ok" : "error",
            gdelt: gdeltStatus,
            polymarket: polymarketStatus
          }
        },
      }),
    ];
    this.lastEnvelope = envelope;
    this.lastFetchedAt = now;
    return envelope;
  }
}
