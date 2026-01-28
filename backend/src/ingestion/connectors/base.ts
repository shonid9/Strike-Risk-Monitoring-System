import axios from "axios";
import { SignalEnvelope, SignalType } from "../../shared/types";
import { v4 as uuid } from "uuid";

export interface ConnectorConfig {
  name: string;
  signalType: SignalType;
  endpoint?: string;
  apiKey?: string;
}

export abstract class BaseConnector {
  constructor(protected readonly config: ConnectorConfig) {}

  protected async safeGet(url: string, params?: Record<string, unknown>) {
    try {
      const res = await axios.get(url, { params, timeout: 5000 });
      return res.data;
    } catch (err) {
      // In production replace with structured logger
      console.error(`[connector:${this.config.name}] fetch failed`, err);
      return null;
    }
  }

  protected makeEnvelope(partial: Omit<SignalEnvelope, "id" | "signalType">): SignalEnvelope {
    return {
      ...partial,
      id: uuid(),
      signalType: this.config.signalType,
    };
  }

  abstract fetchSignals(): Promise<SignalEnvelope[]>;
}
