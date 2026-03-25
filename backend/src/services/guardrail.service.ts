export class GuardrailService {
  private allowedKeywords = [
    "customer", "order", "product", "delivery", "invoice", "payment", "address",
    "location", "sku", "price", "amount", "status", "quantity", "email", "phone",
    "street", "city", "postal", "date", "total", "revenue", "how many", "who", "what"
  ];
  
  private prohibitedSqlKeywords = [
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "REPLACE", 
    "GRANT", "REVOKE", "COMMIT", "ROLLBACK", "EXEC", "EXECUTE"
  ];

  /**
   * Evaluates natural language query string to make sure it relates to the domain.
   */
  public validateNLQuery(query: string): { safe: boolean; reason?: string } {
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return { safe: false, reason: "Query cannot be empty." };
    }

    const lower = query.toLowerCase();
    
    // Check for clearly malicious attempts to inject SQL logic right at the prompt
    if (this.prohibitedSqlKeywords.some((word) => lower.includes(word.toLowerCase() + " "))) {
      return { safe: false, reason: "Prompt manipulation detected. Queries must not contain database modification commands." };
    }

    // Heuristics: requires at least one domain keyword to prevent LLM hallucinating about unrelated topics
    const hasDomainKeyword = this.allowedKeywords.some((kw) => lower.includes(kw));
    if (!hasDomainKeyword) {
      return { 
        safe: false, 
        reason: "The system only supports dataset-related queries (orders, customers, deliveries, invoices, etc.)." 
      };
    }

    return { safe: true };
  }

  /**
   * Sanitizes and checks explicitly that LLM generated SQL strictly performs safe read-only operations.
   */
  public validateSQL(sql: string): { safe: boolean; reason?: string } {
    const uppercaseSql = sql.toUpperCase();

    // Must be a SELECT or WITH (for CTEs)
    if (!uppercaseSql.trimStart().startsWith("SELECT") && !uppercaseSql.trimStart().startsWith("WITH")) {
      return { safe: false, reason: "Generated SQL must be a SELECT statement." };
    }

    // Must not contain prohibited mutation words
    for (const prohibited of this.prohibitedSqlKeywords) {
      // Look for word boundaries to prevent matching "DROPPED" inside a string or field alias
      const regex = new RegExp(`\\b${prohibited}\\b`, "i");
      if (regex.test(uppercaseSql)) {
        return { safe: false, reason: `Generated SQL contains prohibited keyword: ${prohibited}` };
      }
    }

    // Must not contain multi-statement semicolons followed by non-whitespace
    // (a single terminating semicolon is fine)
    const normalized = uppercaseSql.trim();
    const semicolonIdx = normalized.indexOf(";");
    if (semicolonIdx !== -1 && semicolonIdx !== normalized.length - 1) {
      return { safe: false, reason: "Generated SQL contains multiple statements, which is prohibited." };
    }

    return { safe: true };
  }
}
