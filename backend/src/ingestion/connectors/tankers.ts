import { BaseConnector } from "./base";
import { SignalEnvelope } from "../../shared/types";
import axios from "axios";

export class TankersConnector extends BaseConnector {
  private lastCount = 1;
  private baseUrl = "https://api.adsb.lol/v2";

  async fetchSignals(): Promise<SignalEnvelope[]> {
    // Try to fetch real military tanker data from adsb.lol
    const allTankers: any[] = [];
    const scanStats = {
      mil: { aircraft: 0, tankers: 0, ok: false },
      gulf: { aircraft: 0, tankers: 0, ok: false },
      med: { aircraft: 0, tankers: 0, ok: false },
    };
    const fetchedAt = Date.now();
    
    try {
      // Strategy 1: Get all military aircraft and filter for tankers
      try {
        const milResponse = await axios.get(`${this.baseUrl}/mil`, {
          timeout: 12000,
          headers: {
            'Accept': 'application/json'
          }
        });

        const milData = milResponse.data || {};
        // Handle different response formats
        let militaryAircraft: any[] = [];
        if (Array.isArray(milData)) {
          militaryAircraft = milData;
        } else if (Array.isArray(milData.ac)) {
          militaryAircraft = milData.ac;
        } else if (milData.ac && typeof milData.ac === 'object') {
          militaryAircraft = Object.values(milData.ac);
        }
        
        scanStats.mil.aircraft = militaryAircraft.length;
        scanStats.mil.ok = true;
        console.log(`[TankersConnector] Fetched ${militaryAircraft.length} military aircraft from /mil endpoint`);
        
        // Filter for tanker aircraft (KC-135, KC-10, KC-46, etc.)
        const tankerTypes = ["KC-135", "KC-10", "KC-46", "KC-130", "KC-767", "KC-45", "KC-390"];
        const tankerAircraft = militaryAircraft.filter((ac: any) => {
          if (!ac) return false;
          const type = (ac.type || ac.t || "").toUpperCase();
          const flight = (ac.flight || ac.flight || ac.call || "").toUpperCase();
          const hex = (ac.hex || ac.icao || "").toUpperCase();
          
          // Check if it's a tanker by type, callsign, or hex code pattern
          const isTanker = 
            tankerTypes.some(t => type.includes(t.replace("-", ""))) ||
            flight.includes("KC") ||
            flight.includes("TANKER") ||
            flight.includes("TANK") ||
            (hex.startsWith("AE") && (type.includes("135") || type.includes("10") || type.includes("46"))); // US military hex codes
          
          return isTanker;
        });
        
        scanStats.mil.tankers = tankerAircraft.length;
        allTankers.push(...tankerAircraft);
        console.log(`[TankersConnector] Found ${tankerAircraft.length} tankers in global military feed`);
      } catch (e: any) {
        console.warn(`[TankersConnector] Failed to fetch from /mil endpoint:`, e.message);
      }

      // Strategy 2: Check Persian Gulf area (common refueling zone)
      // Persian Gulf center: ~26.0°N, 52.0°E
      try {
        const gulfLat = 26.0;
        const gulfLon = 52.0;
        const radiusNm = 250; // Max radius
        
        const gulfResponse = await axios.get(`${this.baseUrl}/point/${gulfLat}/${gulfLon}/${radiusNm}`, {
          timeout: 12000,
          headers: {
            'Accept': 'application/json'
          }
        });

        const gulfData = gulfResponse.data || {};
        let gulfAircraft: any[] = [];
        if (Array.isArray(gulfData)) {
          gulfAircraft = gulfData;
        } else if (Array.isArray(gulfData.ac)) {
          gulfAircraft = gulfData.ac;
        } else if (gulfData.ac && typeof gulfData.ac === 'object') {
          gulfAircraft = Object.values(gulfData.ac);
        }
        
        scanStats.gulf.aircraft = gulfAircraft.length;
        scanStats.gulf.ok = true;
        console.log(`[TankersConnector] Fetched ${gulfAircraft.length} aircraft from Persian Gulf area`);
        
        // Filter Gulf aircraft for tankers
        const tankerTypes = ["KC-135", "KC-10", "KC-46", "KC-130", "KC-767"];
        const gulfTankers = gulfAircraft.filter((ac: any) => {
          if (!ac) return false;
          const type = (ac.type || ac.t || "").toUpperCase();
          const flight = (ac.flight || ac.call || "").toUpperCase();
          const hex = (ac.hex || ac.icao || "").toUpperCase();
          
          const isTanker = 
            tankerTypes.some(t => type.includes(t.replace("-", ""))) ||
            flight.includes("KC") ||
            flight.includes("TANKER") ||
            flight.includes("TANK") ||
            (hex.startsWith("AE") && (type.includes("135") || type.includes("10") || type.includes("46")));
          
          return isTanker;
        });
        
        scanStats.gulf.tankers = gulfTankers.length;
        allTankers.push(...gulfTankers);
        console.log(`[TankersConnector] Found ${gulfTankers.length} tankers in Persian Gulf area`);
      } catch (e: any) {
        console.warn(`[TankersConnector] Failed to fetch from Persian Gulf area:`, e.message);
      }

      // Strategy 3: Check Eastern Mediterranean (alternative refueling zone)
      // Eastern Med: ~33.0°N, 35.0°E (near Cyprus)
      try {
        const medLat = 33.0;
        const medLon = 35.0;
        const radiusNm = 200;
        
        const medResponse = await axios.get(`${this.baseUrl}/point/${medLat}/${medLon}/${radiusNm}`, {
          timeout: 12000,
          headers: {
            'Accept': 'application/json'
          }
        });

        const medData = medResponse.data || {};
        let medAircraft: any[] = [];
        if (Array.isArray(medData)) {
          medAircraft = medData;
        } else if (Array.isArray(medData.ac)) {
          medAircraft = medData.ac;
        } else if (medData.ac && typeof medData.ac === 'object') {
          medAircraft = Object.values(medData.ac);
        }
        
        const tankerTypes = ["KC-135", "KC-10", "KC-46"];
        scanStats.med.aircraft = medAircraft.length;
        scanStats.med.ok = true;
        const medTankers = medAircraft.filter((ac: any) => {
          if (!ac) return false;
          const type = (ac.type || ac.t || "").toUpperCase();
          const flight = (ac.flight || ac.call || "").toUpperCase();
          return tankerTypes.some(t => type.includes(t.replace("-", ""))) ||
                 flight.includes("KC") ||
                 flight.includes("TANKER");
        });
        
        scanStats.med.tankers = medTankers.length;
        allTankers.push(...medTankers);
        console.log(`[TankersConnector] Found ${medTankers.length} tankers in Eastern Mediterranean`);
      } catch (e: any) {
        // Silent fail for optional endpoint
      }

      // Combine and deduplicate by hex code (ICAO 24-bit address)
      const uniqueTankers = Array.from(
        new Map(allTankers
          .filter(ac => ac && (ac.hex || ac.icao))
          .map((ac: any) => [ac.hex || ac.icao, ac])
        ).values()
      );

      const tankerCount = uniqueTankers.length;
      
      // Check if any API endpoint actually worked
      const anyEndpointWorked = scanStats.mil.ok || scanStats.gulf.ok || scanStats.med.ok;
      
      // If no endpoints worked, mark as unavailable
      if (!anyEndpointWorked) {
        console.warn(`[TankersConnector] All API endpoints failed silently, marking as unavailable`);
        return [
          this.makeEnvelope({
            source: this.config.name,
            confidence: 0,
            intensity: 0,
            timestamp: Date.now(),
            summary: `Military tanker data unavailable (all API endpoints failed)`,
            rawRef: {
              tankerCount: null, // null = unavailable
              surge: null,
              locations: [],
              searchAreas: ["Global Military", "Persian Gulf", "Eastern Mediterranean"],
              scanStats,
              fetchedAt: Date.now(),
              dataStatus: "unavailable",
              error: "All API endpoints failed"
            },
          }),
        ];
      }
      
      // Store for fallback
      this.lastCount = tankerCount;
      
      // Calculate intensity based on count (surge = 3+ tankers)
      const surge = tankerCount >= 3;
      // Higher confidence with more tankers, multiple search areas, and surge detection
      const confidence = Math.min(0.95,
        (surge ? 0.8 : tankerCount > 0 ? 0.6 : 0.5) + // Base confidence (0.5 for zero tankers = real data)
        (uniqueTankers.length > 3 ? 0.1 : 0) + // More unique tankers = higher confidence
        (tankerCount >= 5 ? 0.05 : 0) + // Very high count adds confidence
        (scanStats.mil.ok && scanStats.gulf.ok ? 0.1 : scanStats.mil.ok || scanStats.gulf.ok ? 0.05 : 0) // Multiple endpoints = higher confidence
      );
      // Calculate intensity directly from data - no artificial baseline
      const calculatedIntensity = tankerCount / 6; // Normalize to 0-1, 6+ = max
      const intensity = Math.min(1, Math.max(0, calculatedIntensity));
      
      const locations = uniqueTankers.map((ac: any) => ({
        hex: ac.hex || ac.icao,
        flight: ac.flight || ac.call,
        type: ac.type || ac.t,
        lat: ac.lat,
        lon: ac.lon,
        alt: ac.alt || ac.altitude
      }));
      
      console.log(`[TankersConnector] ✅ Real data: ${tankerCount} unique refueling aircraft detected (${surge ? 'SURGE' : 'normal'}) from ${(scanStats.mil.ok ? 1 : 0) + (scanStats.gulf.ok ? 1 : 0) + (scanStats.med.ok ? 1 : 0)} endpoint(s)`);
      
      return [
        this.makeEnvelope({
          source: this.config.name,
          confidence,
          intensity,
          timestamp: Date.now(),
          summary: `${tankerCount} refueling aircraft detected (KC-135/KC-10) in region${surge ? ' - SURGE DETECTED' : ''}`,
          rawRef: { 
            tankerCount, // 0 = zero tankers (real data), null = unavailable
            surge,
            locations: locations.slice(0, 10), // Top 10 for reference
            searchAreas: ["Global Military", "Persian Gulf", "Eastern Mediterranean"],
            scanStats,
            fetchedAt,
            dataStatus: "live" // Mark as live since at least one endpoint worked
          },
        }),
      ];
    } catch (error: any) {
      // Do not simulate - return unavailable status
      console.warn(`[TankersConnector] All API endpoints failed, returning unavailable status:`, error.message);
      return [
        this.makeEnvelope({
          source: this.config.name,
          confidence: 0,
          intensity: 0,
          timestamp: Date.now(),
          summary: `Military tanker data unavailable (all API endpoints failed)`,
          rawRef: {
            tankerCount: null, // null = unavailable, 0 = zero tankers detected
            surge: null,
            locations: [],
            searchAreas: ["Global Military", "Persian Gulf", "Eastern Mediterranean"],
            scanStats: {
              mil: { aircraft: null, tankers: null, ok: false },
              gulf: { aircraft: null, tankers: null, ok: false },
              med: { aircraft: null, tankers: null, ok: false },
            },
            fetchedAt: Date.now(),
            dataStatus: "unavailable",
            error: error?.message || "All API endpoints failed"
          },
        }),
      ];
    }
  }
}
