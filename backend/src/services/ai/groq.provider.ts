import Groq from "groq-sdk";
import { AIProvider } from "./ai.provider.interface";

export class GroqProvider implements AIProvider {
  private groq: Groq;
  private defaultModel = "llama-3.3-70b-versatile";

  constructor() {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not defined in environment variables");
    }
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  async generateSQL(schema: string, query: string): Promise<string> {
    const prompt = `
You are a strict SQL query generator for a PostgreSQL database. 
You must ONLY output valid SQL. Do not include markdown formatting, explanations, or comments.
Only output SELECT queries. Never use INSERT, UPDATE, DELETE, DROP, or ALTER.

Here is the database schema:
${schema}

User Query: "${query}"
`;

    const chatCompletion = await this.groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: this.defaultModel,
      temperature: 0.1, // low temperature for determinism
    });

    return chatCompletion.choices[0]?.message?.content || "";
  }

  async generateAnswer(query: string, rawData: unknown[]): Promise<string> {
    const prompt = `
You are a helpful data analyst. The user asked a question, and the exact database results are provided below in JSON format.
Your job is to answer the user's question concisely, using ONLY the data provided.
Do not invent or hypothesize data. If the data is empty, say no data was found.

User Query: "${query}"

Database Results:
${JSON.stringify(rawData, null, 2)}
`;

    const chatCompletion = await this.groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: this.defaultModel,
      temperature: 0.3,
    });

    return chatCompletion.choices[0]?.message?.content || "";
  }
}
