import { AIProvider } from "./ai.provider.interface";
import { GeminiProvider } from "./gemini.provider";
import { GroqProvider } from "./groq.provider";

export type ProviderType = "gemini" | "groq";

export class AIFactory {
  static createProvider(type: ProviderType = "gemini"): AIProvider {
    switch (type) {
      case "gemini":
        return new GeminiProvider();
      case "groq":
        return new GroqProvider();
      default:
        throw new Error(`Unsupported AI provider: ${type}`);
    }
  }
}
