# 📊 Graph Query System (Order-to-Cash)

A high-performance natural language query interface designed to visualize and traverse relational Order-to-Cash data as an interactive graph. The platform is engineered as a secure, fast, full-stack monorepo. Complex financial flows—Customer → Order → Delivery → Invoice → Payment—are projected natively from PostgreSQL into an interactive 2D graph topology, without the infrastructure overhead of a dedicated Graph DB.

### 🔗 Live Demo: [Frontend Placeholder] | [Backend Placeholder]

### 📸 Screenshots

![alt text](image.png)
![alt text](image-1.png)
![alt text](image-2.png)
---

## ✨ Features

👩‍💼 **Analytics / User Console**
- **Natural Language Search:** Query intricate relational data natively in English (e.g., "Trace complete order flow for Order X").
- **Live Flow Tracing:** Translates results into visual paths, dynamically highlighting all relational nodes and traversed edges.
- **Node Introspection:** Click any node (e.g., Customer, Payment) to view deep metadata properties instantly.
- **Dynamic Exploration:** Interact with a rich `react-force-graph-2d` physics-engine layout for intuitive data relationship discovery.

⚙️ **System Architecture & LLM Mechanics**
- **Zero-Shot Prompting Pipeline:** The system statically injects your relational Prisma schema into an LLM (Gemini or Groq) context layer to synthesize valid, deterministic PostgreSQL logic.
- **Dual-Layered Hallucination Prevention:** The first pass strictly extracts SQL logic (`temperature: 0.1`); the second pass acts as an analyst converting JSON tuples back into conversational responses (`temperature: 0.3`).
- **Dynamic Projection Layer:** Bypasses sync issues between SQL and Graph databases (like Neo4j) by calculating graph edges dynamically at the Express request layer. 
- **Strict Guardrails:** Blocks malicious inputs (`UPDATE`, `DROP`) at the middleware, and mandates domain-keyword bounds for processing.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React, Next.js, TypeScript, TailwindCSS, react-force-graph-2d |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL |
| **Data Layer** | Prisma ORM |
| **Generative AI** | Google Gemini API, Groq SDK |
| **Validation** | Zod (Data payloads) |
| **Deployment** | Vercel (Client) & Render (Backend Service) |

---

## 📁 Monorepo Structure

```text
graph-query-system/
│
├── frontend/
│   ├── app/                   # Next.js App Router specific pages
│   ├── components/            # React UI components (Graph rendering, chat overlays)
│   ├── lib/
│   │   └── api.ts             # API Service logic handling query execution & graph parsing
│   ├── package.json
│   └── .env
│
├── backend/
│   ├── src/
│   │   ├── controllers/       # HTTP Request management
│   │   ├── services/          
│   │   │   ├── ai/            # Gemini & Groq LLM integration providers
│   │   │   ├── guardrail.service.ts # Traffic sanitization, domain keyword verity
│   │   │   ├── graph.service.ts     # Dynamic dynamic projection of nodes/edges
│   │   │   └── query.service.ts     # Core LLM prompt pipeline orchestrator
│   │   ├── etl/               # Database seed scripts and CSV processors
│   │   ├── index.ts           # Express App initialization and Route mounts
│   │   └── prisma/            # DB configuration logic
│   ├── prisma/
│   │   └── schema.prisma      # Central relational schema definition
│   ├── package.json
│   └── .env
│
└── README.md
```

---

## 🏗️ System Architecture

```text
    Analyst / User Client (Next.js — Vercel)
               │
          REST (HTTP/JSON)
               ▼
   Express.js Backend Service (Node.js — Render)
               │
      ┌────────┴─────────┐
      │                  │
Controllers         Middleware / 
      │        Guardrail Service (Sanitization)
      └────────┬─────────┘
               │
    Services Layer (Core Business Logic)
               │
      ┌────────┴─────────────────┐
      │                          │
 Prisma ORM        LLM Routing Interfaces (Gemini / Groq)
      │
 PostgreSQL Database 
```

The backend restricts data logic natively via Service patterns. `QueryService` handles the SQL/prompt synchronization, `GraphService` maps tabular tuples to arrays for the browser, and `GuardrailService` prevents logic poisoning.

---

## 🖥️ Frontend

### Key Modules

- **Graph Explorer (`react-force-graph-2d`)**: Visualizes JSON representations containing independent arrays for `nodes` and `edges`. Manages click-to-expand semantics to provide metadata previews.
- **Chat Panel**: Collects human intention statements as raw strings, feeding deeply into the `/api/query` REST layer, tracking user context updates (such as highlighted arrays spanning cross query).

### Communication Interfacing (`frontend/lib/api.ts`)
The `api.ts` utility normalizes remote actions against environmental parameters (`process.env.VITE_BACKEND_URL` or `NEXT_PUBLIC_BACKEND_URL`).
- **`fetchGraphData()`**: Retrieves full universal nodes and active ties.
- **`executeQuery(question)`**: Triggers the AI pipeline, dynamically un-wrapping backend objects yielding highlights and parsed natural language.

---

## ⚙️ Backend

### Controller Layer
Maps directly towards resolving client queries synchronously. Restricts un-safe JSON payload manipulation via robust TS interfaces.

| File | Responsibility |
|---|---|
| `graph.controller.ts` | Feeds entire relational projections matching `nodes` and `edges` format for visual plotting. |
| `query.controller.ts` | Evaluates question complexity directly delegating processing towards `QueryService`. |

### Service Layer

All complex logic and Prisma abstractions are managed securely downstream.

| Service | Responsibility |
|---|---|
| `graph.service.ts` | Loops DB Entities formatting standard ids, labels, and constructing edge linkage sources implicitly based on relational keys mapping. |
| `query.service.ts` | Coordinates the LLM execution pipeline; injects exact schema; runs generated SQL asynchronously using raw abstractions. |
| `guardrail.service.ts` | Evaluates inputs prior to triggering the LLM, and enforces strict output containment against un-safe mutations. |
| `gemini.provider.ts` | Instantiates models dynamically, managing exact hardware token parameter limits (`temperature`, instructions logic). |

### Error Checking & State Recovery
Using customized error abstraction guarantees zero leak of database architecture to external API consumers. The system strictly isolates errors responding neatly with:
```json
{
  "error": "Generated SQL contains prohibited keyword: UPDATE"
}
```

---

## 🗄️ Database Schema Representation

```prisma
model Customer {
  id        String    @id @default(uuid())
  name      String
  email     String    @unique
  phone     String?
  addressId String
  address   Address   @relation(fields: [addressId], references: [id])
  orders    Order[]
  createdAt DateTime  @default(now())
}

model Order {
  id          String      @id @default(uuid())
  customerId  String
  customer    Customer    @relation(fields: [customerId], references: [id])
  status      OrderStatus @default(CREATED)
  totalAmount Float
  orderItems  OrderItem[]
  deliveries  Delivery[]
}

model Delivery {
  id        String   @id @default(uuid())
  orderId   String
  addressId String
  order     Order    @relation(fields: [orderId], references: [id])
  address   Address  @relation(fields: [addressId], references: [id])
  invoice   Invoice?
}

model Invoice {
  id         String   @id @default(uuid())
  deliveryId String   @unique
  amount     Float
  delivery   Delivery @relation(fields: [deliveryId], references: [id])
  payment    Payment?
}

model Payment {
  id        String        @id @default(uuid())
  invoiceId String        @unique
  amount    Float
  status    PaymentStatus
  invoice   Invoice       @relation(fields: [invoiceId], references: [id])
}
```
*(All models uniquely assigned to `@@schema("graph_query")` via multiSchema flag)*

---

## 🔁 Natural Language Logical Flow

**Execution Flow (Chat → Highlights)**
1. **User Request**: User sends string "Trace my Order #1231"
2. **Validating Context**: `GuardrailService` checks if `Order` is within domain tracking criteria before execution to prevent external requests.
3. **Synthesis Translation**: `QueryService` sends strictly defined relational database schema parameters asynchronously to `GeminiProvider`.
4. **Validation Isolation**: LLM generates strict synthetic `SELECT` statement. `GuardrailService` enforces no logic termination overlaps or syntax mutations present.
5. **Prisma Fetching**: Prisma safely invokes statement retrieving raw structured parameters matching exactly requested relational objects.
6. **Data Translation Request**: Raw tuples returned mapped dynamically towards secondary Prompt Pipeline translating it backwards efficiently alongside relevant relational trace highlights pointing backend coordinates logically!
7. **Frontend Binding**: Next.js parses responses dynamically mapping graph array state logically mutating visualizations.

---

## 🚀 Local Setup

### 1. Clone the Repo
```bash
git clone https://github.com/xaltyPasta/graph-query-system.git
cd graph-query-system
```

### 2. Install Dependencies
```bash
# Backend
cd backend && npm install
# Frontend
cd ../frontend && npm install
```

### 3. Configure Environments

`backend/.env`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/db_name"
GEMINI_API_KEY="your_api_key"
PORT=5000
CORS_ORIGIN="http://localhost:3000"
```

`frontend/.env`:
```env
# Next.js may require NEXT_PUBLIC_BACKEND_URL or properly evaluated logic within Vite depending on configuration abstractions mapping.
VITE_BACKEND_URL="http://localhost:5000"
```

### 4. Database Config
Ensure your local PostgreSQL connection holds valid constraints natively pointing inside your configuration:
```bash
cd backend
npx prisma generate
npx prisma db push
# or npx prisma migrate dev based on initialization state.
```

### 5. Running
```bash
# Backend (tab 1)
cd backend && npm run dev

# Frontend (tab 2)
cd frontend && npm run dev
```

---

## ☁️ Deployment

| Layer | Platform | Environment Variables Required |
|---|---|---|
| **Frontend** | Vercel | `VITE_BACKEND_URL`, `NEXT_PUBLIC_BACKEND_URL` |
| **Backend** | Render | `DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `GEMINI_API_KEY`, `GROQ_API_KEY` |
| **Database** | Supabase/AWS | Provides the `DATABASE_URL` routing logic explicitly. |

---

## 🔮 Future Improvements
- **Neo4j Storage Switch:** Eventually cache relational state implicitly using proper analytical stores natively rather than projections per-call basis improving visual density response rate safely.
- **RAG-based Document Understanding:** Store PDFs alongside invoices natively mapped logically within isolated graphs increasing LLM interpretation tracking precision dynamically!
- **Historical Snapshots:** Render graph visualizations based on exact timestamp states dynamically supporting auditing procedures locally tracking history logs interactively!
