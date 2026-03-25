export interface AIProvider {
  /**
   * Generates SQL based on the user's natural language query and the database schema.
   * Expected to return purely the SQL string.
   */
  generateSQL(schema: string, query: string): Promise<string>;

  /**
   * Generates a concise human-readable answer based on raw DB result data.
   */
  generateAnswer(query: string, rawData: unknown[]): Promise<string>;
}
