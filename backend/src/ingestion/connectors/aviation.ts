import { BaseConnector } from "./base";
import { SignalEnvelope } from "../../shared/types";
import axios from "axios";

export class AviationConnector extends BaseConnector {
  private lastAircraft = 50;
  private apiKey = process.env.AVIATIONSTACK_API_KEY || "c0da84cd35719bb1930754e7f32ab9fa";
  private baseUrl = "https://api.aviationstack.com/v1";
  private adsbBaseUrl = "https://api.adsb.lol/v2";
  private historicalCounts: number[] = []; // Store last 30 days of flight counts for baseline calculation
  private readonly BASELINE_WINDOW_DAYS = 7; // Use 7 days for baseline calculation
  private lastEnvelope: SignalEnvelope[] | null = null;
  private lastFetchedAt = 0;
  private readonly minIntervalMs = 5 * 60 * 1000;

  async fetchSignals(): Promise<SignalEnvelope[]> {
    const now = Date.now();
    if (this.lastEnvelope && now - this.lastFetchedAt < this.minIntervalMs) {
      return this.lastEnvelope;
    }
    // Try to fetch real aircraft data from Aviationstack
    try {
      // Also fetch aircraft currently over Iran via ADS-B (more precise for airspace)
      const overIranResult = await this.fetchOverIranAircraft();
      const overIranCount = overIranResult.commercial.length;
      const overIranMilitaryCount = overIranResult.military.length;

      // Iran major airports: IKA (Tehran), SYZ (Shiraz), MHD (Mashhad), TBZ (Tabriz)
      // Search for flights to/from Iran airports
      const iranAirports = ["IKA", "SYZ", "MHD", "TBZ", "THR", "IFN", "AWZ", "BND"];
      const groundResult = await this.fetchAirportGroundAircraft(iranAirports);
      
      // Get flights arriving at or departing from Iran airports
      const allFlights: any[] = [];
      
      // Try to get flights for major Iran airports
      for (const airport of iranAirports.slice(0, 3)) { // Limit to 3 airports to avoid rate limits
        try {
          const response = await axios.get(`${this.baseUrl}/flights`, {
            params: {
              access_key: this.apiKey,
              arr_iata: airport, // Arriving flights
              flight_status: "active", // Only active flights
              limit: 100
            },
            timeout: 10000
          });

          const data = response.data || {};
          const flights = data.data || [];
          
          // Filter for commercial flights (exclude military)
          const commercialFlights = flights.filter((flight: any) => {
            const airline = (flight.airline?.iata || "").toUpperCase();
            const flightNumber = (flight.flight?.iata || "").toUpperCase();
            
            // Exclude military indicators
            const isMilitary = 
              airline.startsWith("RCH") || // Reach (military cargo)
              airline.startsWith("AF") || // Air Force
              flightNumber.includes("MIL") ||
              flightNumber.includes("NAVY");
            
            return !isMilitary && flight.flight?.iata;
          });
          
          allFlights.push(...commercialFlights);
        } catch (err: any) {
          // Continue with other airports if one fails
          console.warn(`[AviationConnector] Failed to fetch for ${airport}:`, err.message);
        }
      }

      // Also try flights departing from Iran
      for (const airport of iranAirports.slice(0, 2)) {
        try {
          const response = await axios.get(`${this.baseUrl}/flights`, {
            params: {
              access_key: this.apiKey,
              dep_iata: airport, // Departing flights
              flight_status: "active",
              limit: 100
            },
            timeout: 10000
          });

          const data = response.data || {};
          const flights = data.data || [];
          
          const commercialFlights = flights.filter((flight: any) => {
            const airline = (flight.airline?.iata || "").toUpperCase();
            const flightNumber = (flight.flight?.iata || "").toUpperCase();
            
            const isMilitary = 
              airline.startsWith("RCH") ||
              airline.startsWith("AF") ||
              flightNumber.includes("MIL") ||
              flightNumber.includes("NAVY");
            
            return !isMilitary && flight.flight?.iata;
          });
          
          allFlights.push(...commercialFlights);
        } catch (err: any) {
          console.warn(`[AviationConnector] Failed to fetch departures for ${airport}:`, err.message);
        }
      }

      // Remove duplicates based on flight number
      const uniqueFlights = Array.from(
        new Map(allFlights.map((f: any) => [f.flight?.iata || f.flight?.number, f])).values()
      );

      const aircraftOverIran = uniqueFlights.length;
      
      // Store detailed flight information for analysis
      const flightDetails = uniqueFlights.slice(0, 20).map((flight: any) => ({
        flightNumber: flight.flight?.iata || flight.flight?.number || "N/A",
        airline: flight.airline?.name || flight.airline?.iata || "Unknown",
        airlineCode: flight.airline?.iata || "N/A",
        departure: {
          airport: flight.departure?.airport || flight.departure?.iata || "N/A",
          city: flight.departure?.city || "N/A",
          time: flight.departure?.scheduled || "N/A"
        },
        arrival: {
          airport: flight.arrival?.airport || flight.arrival?.iata || "N/A",
          city: flight.arrival?.city || "N/A",
          time: flight.arrival?.scheduled || "N/A"
        },
        status: flight.flight_status || "unknown",
        aircraft: flight.aircraft?.iata || flight.aircraft?.registration || "N/A"
      }));
      
      // Group by airline for summary
      const byAirline: Record<string, number> = {};
      uniqueFlights.forEach((f: any) => {
        const airline = f.airline?.name || f.airline?.iata || "Unknown";
        byAirline[airline] = (byAirline[airline] || 0) + 1;
      });
      
      // Group by airport
      const byAirport: Record<string, { arrivals: number; departures: number }> = {};
      uniqueFlights.forEach((f: any) => {
        const dep = f.departure?.iata || "N/A";
        const arr = f.arrival?.iata || "N/A";
        if (!byAirport[dep]) byAirport[dep] = { arrivals: 0, departures: 0 };
        if (!byAirport[arr]) byAirport[arr] = { arrivals: 0, departures: 0 };
        byAirport[dep].departures++;
        byAirport[arr].arrivals++;
      });
      
      // Store for baseline calculation
      this.lastAircraft = aircraftOverIran;
      this.historicalCounts.push(aircraftOverIran);
      // Keep only last 30 days of data (assuming ~4 updates per hour = 96 per day)
      if (this.historicalCounts.length > 30 * 96) {
        this.historicalCounts.shift();
      }
      
      // Calculate baseline from historical data (last 7 days average)
      // If we don't have enough data, use default baseline (typical daily flights to/from Iran)
      const DEFAULT_BASELINE = 120; // Typical daily commercial flights to/from Iran airports
      const baselineWindow = Math.min(this.historicalCounts.length, this.BASELINE_WINDOW_DAYS * 96);
      let baseline: number;
      if (baselineWindow >= 24) { // At least 1 day of data
        const recentCounts = this.historicalCounts.slice(-baselineWindow);
        const avgBaseline = recentCounts.reduce((a, b) => a + b, 0) / recentCounts.length;
        // Use historical average if we have meaningful data, otherwise fall back to default
        baseline = avgBaseline > 0 ? avgBaseline : DEFAULT_BASELINE;
      } else {
        // Not enough historical data - use default baseline
        baseline = DEFAULT_BASELINE;
      }
      
      // Combine Aviationstack data (to/from airports) with ADS-B data (over airspace)
      // Use the higher of the two as the primary count, or sum them for better coverage
      const totalAircraftCount = Math.max(aircraftOverIran, overIranCount);
      
      // Calculate drop ratio: if current is much lower than baseline, that's a risk signal
      const dropRatio = baseline > 0 ? Math.max(0, Math.min(1, (baseline - totalAircraftCount) / baseline)) : 0;
      // Higher confidence with more data points and Aviationstack reliability
      const confidence = Math.min(0.95, 
        0.7 + // Base confidence for Aviationstack
        (uniqueFlights.length > 10 ? 0.1 : uniqueFlights.length > 5 ? 0.05 : 0) + // More flights = more reliable
        (dropRatio > 0.5 ? 0.1 : 0) + // Significant drop adds confidence
        (overIranCount > 0 ? 0.05 : 0) // ADS-B data adds confidence
      );
      const intensity = dropRatio; // 1 == near empty sky (high risk indicator)
      
      console.log(`[AviationConnector] Real data (Aviationstack): ${aircraftOverIran} civil flights to/from Iran, ${overIranCount} over Iran airspace (${allFlights.length} total, ${uniqueFlights.length} unique), baseline: ${baseline.toFixed(1)}, dropRatio: ${dropRatio.toFixed(3)}, intensity: ${intensity.toFixed(3)}`);
      
      const envelope = [
        this.makeEnvelope({
          source: this.config.name,
          confidence,
          intensity,
          timestamp: Date.now(),
          summary: `${aircraftOverIran} to/from Iran airports; ${overIranCount} over Iran airspace; baseline ${baseline.toFixed(0)}`,
          rawRef: { 
            aircraftOverIran,
            totalAircraftCount: totalAircraftCount,
            overIranCount,
            baseline, 
            dropRatio,
            totalFlights: allFlights.length,
            uniqueFlights: uniqueFlights.length,
            airports: iranAirports.slice(0, 5),
            flightDetails: flightDetails,
            byAirline: byAirline,
            byAirport: byAirport,
            overIranSample: overIranResult.commercial.slice(0, 10),
            overIranMilitaryCount,
            overIranMilitarySample: overIranResult.military.slice(0, 10),
            groundCount: groundResult.total,
            groundMilitaryCount: groundResult.military,
            groundByAirport: groundResult.byAirport,
            groundSample: groundResult.sample,
            dataStatus: "live",
            dataSource: {
              aviationstack: "ok",
              adsbOverIran: overIranCount + overIranMilitaryCount > 0 ? "ok" : "empty",
              adsbGround: groundResult.total > 0 ? "ok" : "empty",
            }
          },
        }),
      ];
      this.lastEnvelope = envelope;
      this.lastFetchedAt = now;
      return envelope;
    } catch (error: any) {
      // Do not simulate - return "unavailable" status with real ADS-B data only
      console.warn(`[AviationConnector] Aviationstack API failed, returning unavailable status with ADS-B data only:`, error.message);
      const iranAirports = ["IKA", "SYZ", "MHD", "TBZ", "THR", "IFN", "AWZ", "BND"];
      const overIranResult = await this.fetchOverIranAircraft();
      const overIranCount = overIranResult.commercial.length;
      const overIranMilitaryCount = overIranResult.military.length;
      const groundResult = await this.fetchAirportGroundAircraft(iranAirports);

      const envelope = [
        this.makeEnvelope({
          source: this.config.name,
          confidence: 0,
          intensity: 0,
          timestamp: Date.now(),
          summary: `Civil aviation data unavailable (Aviationstack)`,
          rawRef: {
            aircraftOverIran: null,
            baseline: null,
            dropRatio: null,
            overIranCount,
            overIranMilitaryCount,
            overIranSample: overIranResult.commercial.slice(0, 10),
            overIranMilitarySample: overIranResult.military.slice(0, 10),
            groundCount: groundResult.total,
            groundMilitaryCount: groundResult.military,
            groundByAirport: groundResult.byAirport,
            groundSample: groundResult.sample,
            dataStatus: "unavailable",
            dataSource: {
              aviationstack: "error",
              adsbOverIran: overIranCount + overIranMilitaryCount > 0 ? "ok" : "empty",
              adsbGround: groundResult.total > 0 ? "ok" : "empty",
            },
            error: error?.message || "Unknown error",
          },
        }),
      ];
      this.lastEnvelope = envelope;
      this.lastFetchedAt = now;
      return envelope;
    }
  }

  // Simulation removed - all data must be real or unavailable

  private async fetchAirportGroundAircraft(airports: string[]): Promise<{
    total: number;
    military: number;
    byAirport: Record<string, { total: number; military: number }>;
    sample: Array<{ airport: string; flight: string; type: string; alt: number | null }>;
  }> {
    // Approximate coords for major Iran airports
    const airportCoords: Record<string, { lat: number; lon: number }> = {
      IKA: { lat: 35.4161, lon: 51.1522 }, // Tehran Imam Khomeini
      THR: { lat: 35.6892, lon: 51.3130 }, // Tehran Mehrabad
      SYZ: { lat: 29.5390, lon: 52.5890 }, // Shiraz
      MHD: { lat: 36.2352, lon: 59.6410 }, // Mashhad
      TBZ: { lat: 38.1339, lon: 46.2350 }, // Tabriz
      IFN: { lat: 32.7508, lon: 51.8613 }, // Isfahan
      AWZ: { lat: 31.3375, lon: 48.7619 }, // Ahvaz
      BND: { lat: 27.2183, lon: 56.3778 }, // Bandar Abbas
    };
    const targets = airports.filter((a) => airportCoords[a]).slice(0, 5);
    const byAirport: Record<string, { total: number; military: number }> = {};
    const sample: Array<{ airport: string; flight: string; type: string; alt: number | null }> = [];

    const requests = targets.map(async (code) => {
      const { lat, lon } = airportCoords[code];
      try {
        const response = await axios.get(`${this.adsbBaseUrl}/point/${lat}/${lon}/40`, {
          timeout: 12000,
          headers: { Accept: "application/json" },
        });
        const data = response.data || {};
        let aircraft: any[] = [];
        if (Array.isArray(data)) {
          aircraft = data;
        } else if (Array.isArray(data.ac)) {
          aircraft = data.ac;
        } else if (data.ac && typeof data.ac === "object") {
          aircraft = Object.values(data.ac);
        }

        const onGround = aircraft.filter((ac: any) => {
          const alt = ac.alt || ac.altitude;
          const gs = ac.gs || ac.speed;
          const gnd = ac.gnd === true;
          return gnd || (typeof alt === "number" && alt < 1500) || (typeof gs === "number" && gs < 60);
        });

        const military = onGround.filter((ac: any) => {
          const type = (ac.type || ac.t || "").toUpperCase();
          const flight = (ac.flight || ac.call || "").toUpperCase();
          const hex = (ac.hex || ac.icao || "").toUpperCase();
          return (
            flight.includes("KC") ||
            flight.includes("TANK") ||
            flight.includes("RCH") ||
            flight.includes("AF") ||
            type.includes("KC-") ||
            type.includes("C-17") ||
            type.includes("C-130") ||
            hex.startsWith("AE")
          );
        });

        byAirport[code] = { total: onGround.length, military: military.length };
        onGround.slice(0, 3).forEach((ac: any) => {
          if (sample.length < 10) {
            sample.push({
              airport: code,
              flight: ac.flight || ac.call || "N/A",
              type: ac.type || ac.t || "Unknown",
              alt: typeof ac.alt === "number" ? ac.alt : typeof ac.altitude === "number" ? ac.altitude : null,
            });
          }
        });
      } catch (error: any) {
        console.warn(`[AviationConnector] ADS-B ground fetch failed for ${code}:`, error.message);
        byAirport[code] = { total: 0, military: 0 };
      }
    });

    await Promise.all(requests);

    const totals = Object.values(byAirport).reduce(
      (acc, cur) => {
        acc.total += cur.total;
        acc.military += cur.military;
        return acc;
      },
      { total: 0, military: 0 }
    );

    return {
      total: totals.total,
      military: totals.military,
      byAirport,
      sample,
    };
  }

  private async fetchOverIranAircraft(): Promise<{ commercial: any[]; military: any[] }> {
    // Iran airspace approximation: center 32.0N, 53.0E, radius 450nm
    const lat = 32.0;
    const lon = 53.0;
    const radiusNm = 450;
    try {
      const response = await axios.get(`${this.adsbBaseUrl}/point/${lat}/${lon}/${radiusNm}`, {
        timeout: 12000,
        headers: { Accept: "application/json" },
      });
      const data = response.data || {};
      let aircraft: any[] = [];
      if (Array.isArray(data)) {
        aircraft = data;
      } else if (Array.isArray(data.ac)) {
        aircraft = data.ac;
      } else if (data.ac && typeof data.ac === "object") {
        aircraft = Object.values(data.ac);
      }

      // Split into military vs commercial/civil aircraft
      const militaryAircraft = aircraft.filter((ac: any) => {
        if (!ac) return false;
        const type = (ac.type || ac.t || "").toUpperCase();
        const flight = (ac.flight || ac.call || "").toUpperCase();
        const hex = (ac.hex || ac.icao || "").toUpperCase();

        return (
          flight.includes("KC") ||
          flight.includes("TANK") ||
          flight.includes("RCH") ||
          flight.includes("AF") ||
          type.includes("KC-") ||
          type.includes("C-17") ||
          type.includes("C-130") ||
          hex.startsWith("AE")
        );
      });

      const commercialAircraft = aircraft.filter((ac: any) => !militaryAircraft.includes(ac));

      // Deduplicate by hex/icao
      const uniqueCommercial = Array.from(
        new Map(
          commercialAircraft
            .filter((ac: any) => ac && (ac.hex || ac.icao))
            .map((ac: any) => [ac.hex || ac.icao, ac])
        ).values()
      );

      const uniqueMilitary = Array.from(
        new Map(
          militaryAircraft
            .filter((ac: any) => ac && (ac.hex || ac.icao))
            .map((ac: any) => [ac.hex || ac.icao, ac])
        ).values()
      );

      const mapAircraft = (ac: any) => ({
        hex: ac.hex || ac.icao,
        flight: ac.flight || ac.call || "N/A",
        type: ac.type || ac.t || "Unknown",
        lat: ac.lat,
        lon: ac.lon,
        alt: ac.alt || ac.altitude,
      });

      return {
        commercial: uniqueCommercial.map(mapAircraft),
        military: uniqueMilitary.map(mapAircraft),
      };
    } catch (error: any) {
      console.warn(`[AviationConnector] ADS-B over-Iran fetch failed:`, error.message);
      return { commercial: [], military: [] };
    }
  }
}
