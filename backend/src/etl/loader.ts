import * as path from "path";
import fs from "fs";
import { parseJSONL } from "./parser";

// BASE PATH → always resolved from backend root
const BASE_PATH = path.join(
    process.cwd(),
    "sample-data",
    "sap-order-to-cash-dataset",
    "sap-o2c-data"
);

// helper to read all jsonl files in a folder
async function readAllFiles(folderPath: string) {
    const files = fs.readdirSync(folderPath);

    let allData: any[] = [];

    for (const file of files) {
        if (file.endsWith(".jsonl")) {
            const filePath = path.join(folderPath, file);
            const data = await parseJSONL(filePath);
            allData = allData.concat(data);
        }
    }

    return allData;
}

export async function loadAllData() {
    return {
        customers: await readAllFiles(
            path.join(BASE_PATH, "business_partners")
        ),

        addresses: await readAllFiles(
            path.join(BASE_PATH, "business_partner_addresses")
        ),

        orders: await readAllFiles(
            path.join(BASE_PATH, "sales_order_headers")
        ),

        orderItems: await readAllFiles(
            path.join(BASE_PATH, "sales_order_items")
        ),

        deliveries: await readAllFiles(
            path.join(BASE_PATH, "outbound_delivery_headers")
        ),

        deliveryItems: await readAllFiles(
            path.join(BASE_PATH, "outbound_delivery_items")
        ),

        invoices: await readAllFiles(
            path.join(BASE_PATH, "billing_document_headers")
        ),

        payments: await readAllFiles(
            path.join(BASE_PATH, "payments_accounts_receivable")
        ),

        products: await readAllFiles(
            path.join(BASE_PATH, "products")
        ),
    };
}