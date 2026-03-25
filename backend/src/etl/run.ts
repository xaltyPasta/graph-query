import { loadAllData } from "./loader";
import { processData } from "./processor";

async function main() {
  console.log("Loading data...");
  const data = await loadAllData();

  console.log("Processing data...");
  await processData(data);

  console.log("ETL completed");
}

main().catch((err) => {
  console.error(err);
});