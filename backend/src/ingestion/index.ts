import { AviationConnector } from "./connectors/aviation";
import { NewsConnector } from "./connectors/news";
import { WeatherConnector } from "./connectors/weather";
import { MarketsConnector } from "./connectors/markets";
import { CustomConnector } from "./connectors/custom";
import { PublicInterestConnector } from "./connectors/publicInterest";
import { TankersConnector } from "./connectors/tankers";
import { PizzaConnector } from "./connectors/pizza";
import { SignalEnvelope } from "../shared/types";

const connectors = [
  new NewsConnector({ name: "news-intel", signalType: "newsIntel" }),
  new PublicInterestConnector({ name: "public-interest", signalType: "publicInterest" }),
  new AviationConnector({ name: "civil-aviation", signalType: "civilAviation" }),
  new TankersConnector({ name: "tankers", signalType: "militaryTankers" }),
  new MarketsConnector({ name: "markets", signalType: "markets" }),
  new PizzaConnector({ name: "pizza-meter", signalType: "pizza" }),
  new WeatherConnector({ name: "weather", signalType: "weather" }),
  new CustomConnector(),
];

export async function collectSignals(): Promise<SignalEnvelope[]> {
  const results = await Promise.all(
    connectors.map(async (c) => {
      const signals = await c.fetchSignals();
      return signals;
    })
  );
  return results.flat();
}
