import { BaseConnector } from "./base";
import { SignalEnvelope } from "../../shared/types";
import axios from "axios";

export class WeatherConnector extends BaseConnector {
  private lastVisibility = 10;
  private lastCloudCover = 0.2;
  private apiKey = process.env.OPENWEATHER_API_KEY || "368a8727b3d3711cdf91e933181130f7";
  private baseUrl = "https://api.openweathermap.org/data/2.5/weather";

  async fetchSignals(): Promise<SignalEnvelope[]> {
    // Try to fetch real weather data from OpenWeatherMap
    try {
      // Tehran coordinates: 35.6892°N, 51.3890°E
      const response = await axios.get(this.baseUrl, {
        params: {
          lat: 35.6892,
          lon: 51.3890,
          appid: this.apiKey,
          units: "metric"
        },
        timeout: 5000
      });

      const data = response.data;
      
      // Extract visibility (in meters, convert to km)
      const visibilityMeters = data.visibility || 10000;
      const visibilityKm = visibilityMeters / 1000;
      
      // Extract cloud cover (percentage 0-100, convert to 0-1)
      const cloudCover = (data.clouds?.all || 0) / 100;
      
      // Store for fallback
      this.lastVisibility = visibilityKm;
      this.lastCloudCover = cloudCover;
      
      // Weather is an inverse indicator: good weather = lower strike risk, bad weather = higher risk (operational delay)
      // But we want to show: good weather = low intensity (0.05), bad weather = higher intensity (0.15-0.3)
      const favorable = visibilityKm >= 8 && cloudCover <= 0.5;
      const confidence = 0.85; // High confidence with real weather data
      // Good weather = low intensity (0.05), bad weather = higher intensity based on how bad
      const intensity = favorable 
        ? 0.05 // Good weather = low risk indicator
        : Math.min(0.3, 0.1 + (1 - visibilityKm / 10) * 0.1 + cloudCover * 0.1); // Bad weather = higher risk
      
      console.log(`[WeatherConnector] Real data: ${visibilityKm.toFixed(1)}km visibility, ${(cloudCover * 100).toFixed(0)}% clouds`);
      
      return [
        this.makeEnvelope({
          source: this.config.name,
          confidence,
          intensity,
          timestamp: Date.now(),
          summary: `Visibility ${visibilityKm.toFixed(1)}km, cloud cover ${(cloudCover * 100).toFixed(0)}%`,
          rawRef: { 
            visibilityKm: Math.round(visibilityKm * 10) / 10, 
            cloudCover: Math.round(cloudCover * 100) / 100,
            temperature: data.main?.temp,
            humidity: data.main?.humidity,
            windSpeed: data.wind?.speed
          },
        }),
      ];
    } catch (error: any) {
      // Do not simulate - return unavailable status
      if (error.response?.status === 401) {
        console.warn(`[WeatherConnector] API key not activated yet (401), returning unavailable status. Will work once key is active.`);
      } else {
        console.warn(`[WeatherConnector] API failed, returning unavailable status:`, error.message);
      }
      return [
        this.makeEnvelope({
          source: this.config.name,
          confidence: 0,
          intensity: 0,
          timestamp: Date.now(),
          summary: `Weather data unavailable (OpenWeatherMap API failed)`,
          rawRef: {
            visibilityKm: null, // null = unavailable (already correct)
            cloudCover: null, // null = unavailable (already correct)
            dataStatus: "unavailable",
            error: error?.message || "API error"
          },
        }),
      ];
    }
  }
}
