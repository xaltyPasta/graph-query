import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIProvider } from "./ai.provider.interface";

export class GeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI;
  private defaultModel = "gemini-2.5-pro";

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not defined in environment variables");
    }
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  async generateSQL(schema: string, query: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: this.defaultModel });

    const prompt = `
You are a strict SQL query generator for a PostgreSQL database. 
You must ONLY output valid SQL. Do not include markdown formatting, explanations, or comments.
Only output SELECT queries. Never use INSERT, UPDATE, DELETE, DROP, or ALTER.

Here is the database schema:
${schema}

User Query: "${query}"
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1, // low temperature for determinism
      },
    });

    return result.response.text();
  }

  async generateAnswer(query: string, rawData: unknown[]): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: this.defaultModel });

    const prompt = `
You are a helpful data analyst. The user asked a question, and the exact database results are provided below in JSON format.
Your job is to answer the user's question concisely, using ONLY the data provided.
Do not invent or hypothesize data. If the data is empty, say no data was found.

User Query: "${query}"

Database Results:
${JSON.stringify(rawData, null, 2)}
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
      },
    });

    return result.response.text();
  }
}
