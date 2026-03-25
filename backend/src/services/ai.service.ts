import { AIFactory, ProviderType } from "./ai/ai.factory";
import { AIProvider } from "./ai/ai.provider.interface";

// The schema is static but should represent the domain 
const SCHEMA = `
You must explicitly quote the table names and prefix them with the "graph_query" schema.
You MUST also explicitly quote ALL column names in double quotes, because Postgres is case-sensitive (e.g. "orderId" will fail if unquoted as "orderid").
Example: SELECT count(*) FROM "graph_query"."Customer" WHERE "addressId" = '123';

If a user asks to trace a "given" document but doesn't provide an ID, do NOT add a WHERE clause filtering by a fake ID. Instead, provide a generic join across the relevant tables. LIMIT your results to 50.

model Customer (id String, name String, email String, phone String?, addressId String)
model Address (id String, street String, city String, state String?, country String?, postalCode String?)
model Product (id String, name String, sku String, price Float)
model Order (id String, customerId String, status String, totalAmount Float, createdAt DateTime)
model OrderItem (id String, orderId String, productId String, quantity Int, price Float)
model Delivery (id String, orderId String, addressId String, createdAt DateTime)
model Invoice (id String, deliveryId String, amount Float, createdAt DateTime)
model Payment (id String, invoiceId String, amount Float, status String, createdAt DateTime)

// Relationships
Customer (addressId) -> Address (id)
Order (customerId) -> Customer (id)
OrderItem (orderId) -> Order (id)
OrderItem (productId) -> Product (id)
Delivery (orderId) -> Order (id)
Delivery (addressId) -> Address (id)
Invoice (deliveryId) -> Delivery (id)
Payment (invoiceId) -> Invoice (id)
`;

export class AIService {
  private primaryProvider: AIProvider;
  private fallbackProvider: AIProvider;

  constructor() {
    this.primaryProvider = AIFactory.createProvider("gemini");
    // Optionally default fallback to groq, but it requires an API key which might be missing.
    // If it throws, fallback is handled gracefully without breaking instantiation.
    try {
      this.fallbackProvider = AIFactory.createProvider("groq");
    } catch {
      this.fallbackProvider = this.primaryProvider;
    }
  }

  public async generateSQL(query: string): Promise<string> {
    try {
      const rawSql = await this.primaryProvider.generateSQL(SCHEMA, query);
      return this.cleanSQL(rawSql);
    } catch (error) {
      console.warn("Primary AI Provider failed generating SQL. Trying fallback...", (error as Error).message);
      const rawSql = await this.fallbackProvider.generateSQL(SCHEMA, query);
      return this.cleanSQL(rawSql);
    }
  }

  public async generateAnswer(query: string, rawData: unknown[]): Promise<string> {
    try {
      return await this.primaryProvider.generateAnswer(query, rawData);
    } catch (error) {
      console.warn("Primary AI Provider failed generating Answer. Trying fallback...", (error as Error).message);
      return await this.fallbackProvider.generateAnswer(query, rawData);
    }
  }

  private cleanSQL(str: string): string {
    // Strip markdown wrappers like \`\`\`sql ... \`\`\`
    let clean = str.replace(/```sql/gi, "").replace(/```/g, "").trim();
    // In case the model responds with text before/after the SQL:
    const selectIdx = clean.toUpperCase().indexOf("SELECT ");
    if (selectIdx >= 0) {
       clean = clean.substring(selectIdx);
    }
    // Cut off anything after concluding semi-colon (to prevent execution of additional rogue text if model didn't stop properly)
    const endIdx = clean.indexOf(";");
    if (endIdx > 0) {
      clean = clean.substring(0, endIdx + 1);
    }
    // Remove rogue trailing parenthesis if it exists before semicolon and no matching open parenthesis
    clean = clean.replace(/\);?\s*$/, ";");
    return clean;
  }
}
