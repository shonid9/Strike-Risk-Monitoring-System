import { ScoreBreakdown, SignalEnvelope, SignalType } from "../shared/types";

export interface IndicatorAnalysis {
  signalType: SignalType;
  currentValue: number;
  trend: "increasing" | "decreasing" | "stable";
  riskLevel: "low" | "medium" | "high" | "critical";
  summary: string;
  details: string[];
  recommendation: string;
  confidence: number;
}

export function analyzeIndicator(
  signalType: SignalType,
  value: number,
  signals: SignalEnvelope[],
  score: ScoreBreakdown
): IndicatorAnalysis {
  const relevantSignals = signals.filter((s) => s.signalType === signalType);
  const latestSignal = relevantSignals[relevantSignals.length - 1];
  const rawRef = latestSignal?.rawRef as any;

  let trend: "increasing" | "decreasing" | "stable" = "stable";
  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  let summary = "";
  let details: string[] = [];
  let recommendation = "";
  let confidence = latestSignal?.confidence || 0.5;

  // Calculate trend from actual historical data
  if (relevantSignals.length >= 2) {
    // Use last 3-5 signals for trend calculation
    const recentSignals = relevantSignals.slice(-5);
    const recentValues = recentSignals.map(s => s.intensity);
    
    // Calculate linear regression slope
    const n = recentValues.length;
    const sumX = n * (n - 1) / 2; // 0 + 1 + 2 + ... + (n-1)
    const sumY = recentValues.reduce((a, b) => a + b, 0);
    const sumXY = recentValues.reduce((sum, val, idx) => sum + val * idx, 0);
    const sumX2 = n * (n - 1) * (2 * n - 1) / 6; // 0² + 1² + 2² + ... + (n-1)²
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // Threshold for trend detection: 0.05 per signal (5% change over 5 signals)
    if (slope > 0.05) trend = "increasing";
    else if (slope < -0.05) trend = "decreasing";
    else trend = "stable";
  } else if (relevantSignals.length === 1) {
    // Single data point - check if value itself indicates trend
    // Only use this if we have raw data indicating direction
    const rawTrend = rawRef?.trend || rawRef?.articleTrend || rawRef?.toneTrend;
    if (rawTrend !== undefined && rawTrend !== null) {
      if (rawTrend > 0) trend = "increasing";
      else if (rawTrend < 0) trend = "decreasing";
    }
  }

  // Determine risk level
  if (value >= 0.8) riskLevel = "critical";
  else if (value >= 0.6) riskLevel = "high";
  else if (value >= 0.4) riskLevel = "medium";
  else riskLevel = "low";

  // Generate analysis based on signal type
  switch (signalType) {
    case "newsIntel":
      const articleCount = rawRef?.matchedArticles || rawRef?.totalArticles || 0;
      const urgentTone = rawRef?.imminentTone || 0;
      const matchedEventRegistry = rawRef?.matchedEventRegistry ?? null;
      const matchedRss = rawRef?.matchedRss ?? null;
      const newsRssSources = rawRef?.rssSources || [];
      const newsRssUpdatedAt = rawRef?.rssUpdatedAt;
      const newsDataSource = rawRef?.dataSource;
      const newsDataStatus = rawRef?.dataStatus;
      
      if (newsDataStatus === "unavailable") {
        summary = "News intelligence unavailable (Event Registry). RSS only.";
        details.push("Primary news API unavailable; no simulated data used.");
        details.push(`RSS sources: ${newsRssSources.join(", ") || "None"}`);
        if (newsRssUpdatedAt) {
          details.push(`RSS updated: ${new Date(newsRssUpdatedAt).toLocaleTimeString()}`);
        }
        if (newsDataSource) {
          details.push(`Sources status: eventRegistry=${newsDataSource.eventRegistry}, rss=${newsDataSource.rss}`);
        }
      } else if (articleCount === 0) {
        summary = `News intelligence shows 0% risk signal from major outlets.`;
        details.push("No significant strike-related coverage detected");
      } else {
        summary = `News intelligence shows ${Math.round(value * 100)}% risk signal from major outlets.`;
        if (matchedEventRegistry !== null || matchedRss !== null) {
          details.push(`${articleCount} articles matched (EventRegistry ${matchedEventRegistry ?? 0}, RSS ${matchedRss ?? 0})`);
        } else {
          details.push(`${articleCount} articles detected with strike-related lexicon`);
        }
        if (urgentTone > 0) {
          const tonePercent = Math.round(urgentTone * 100);
          details.push(`${tonePercent}% of articles contain urgent/imminent language`);
          if (tonePercent > 50) {
            details.push("⚠️ High concentration of time-sensitive terminology detected");
          }
        }
        if (rawRef?.activeOutlets && rawRef.activeOutlets.length > 0) {
          details.push(`Sources: ${rawRef.activeOutlets.slice(0, 5).join(", ")}`);
        }
        if (newsRssSources.length > 0) {
          details.push(`RSS feeds: ${newsRssSources.slice(0, 5).join(", ")}`);
        }
        details.push("Risk logic: baseline ~3-5 articles = low risk; 10+ alert-keyword articles = high risk.");
        details.push("Update cadence: RSS cached ~30 minutes for consistency.");
      }
      recommendation =
        value > 0.6
          ? "Monitor major outlets (Reuters, BBC, NYT, Al-Jazeera) for breaking developments. Elevated media attention suggests increased operational readiness."
          : "Standard monitoring protocol. Media activity within normal parameters.";

      break;

    case "publicInterest":
      // wikiSpike is normalized 0-1 where:
      // 0.25 = baseline (0% change)
      // >0.25 = positive spike (up to 1.0 = +150%)
      // <0.25 = negative (down to 0.0 = -100%)
      // Formula: (normalized - 0.25) * 4 * 100 = percentage change
      // Example: 0.5 normalized = (0.5 - 0.25) * 4 * 100 = +100%
      const wikiSpikeNormalized = rawRef?.wikiSpike || 0.25;
      const wikiSpikePercent = Math.round((wikiSpikeNormalized - 0.25) * 400); // Convert to percentage: -100% to +300%
      
      const publicDataStatus = rawRef?.dataStatus;
      const publicDataSource = rawRef?.dataSource;
      const avgToday = rawRef?.avgToday ?? null;
      const avgWeekAgo = rawRef?.avgWeekAgo ?? null;
      const gdeltTone = rawRef?.gdeltTone ?? null;
      const gdeltArticleCount = rawRef?.gdeltArticleCount ?? 0;
      const hasRealData = rawRef?.hasRealData ?? false;

      if (publicDataStatus === "unavailable") {
        summary = "Public interest data unavailable (Wikipedia/GDELT/Polymarket).";
        details.push("No simulated values used.");
        if (publicDataSource) {
          details.push(`Sources: wikipedia=${publicDataSource.wikipedia}, gdelt=${publicDataSource.gdelt}, polymarket=${publicDataSource.polymarket || "unavailable"}`);
        }
        recommendation =
          "Public interest feeds unavailable. Verify Wikipedia pageviews directly, monitor GDELT availability, and check Polymarket for relevant markets.";
        break;
      }

      summary = `Public interest metrics indicate ${Math.round(value * 100)}% engagement signal.`;
      
      // Wikipedia data
      if (hasRealData && rawRef?.wikiSpike !== undefined) {
        if (avgToday !== null && avgWeekAgo !== null) {
          details.push(`Wikipedia views: ${Math.round(avgToday)} today vs ${Math.round(avgWeekAgo)} week ago`);
        }
        if (wikiSpikePercent > 0) {
          details.push(`Wikipedia spike: +${wikiSpikePercent}%`);
        } else if (wikiSpikePercent < 0) {
          details.push(`Wikipedia spike: ${wikiSpikePercent}%`);
        } else {
          details.push(`Wikipedia views: at baseline`);
        }
        if (wikiSpikePercent > 50) {
          details.push("📈 Significant public awareness surge detected");
        }
      } else {
        details.push("Wikipedia data: unavailable");
      }
      
      // GDELT data
      if (publicDataSource?.gdelt === "ok") {
        if (gdeltArticleCount > 0) {
          details.push(`GDELT articles: ${gdeltArticleCount} Iran-related articles in last 24 hours`);
        }
        if (gdeltTone !== null) {
          details.push(`GDELT sentiment tone: ${gdeltTone.toFixed(2)} (negative = concern, positive = positive coverage)`);
          if (gdeltTone < -1.0) {
            details.push("⚠️ Strong negative sentiment indicates elevated public concern");
          } else if (gdeltTone < -0.5) {
            details.push("📉 Moderate negative sentiment detected");
          }
        }
        details.push("GDELT data source: Real-time global news monitoring (65 languages)");
      } else {
        details.push("GDELT data: unavailable");
      }
      
      // Polymarket data
      const polymarketMarkets = rawRef?.polymarketMarkets || [];
      const polymarketCount = rawRef?.polymarketCount || 0;
      const polymarketAvgProb = rawRef?.polymarketAvgProb || 0;
      const polymarketTotalVolume = rawRef?.polymarketTotalVolume || 0;
      
      if (publicDataSource?.polymarket === "ok" && polymarketCount > 0) {
        details.push(`Polymarket: ${polymarketCount} relevant prediction markets found`);
        details.push(`Market consensus: ${Math.round(polymarketAvgProb * 100)}% average probability`);
        
        if (polymarketTotalVolume > 0) {
          const volumeFormatted = polymarketTotalVolume >= 1000000 
            ? `$${(polymarketTotalVolume / 1000000).toFixed(1)}M` 
            : polymarketTotalVolume >= 1000 
            ? `$${(polymarketTotalVolume / 1000).toFixed(1)}K` 
            : `$${polymarketTotalVolume.toFixed(0)}`;
          details.push(`Total trading volume: ${volumeFormatted}`);
        }
        
        if (polymarketMarkets.length > 0) {
          details.push("\nTop markets by volume:");
          polymarketMarkets.slice(0, 8).forEach((market: any, idx: number) => {
            const prob = Math.round((market.prob || 0) * 100);
            const question = (market.question || "Unknown").substring(0, 70);
            const volume = market.volume || 0;
            const volumeStr = volume >= 1000000 
              ? `$${(volume / 1000000).toFixed(1)}M` 
              : volume >= 1000 
              ? `$${(volume / 1000).toFixed(0)}K` 
              : `$${volume.toFixed(0)}`;
            const url = market.url || '';
            details.push(`  ${idx + 1}. "${question}${question.length >= 70 ? '...' : ''}"`);
            details.push(`     ${prob}% probability • ${volumeStr} volume${url ? ` • ${url}` : ''}`);
          });
          if (polymarketMarkets.length > 8) {
            details.push(`  ... and ${polymarketMarkets.length - 8} more markets`);
          }
          
          if (polymarketAvgProb > 0.20) {
            details.push("\n📊 HIGH: Market consensus indicates elevated risk perception (>20%)");
          } else if (polymarketAvgProb > 0.12) {
            details.push("\n📊 MODERATE: Market shows increased concern (>12%)");
          } else {
            details.push("\n📊 LOW: Market sentiment within normal range");
          }
        }
        details.push("\nPolymarket: Decentralized prediction market with real money trading");
      } else if (publicDataSource?.polymarket === "empty") {
        details.push("Polymarket: No relevant markets found (searched for Iran/strike/attack/military topics)");
      } else {
        details.push("Polymarket data: unavailable");
      }
      
      details.push("Risk logic: high GDELT volume + negative tone = elevated; Wikipedia spikes above 80k/day = public concern; Polymarket probability >15% = market concern.");
      
      if (publicDataSource) {
        details.push(`Data sources: wikipedia=${publicDataSource.wikipedia}, gdelt=${publicDataSource.gdelt}, polymarket=${publicDataSource.polymarket}`);
      }
      
      recommendation =
        value > 0.5
          ? "Public attention spike correlates with increased geopolitical tension. Monitor social media and search trends for escalation patterns."
          : "Public interest within normal range. No significant information-seeking behavior detected.";

      break;

    case "civilAviation":
      // Value is normalized dropRatio (0-1), where 1 = empty sky (high risk)
      // Convert to percentage for display
      const aircraftCount = rawRef?.aircraftOverIran || rawRef?.uniqueFlights || 0;
      // Baseline is calculated from historical data in connector, or use current if not available
      const baseline = rawRef?.baseline ?? aircraftCount; // Use current as baseline if not calculated yet
      const totalAircraftCount = rawRef?.totalAircraftCount ?? aircraftCount;
      const drop = baseline > 0
        ? Math.max(0, Math.min(100, Math.round(((baseline - totalAircraftCount) / baseline) * 100)))
        : 0;
      const dropRatio = rawRef?.dropRatio ?? (baseline > 0 ? (baseline - totalAircraftCount) / baseline : 0);
      
      const flightDetails = rawRef?.flightDetails || [];
      const byAirline = rawRef?.byAirline || {};
      const byAirport = rawRef?.byAirport || {};
      const overIranCount = rawRef?.overIranCount ?? 0;
      const overIranMilitaryCount = rawRef?.overIranMilitaryCount ?? 0;
      const groundCount = rawRef?.groundCount ?? 0;
      const groundMilitaryCount = rawRef?.groundMilitaryCount ?? 0;
      const groundByAirport = rawRef?.groundByAirport || {};
      const groundSample = rawRef?.groundSample || [];
      const aviationDataStatus = rawRef?.dataStatus;
      const aviationDataSource = rawRef?.dataSource;
      const dataError = rawRef?.error;
      
      if (aviationDataStatus === "unavailable") {
        summary = "Civil aviation data unavailable (Aviationstack). Showing ADS-B only.";
        details.push("Primary airport feed unavailable - no simulated values used.");
        if (dataError) {
          details.push(`Reason: ${dataError}`);
        }
        details.push(`Over Iran airspace (ADS-B): ${overIranCount} aircraft`);
        details.push(`Military aircraft over Iran airspace (ADS-B): ${overIranMilitaryCount}`);
        details.push(`On-ground at Iran airports (ADS-B): ${groundCount} aircraft (${groundMilitaryCount} military)`);
        if (aviationDataSource) {
          details.push(`Data sources: aviationstack=${aviationDataSource.aviationstack}, adsbOverIran=${aviationDataSource.adsbOverIran}, adsbGround=${aviationDataSource.adsbGround}`);
        }
        if (Object.keys(groundByAirport).length > 0) {
          details.push("Airport ground activity (ADS-B):");
          Object.entries(groundByAirport)
            .slice(0, 5)
            .forEach(([code, counts]) => {
              const c = counts as { total: number; military: number };
              details.push(`  • ${code}: ${c.total} on-ground (${c.military} military)`);
            });
        }
        recommendation = "Aviationstack data unavailable. Use ADS-B counts above and verify with airport/airline feeds. No simulated data is used.";
        break;
      }
      
      summary = `Civil aviation activity shows ${Math.round(value * 100)}% risk signal (${aircraftCount} to/from Iran airports; ${overIranCount} over Iran airspace; baseline ${baseline}).`;
      
      if (aircraftCount > 0) {
        details.push(`${aircraftCount} commercial flights to/from Iran airports detected (baseline: ${baseline})`);
        details.push(`Over Iran airspace (ADS-B): ${overIranCount} aircraft`);
        details.push(`Military aircraft over Iran airspace (ADS-B): ${overIranMilitaryCount}`);
        details.push(`On-ground at Iran airports (ADS-B): ${groundCount} aircraft (${groundMilitaryCount} military)`);
        
        // Show breakdown by airline
        if (Object.keys(byAirline).length > 0) {
          details.push(`Active airlines (${Object.keys(byAirline).length}):`);
          Object.entries(byAirline)
            .sort((a, b) => (b[1] as number) - (a[1] as number)) // Sort by count
            .slice(0, 8) // Top 8 airlines
            .forEach(([airline, count]) => {
              const countNum = count as number;
              details.push(`  • ${airline}: ${countNum} flight${countNum > 1 ? 's' : ''}`);
            });
        }
        
        // Show breakdown by airport
        if (Object.keys(byAirport).length > 0) {
          details.push(`Airport activity:`);
          Object.entries(byAirport)
            .sort((a, b) => {
              const aCounts = b[1] as { arrivals: number; departures: number };
              const bCounts = a[1] as { arrivals: number; departures: number };
              return (aCounts.arrivals + aCounts.departures) - (bCounts.arrivals + bCounts.departures);
            })
            .slice(0, 6)
            .forEach(([airport, counts]) => {
              const countsData = counts as { arrivals: number; departures: number };
              const total = countsData.arrivals + countsData.departures;
              details.push(`  • ${airport}: ${total} flight${total > 1 ? 's' : ''} (${countsData.arrivals} arrivals, ${countsData.departures} departures)`);
            });
        }
        
        // Show sample flight details
        if (flightDetails.length > 0) {
          details.push(`Sample flights (showing ${Math.min(5, flightDetails.length)} of ${flightDetails.length}):`);
          flightDetails.slice(0, 5).forEach((flight: any) => {
            const depAirport = (flight.departure?.airport || flight.departure?.iata || 'N/A') as string;
            const arrAirport = (flight.arrival?.airport || flight.arrival?.iata || 'N/A') as string;
            const route = `${depAirport} → ${arrAirport}`;
            details.push(`  • ${flight.flightNumber || 'N/A'} (${flight.airline || 'Unknown'}): ${route}`);
          });
        }
        
        if (drop > 30) {
          details.push(`${drop}% reduction vs baseline (based on total observed aircraft)`);
        } else if (drop > 0) {
          details.push(`${drop}% below baseline (based on total observed aircraft)`);
        } else if (totalAircraftCount > baseline) {
          details.push(`${Math.round(((totalAircraftCount - baseline) / baseline) * 100)}% above baseline (based on total observed aircraft)`);
        } else {
          details.push(`At baseline (based on total observed aircraft)`);
        }
      } else {
        // No to/from airport flights detected
        details.push(`0 commercial flights to/from Iran airports detected (baseline: ${baseline})`);
        details.push(`Over Iran airspace (ADS-B): ${overIranCount} aircraft`);
        details.push(`Military aircraft over Iran airspace (ADS-B): ${overIranMilitaryCount}`);
        details.push(`On-ground at Iran airports (ADS-B): ${groundCount} aircraft (${groundMilitaryCount} military)`);
        details.push(`${drop}% reduction vs baseline (based on total observed aircraft)`);
      }
      
      if (rawRef?.airports && rawRef.airports.length > 0) {
        details.push(`Monitoring airports: ${rawRef.airports.join(", ")}`);
        details.push(`Airports monitored: IKA (Tehran Imam Khomeini), SYZ (Shiraz), MHD (Mashhad), TBZ (Tabriz), THR (Tehran Mehrabad)`);
      }
      if (Object.keys(groundByAirport).length > 0) {
        details.push("Airport ground activity (ADS-B):");
        Object.entries(groundByAirport)
          .slice(0, 5)
          .forEach(([code, counts]) => {
            const c = counts as { total: number; military: number };
            details.push(`  • ${code}: ${c.total} on-ground (${c.military} military)`);
          });
        if (groundCount === 0) {
          details.push("Note: ADS-B ground coverage can be limited; parked aircraft may not transmit.");
        }
      }
      if (groundSample.length > 0) {
        details.push("Ground sample (ADS-B):");
        groundSample.slice(0, 5).forEach((ac: any) => {
          const alt = typeof ac.alt === "number" ? `${Math.round(ac.alt)}ft` : "N/A";
          details.push(`  • ${ac.airport}: ${ac.flight} (${ac.type}, ${alt})`);
        });
      }
      
      recommendation =
        drop > 50
          ? "Large reduction vs baseline. Verify with official NOTAMs, airline advisories, and airport status dashboards."
          : drop > 30
          ? "Moderate reduction vs baseline. Recheck in the next update and compare with official airport/airline sources."
          : drop > 0
          ? "Small reduction vs baseline. Monitor for trends using official sources."
          : "No reduction vs baseline based on observed data.";

      break;

    case "militaryTankers":
      const tankerCount = rawRef?.tankerCount;
      // Check if data is unavailable (null) vs zero tankers (0)
      if (tankerCount === null || tankerCount === undefined) {
        summary = `Military refueling aircraft activity: Data unavailable.`;
        details.push("Tanker data unavailable - API endpoints failed");
        details.push("Cannot determine if zero tankers or data unavailable");
        recommendation = "Tanker data unavailable. Verify API connectivity and retry.";
        break;
      }
      summary = `Military refueling aircraft activity: ${Math.round(value * 100)}% risk signal (${tankerCount} tankers detected).`;
      if (tankerCount > 0) {
        const locations = rawRef?.locations || [];
        const searchAreas = rawRef?.searchAreas || ["Global Military", "Persian Gulf", "Eastern Mediterranean"];
        
        details.push(`${tankerCount} refueling aircraft detected:`);
        
        if (locations.length > 0) {
          // Group by type for better display
          const byType: Record<string, any[]> = {};
          locations.forEach((loc: any) => {
            const type = (loc.type || "Unknown").trim() || "Unknown";
            if (!byType[type]) byType[type] = [];
            byType[type].push(loc);
          });
          
          // Display each type with details
          Object.entries(byType).forEach(([type, aircraft]) => {
            const typeName = type || "Unknown Type";
            const typeCount = aircraft.length;
            const typeInfo = getTankerTypeInfo(typeName);
            
            details.push(`  • ${typeCount}x ${typeName}${typeInfo ? ` (${typeInfo.purpose})` : ""}`);
            
            // Show individual aircraft details (max 5 per type)
            aircraft.slice(0, 5).forEach((ac: any) => {
              const callsign = ac.flight || "N/A";
              const lat = ac.lat ? ac.lat.toFixed(1) : "N/A";
              const lon = ac.lon ? ac.lon.toFixed(1) : "N/A";
              const alt = ac.alt ? `${Math.round(ac.alt / 100) * 100}ft` : "N/A";
              const region = getRegionName(ac.lat, ac.lon);
              
              details.push(`    - ${callsign}: ${region} (${lat}°N, ${lon}°E, ${alt})`);
            });
            
            if (aircraft.length > 5) {
              details.push(`    ... and ${aircraft.length - 5} more ${typeName} aircraft`);
            }
          });
        } else {
          details.push(`  ${tankerCount} tankers detected (location data unavailable)`);
        }
        
        if (tankerCount >= 3) {
          details.push("🚨 SURGE DETECTED: 3+ tankers indicates extended-range strike capability");
          details.push("   Why this matters: Multiple tankers enable long-range bomber operations");
        } else if (tankerCount > 0) {
          details.push(`Normal operational level (${tankerCount} < 3 = no surge)`);
        }
        
        if (searchAreas.length > 0) {
          details.push(`Search coverage: ${searchAreas.join(", ")}`);
        }
      } else if (tankerCount === 0) {
        // Zero tankers detected (real data, not unavailable)
        const scanStats = rawRef?.scanStats;
        const dataStatus = rawRef?.dataStatus;
        
        if (dataStatus === "live") {
          // API worked but found zero tankers
          details.push("0 refueling aircraft detected in monitored regions (confirmed: API working, no tankers present)");
          
          if (scanStats) {
            const workingEndpoints = [
              scanStats.mil?.ok && `Global Military (${scanStats.mil?.aircraft || 0} aircraft scanned)`,
              scanStats.gulf?.ok && `Persian Gulf (${scanStats.gulf?.aircraft || 0} aircraft scanned)`,
              scanStats.med?.ok && `Eastern Mediterranean (${scanStats.med?.aircraft || 0} aircraft scanned)`
            ].filter(Boolean);
            
            if (workingEndpoints.length > 0) {
              details.push(`Active endpoints: ${workingEndpoints.join(", ")}`);
            }
            
            const totalScanned = (scanStats.mil?.aircraft || 0) + (scanStats.gulf?.aircraft || 0) + (scanStats.med?.aircraft || 0);
            if (totalScanned > 0) {
              details.push(`Total aircraft scanned: ${totalScanned} (none were tankers)`);
            }
          }
        } else {
          // Unknown status
          details.push("0 refueling aircraft detected (API status unclear)");
        }
        
        const searchAreas = rawRef?.searchAreas || ["Global Military", "Persian Gulf", "Eastern Mediterranean"];
        details.push(`Searched areas: ${searchAreas.join(", ")}`);
        details.push("Aircraft types monitored: KC-135 (Stratotanker), KC-10 (Extender), KC-46 (Pegasus), KC-130 (Hercules), KC-767");
        details.push("Why this matters: Tankers enable long-range strike operations. Absence suggests no immediate extended-range mission preparation.");
        details.push("What we look for: KC-135/KC-10 in Persian Gulf or Eastern Med = refueling capability for bombers/strike aircraft");
      }
      // Additional indicators for accuracy
      const scanStats = rawRef?.scanStats;
      const fetchedAt = rawRef?.fetchedAt;
      if (scanStats) {
        const scannedTotal =
          (scanStats.mil?.aircraft || 0) +
          (scanStats.gulf?.aircraft || 0) +
          (scanStats.med?.aircraft || 0);
        const tankersFound =
          (scanStats.mil?.tankers || 0) +
          (scanStats.gulf?.tankers || 0) +
          (scanStats.med?.tankers || 0);
        const ratio = scannedTotal > 0 ? Math.round((tankersFound / scannedTotal) * 1000) / 10 : 0;
        const endpointStatus = [
          `mil:${scanStats.mil?.ok ? "ok" : "fail"} (${scanStats.mil?.aircraft || 0})`,
          `gulf:${scanStats.gulf?.ok ? "ok" : "fail"} (${scanStats.gulf?.aircraft || 0})`,
          `med:${scanStats.med?.ok ? "ok" : "fail"} (${scanStats.med?.aircraft || 0})`,
        ];
        details.push(`Scan coverage: ${endpointStatus.join(", ")}`);
        details.push(`Tanker ratio: ${ratio}% (${tankersFound}/${scannedTotal} scanned aircraft)`);
      }
      if (fetchedAt) {
        const ageSeconds = Math.max(0, Math.round((Date.now() - fetchedAt) / 1000));
        details.push(`Data freshness: ${ageSeconds}s ago`);
      }
      recommendation =
        value > 0.5 || tankerCount >= 3
          ? "Tanker surge indicates potential extended-range strike capability. Monitor for additional military assets (B-52, F-35, F-15E) and operational patterns. Multiple tankers in region = preparation for long-range operations."
          : tankerCount > 0
          ? "Tanker activity detected but below surge threshold. Normal operational refueling or routine patrols. Continue monitoring for increases."
          : "Tanker activity at normal levels. No surge indicators present. No extended-range strike preparation detected.";

      break;

    case "markets":
      const marketCount = rawRef?.marketCount;
      // Check if data is unavailable (null) vs zero markets (0)
      if (marketCount === null || marketCount === undefined) {
        summary = `Market-implied strike probability: Data unavailable.`;
        details.push("Market data unavailable - no relevant markets found or API failed");
        details.push("Cannot determine market-implied probability");
        recommendation = "Market data unavailable. Check Polymarket and PredictIt API status.";
        break;
      }
      // Use impliedProb from rawRef if available (real market data), otherwise use normalized value
      const impliedProb = rawRef?.impliedProb !== undefined && rawRef?.impliedProb !== null ? rawRef.impliedProb : value;
      const displayProb = Math.round(impliedProb * 100);
      
      summary = `Market-implied strike probability: ${displayProb}% (${marketCount > 0 ? 'real markets' : 'no markets found'}).`;
      if (marketCount > 0) {
        details.push(`${marketCount} relevant markets found (${rawRef?.polyCount || 0} Polymarket, ${rawRef?.predictitCount || 0} PredictIt)`);
        details.push(`Weighted average probability: ${displayProb}%`);
        if (rawRef?.totalVolume !== undefined) {
          details.push(`Total trading volume: $${Math.round(rawRef.totalVolume)}`);
        }
        if (impliedProb > 0.15) {
          details.push("📊 Market sentiment indicates elevated risk perception");
        } else if (impliedProb < 0.05) {
          details.push("📉 Market sentiment indicates low risk perception");
        }
        if (rawRef?.topMarkets && rawRef.topMarkets.length > 0) {
          const topMarket = rawRef.topMarkets[0];
          const topProb = Math.round((topMarket.prob || impliedProb) * 100);
          details.push(`Top market: "${(topMarket.question || topMarket.name || "").substring(0, 40)}..." (${topProb}%)`);
        }
      } else if (marketCount === 0) {
        // Zero markets found (real search, no markets)
        details.push("No relevant markets found on Polymarket or PredictIt (confirmed: searched but found none)");
        details.push(`No market-implied probability available (no markets found)`);
      }
      recommendation =
        impliedProb > 0.15
          ? "Market odds reflect informed speculation. Monitor for sudden shifts in betting patterns that may precede events."
          : impliedProb < 0.05
          ? "Market sentiment indicates low risk. Prediction markets show minimal concern about strike probability."
          : "Market sentiment neutral. No significant risk premium detected in prediction markets.";

      break;

    case "pizza":
      if (rawRef?.dataStatus === "unavailable") {
        summary = "Pentagon Pizza indicator unavailable (no real data source).";
        details.push("Simulated proxy disabled for accuracy.");
        recommendation = "No real pizza delivery data source. Excluded from scoring.";
        break;
      }
      summary = `Pentagon area delivery activity: ${Math.round(value * 100)}% above baseline.`;
      if (rawRef?.loadIndex) {
        const load = Math.round(rawRef.loadIndex * 100);
        details.push(`Delivery load index: ${load}% (proxy for late-night operations)`);
        if (load > 30) {
          details.push("🍕 Unusual delivery surge suggests extended working hours at Pentagon");
        }
      }
      recommendation =
        value > 0.3
          ? "Elevated delivery activity may indicate extended operational hours. Historical correlation with military operations exists."
          : "Delivery patterns normal. No indicators of extended operational activity.";

      break;

    case "weather":
      const visibility = rawRef?.visibilityKm || 10;
      const cloudCover = rawRef?.cloudCover || 0.2;
      const favorable = visibility >= 8 && cloudCover <= 0.5;
      summary = `Operational weather conditions: ${Math.round(value * 100)}% risk signal (${favorable ? "Favorable" : "Marginal"} for operations).`;
      details.push(`Visibility: ${visibility}km, Cloud cover: ${Math.round(cloudCover * 100)}%`);
      if (favorable) {
        details.push("✅ Weather conditions optimal for precision operations");
      } else {
        details.push("⚠️ Reduced visibility or cloud cover may limit operational effectiveness");
      }
      details.push(`Location: Tehran (35.6892°N, 51.3890°E)`);
      recommendation =
        favorable
          ? "Weather conditions support operational planning. Clear skies and good visibility enhance precision strike capability."
          : "Marginal weather conditions. Reduced visibility may impact operational timing decisions.";

      break;

    default:
      summary = `Custom indicator at ${Math.round(value * 100)}%`;
      recommendation = "Monitor custom data sources for anomalies.";
  }

  return {
    signalType,
    currentValue: value,
    trend,
    riskLevel,
    summary,
    details,
    recommendation,
    confidence,
  };
}

export function analyzeAllIndicators(
  score: ScoreBreakdown,
  signals: SignalEnvelope[]
): Record<SignalType, IndicatorAnalysis> {
  const analyses: Partial<Record<SignalType, IndicatorAnalysis>> = {};

  (Object.keys(score.components) as SignalType[]).forEach((key) => {
    if (key !== "custom" || score.components[key] > 0) {
      analyses[key] = analyzeIndicator(key, score.components[key], signals, score);
    }
  });

  return analyses as Record<SignalType, IndicatorAnalysis>;
}

// Helper function to get tanker type information
function getTankerTypeInfo(type: string): { purpose: string; range: string } | null {
  const typeUpper = type.toUpperCase();
  if (typeUpper.includes("KC-135") || typeUpper.includes("135")) {
    return { purpose: "Stratotanker - primary refueling", range: "Long-range" };
  }
  if (typeUpper.includes("KC-10") || typeUpper.includes("10")) {
    return { purpose: "Extender - heavy refueling", range: "Very long-range" };
  }
  if (typeUpper.includes("KC-46") || typeUpper.includes("46")) {
    return { purpose: "Pegasus - modern refueling", range: "Long-range" };
  }
  if (typeUpper.includes("KC-130") || typeUpper.includes("130")) {
    return { purpose: "Hercules - tactical refueling", range: "Medium-range" };
  }
  if (typeUpper.includes("KC-767") || typeUpper.includes("767")) {
    return { purpose: "Boeing 767 tanker", range: "Long-range" };
  }
  return null;
}

// Helper function to get region name from coordinates
function getRegionName(lat: number | undefined, lon: number | undefined): string {
  if (!lat || !lon) return "Unknown location";
  
  // Persian Gulf: ~26°N, 52°E
  if (lat >= 24 && lat <= 28 && lon >= 48 && lon <= 56) {
    return "Persian Gulf";
  }
  // Eastern Mediterranean: ~33°N, 35°E
  if (lat >= 31 && lat <= 35 && lon >= 32 && lon <= 38) {
    return "Eastern Mediterranean";
  }
  // Red Sea: ~20°N, 38°E
  if (lat >= 18 && lat <= 22 && lon >= 36 && lon <= 42) {
    return "Red Sea";
  }
  // Arabian Sea: ~20°N, 65°E
  if (lat >= 18 && lat <= 24 && lon >= 60 && lon <= 70) {
    return "Arabian Sea";
  }
  // General Middle East
  if (lat >= 20 && lat <= 40 && lon >= 30 && lon <= 60) {
    return "Middle East region";
  }
  
  return `${lat > 0 ? 'N' : 'S'}${Math.abs(lat).toFixed(0)}°, ${lon > 0 ? 'E' : 'W'}${Math.abs(lon).toFixed(0)}°`;
}
