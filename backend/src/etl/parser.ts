import fs from "fs";
import readline from "readline";

export async function parseJSONL(filePath: string): Promise<any[]> {
  const stream = fs.createReadStream(filePath);

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  const data: any[] = [];

  for await (const line of rl) {
    if (line.trim()) {
      try {
        data.push(JSON.parse(line));
      } catch (err) {
        console.error("Invalid JSON line:", line);
      }
    }
  }

  return data;
}