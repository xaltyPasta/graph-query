import { prisma } from "../config/prisma";
import { Prisma, PaymentStatus } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

// ──────────────────────────────────────────────────────
// Structured logger
// ──────────────────────────────────────────────────────
function log(entry: {
  step: string;
  orderId?: string;
  status: "ok" | "skip" | "fail";
  reason?: string;
}) {
  if (entry.status === "fail") {
    console.error(JSON.stringify(entry));
  } else if (entry.status === "skip") {
    // silent in normal mode — counted in summary
  }
}

export async function processData(data: any) {
  // ──────────────────────────────────────────────
  // PRE-BUILD LOOKUP MAPS (eliminates O(n²) scans)
  // ──────────────────────────────────────────────
  const customerMap = new Map<string, any>();
  for (const c of data.customers) {
    if (c.businessPartner) customerMap.set(c.businessPartner, c);
  }

  const addressMap = new Map<string, any>();
  for (const a of data.addresses) {
    if (a.businessPartner) addressMap.set(a.businessPartner, a);
  }

  const productMap = new Map<string, any>();
  for (const p of data.products) {
    if (p.product) productMap.set(p.product, p);
  }

  // salesOrder → items[]
  const orderItemsMap = new Map<string, any[]>();
  for (const item of data.orderItems) {
    if (!item.salesOrder) continue;
    const list = orderItemsMap.get(item.salesOrder) ?? [];
    list.push(item);
    orderItemsMap.set(item.salesOrder, list);
  }

  // salesOrder → deliveryDocument (via delivery items)
  const deliveryItemMap = new Map<string, string>();
  for (const di of data.deliveryItems) {
    if (di.referenceSdDocument && di.deliveryDocument) {
      deliveryItemMap.set(di.referenceSdDocument, di.deliveryDocument);
    }
  }

  // deliveryDocument → header
  const deliveryHeaderMap = new Map<string, any>();
  for (const d of data.deliveries) {
    if (d.deliveryDocument) deliveryHeaderMap.set(d.deliveryDocument, d);
  }

  // billingDocument → header
  const invoiceByDocMap = new Map<string, any>();
  for (const inv of data.invoices) {
    if (inv.billingDocument) invoiceByDocMap.set(inv.billingDocument, inv);
  }

  // ──────────────────────────────────────────────
  // INVOICE LINKAGE (soldToParty fallback)
  //
  // LIMITATION: This maps soldToParty → first matching invoice. This is
  // unreliable when a single customer has multiple billing documents.
  // A customer with 3 invoices will only have the first one linked.
  //
  // TODO: Replace with billing_document_items join to link invoices
  //       directly via salesOrder → billingDocument for accurate 1:1
  //       order-to-invoice mapping.
  // ──────────────────────────────────────────────
  const invoiceBySoldToMap = new Map<string, any>();
  for (const inv of data.invoices) {
    if (inv.soldToParty && !invoiceBySoldToMap.has(inv.soldToParty)) {
      invoiceBySoldToMap.set(inv.soldToParty, inv);
    }
  }

  // invoiceReference → payment
  //
  // TODO: Improve payment linkage by cross-referencing accounting documents
  //       (journal_entry_items_accounts_receivable) for more precise matching.
  const paymentMap = new Map<string, any>();
  for (const p of data.payments) {
    if (p.invoiceReference) paymentMap.set(p.invoiceReference, p);
  }

  // ──────────────────────────────────────────────
  // STATS
  // ──────────────────────────────────────────────
  let success = 0;
  let failed = 0;
  let skippedNoCustomer = 0;
  let skippedNoOrderId = 0;
  let ordersWithoutDelivery = 0;
  let ordersWithoutInvoice = 0;
  let ordersWithoutPayment = 0;

  const totalOrders = data.orders.length;

  // ──────────────────────────────────────────────
  // PRE-SEED: Addresses & Products (sequential, avoids race conditions)
  // ──────────────────────────────────────────────

  // --- Addresses ---
  console.log("  ↳ Pre-seeding addresses...");
  const dbAddressCache = new Map<string, string>(); // "street|city|postal" → id

  const seenAddresses = new Map<string, any>();
  for (const a of data.addresses) {
    const street = a.streetName || "UNKNOWN";
    const city = a.cityName || "UNKNOWN";
    const postal = a.postalCode ?? null;
    const key = `${street}|${city}|${postal}`;
    if (!seenAddresses.has(key)) seenAddresses.set(key, a);
  }

  for (const [key, a] of seenAddresses) {
    const parts = key.split("|");
    const street = parts[0];
    const city = parts[1];
    const postalCode = parts[2] === "null" ? null : parts[2];

    let addr;
    if (postalCode) {
      addr = await prisma.address.upsert({
        where: {
          street_city_postalCode: { street, city, postalCode },
        },
        update: {},
        create: {
          street,
          city,
          state: a.region ?? null,
          country: a.country ?? null,
          postalCode,
        },
      });
    } else {
      // Prisma upsert does not support null in unique composite keys
      addr = await prisma.address.findFirst({
        where: { street, city, postalCode: null },
      });
      if (!addr) {
        addr = await prisma.address.create({
          data: {
            street,
            city,
            state: a.region ?? null,
            country: a.country ?? null,
            postalCode: null,
          },
        });
      }
    }
    dbAddressCache.set(key, addr.id);
  }

  // --- Products ---
  // Product price comes from the product dataset only.
  // OrderItem.price is the transactional price and is kept separate.
  console.log("  ↳ Pre-seeding products...");
  const dbProductCache = new Map<string, string>(); // sku → id

  for (const p of data.products) {
    if (!p.product) continue;
    const product = await prisma.product.upsert({
      where: { sku: p.product },
      update: {},
      create: {
        name: p.product,
        sku: p.product,
        // Price from product dataset; 0 if not available in source data
        price: Number(p.standardPrice || p.price || 0),
      },
    });
    dbProductCache.set(p.product, product.id);
  }

  // Seed products that only appear in order items (not in product master)
  for (const item of data.orderItems) {
    if (!item.material || dbProductCache.has(item.material)) continue;
    const product = await prisma.product.upsert({
      where: { sku: item.material },
      update: {},
      create: {
        name: item.material,
        sku: item.material,
        // No product master price available; default to 0
        price: 0,
      },
    });
    dbProductCache.set(item.material, product.id);
  }

  // --- Customers ---
  console.log("  ↳ Pre-seeding customers...");
  const dbCustomerCache = new Map<string, string>(); // email → id
  for (const [bpId, c] of customerMap) {
    const email = c.emailAddress || `${bpId}@placeholder.com`;
    const addrRaw = addressMap.get(bpId);
    const street = addrRaw?.streetName || "UNKNOWN";
    const city = addrRaw?.cityName || "UNKNOWN";
    const postal = addrRaw?.postalCode ?? null;
    const addrKey = `${street}|${city}|${postal}`;
    const addressId = dbAddressCache.get(addrKey);
    if (!addressId) continue; // no address seeded for this customer

    const customer = await prisma.customer.upsert({
      where: { email },
      update: {},
      create: {
        name:
          c.businessPartnerName ||
          c.organizationBpName1 ||
          "Unknown",
        email,
        phone: null,
        addressId,
      },
    });
    dbCustomerCache.set(email, customer.id);
  }

  console.log(
    `  ↳ Seeded ${dbAddressCache.size} addresses, ${dbProductCache.size} products, ${dbCustomerCache.size} customers`
  );

  // ──────────────────────────────────────────────
  // BATCH PROCESSING (concurrent batches of 10)
  // ──────────────────────────────────────────────
  const BATCH_SIZE = 10;

  async function processOrder(order: any) {
    // Guard: salesOrder required
    if (!order.salesOrder) {
      skippedNoOrderId++;
      failed++;
      log({ step: "guard", status: "skip", reason: "missing salesOrder" });
      return;
    }

    const customerRaw = customerMap.get(order.soldToParty);
    if (!customerRaw) {
      skippedNoCustomer++;
      failed++;
      log({
        step: "guard",
        orderId: order.salesOrder,
        status: "skip",
        reason: "no matching customer for soldToParty",
      });
      return;
    }

    const addressRaw = addressMap.get(order.soldToParty);

    // Wrap per-order in a single transaction for consistency.
    // All cache lookups are read-only; no shared mutable state inside tx.
    await prisma.$transaction(async (tx: TxClient) => {
      // ── 1. ADDRESS — resolve from cache ──
      const street = addressRaw?.streetName || "UNKNOWN";
      const city = addressRaw?.cityName || "UNKNOWN";
      const postalCode = addressRaw?.postalCode ?? null;
      const addrKey = `${street}|${city}|${postalCode}`;

      let addressId = dbAddressCache.get(addrKey);
      if (!addressId) {
        // Edge case: customer without a pre-seeded address record
        let addr;
        if (postalCode) {
          addr = await tx.address.upsert({
            where: {
              street_city_postalCode: { street, city, postalCode },
            },
            update: {},
            create: {
              street,
              city,
              state: null,
              country: null,
              postalCode,
            },
          });
        } else {
          addr = await tx.address.findFirst({
            where: { street, city, postalCode: null },
          });
          if (!addr) {
            addr = await tx.address.create({
              data: {
                street,
                city,
                state: null,
                country: null,
                postalCode: null,
              },
            });
          }
        }
        addressId = addr.id;
        dbAddressCache.set(addrKey, addressId);
      }

      // ── 2. CUSTOMER ──
      const email =
        customerRaw.emailAddress ||
        `${customerRaw.businessPartner}@placeholder.com`;

      const customer = await tx.customer.upsert({
        where: { email },
        update: {},
        create: {
          name:
            customerRaw.businessPartnerName ||
            customerRaw.organizationBpName1 ||
            "Unknown",
          email,
          phone: null,
          addressId,
        },
      });

      // ── 3. ORDER ──
      const dbOrder = await tx.order.upsert({
        where: { id: order.salesOrder },
        update: {},
        create: {
          id: order.salesOrder,
          customerId: customer.id,
          totalAmount: Number(order.totalNetAmount || 0),
        },
      });

      // ── 4. ORDER ITEMS ──
      const items = orderItemsMap.get(order.salesOrder) ?? [];

      for (const item of items) {
        // Guard: material (product SKU) is required
        if (!item.material) continue;

        const productId = dbProductCache.get(item.material);
        if (!productId) continue;

        await tx.orderItem.upsert({
          where: {
            orderId_productId: {
              orderId: dbOrder.id,
              productId,
            },
          },
          update: {
            quantity: Number(item.requestedQuantity || 1),
            // Transactional price — kept on orderItem, not on product
            price: Number(item.netAmount || 0),
          },
          create: {
            orderId: dbOrder.id,
            productId,
            quantity: Number(item.requestedQuantity || 1),
            price: Number(item.netAmount || 0),
          },
        });
      }

      // ── 5. DELIVERY (optional — order still created if missing) ──
      const deliveryDocId = deliveryItemMap.get(order.salesOrder);
      const deliveryRaw = deliveryDocId ? deliveryHeaderMap.get(deliveryDocId) : null;

      if (!deliveryRaw?.deliveryDocument) {
        ordersWithoutDelivery++;
        log({
          step: "delivery",
          orderId: order.salesOrder,
          status: "skip",
          reason: !deliveryDocId 
            ? "no delivery item references this order"
            : "delivery header not found for document " + deliveryDocId,
        });
      } else {
        const delivery = await tx.delivery.upsert({
          where: { id: deliveryRaw.deliveryDocument },
          update: {},
          create: {
            id: deliveryRaw.deliveryDocument,
            orderId: dbOrder.id,
            addressId,
          },
        });

        // ── 6. INVOICE ──
        // FALLBACK LINKAGE: Uses soldToParty to match invoice.
        // This is unreliable for customers with multiple billing documents —
        // only the first invoice is matched.
        //
        // TODO: Replace with billing_document_items join to link invoices
        //       directly via salesOrder → billingDocument for accurate mapping.
        const invoiceRaw = invoiceBySoldToMap.get(order.soldToParty);
        
        if (!invoiceRaw?.billingDocument) {
          ordersWithoutInvoice++;
          log({
            step: "invoice",
            orderId: order.salesOrder,
            status: "skip",
            reason: "no invoice found for soldToParty " + order.soldToParty,
          });
        } else {
          const invoice = await tx.invoice.upsert({
            where: { deliveryId: delivery.id },
            update: {},
            create: {
              deliveryId: delivery.id,
              amount: Number(invoiceRaw.totalNetAmount || 0),
            },
          });

          // ── 7. PAYMENT ──
          const paymentRaw = paymentMap.get(invoiceRaw.billingDocument);
          
          if (!paymentRaw) {
            ordersWithoutPayment++;
            log({
              step: "payment",
              orderId: order.salesOrder,
              status: "skip",
              reason:
                "no payment found for billingDocument " +
                invoiceRaw.billingDocument,
            });
          } else {
            // Derive status from clearingDate presence (typed enum)
            const paymentStatus: PaymentStatus = paymentRaw.clearingDate
              ? PaymentStatus.COMPLETED
              : PaymentStatus.PENDING;

            await tx.payment.upsert({
              where: { invoiceId: invoice.id },
              update: {},
              create: {
                invoiceId: invoice.id,
                amount: Number(paymentRaw.amountInCompanyCodeCurrency || 0),
                status: paymentStatus,
              },
            });
          }
        }
      }
    });

    success++;
    if (success % 10 === 0) {
      process.stdout.write(
        `\r✅ Processed ${success}/${totalOrders} orders`
      );
    }
  }

  // Process in batches
  for (let i = 0; i < data.orders.length; i += BATCH_SIZE) {
    const batch = data.orders.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (order: any) => {
        try {
          await processOrder(order);
        } catch (err) {
          failed++;
          log({
            step: "transaction",
            orderId: order.salesOrder,
            status: "fail",
            reason: (err as Error).message,
          });
        }
      })
    );
  }

  // ──────────────────────────────────────────────
  // ETL SUMMARY
  // ──────────────────────────────────────────────
  console.log(`\n
╔══════════════════════════════════════╗
║          ETL SUMMARY                ║
╠══════════════════════════════════════╣
║  Total orders:          ${String(totalOrders).padStart(10)}  ║
║  ✅ Succeeded:          ${String(success).padStart(10)}  ║
║  ❌ Failed:             ${String(failed).padStart(10)}  ║
║  ⏭  Skipped (no cust.): ${String(skippedNoCustomer).padStart(10)}  ║
║  ⏭  Skipped (no ID):    ${String(skippedNoOrderId).padStart(10)}  ║
║  📦 No delivery found:  ${String(ordersWithoutDelivery).padStart(10)}  ║
║  🧾 No invoice found:   ${String(ordersWithoutInvoice).padStart(10)}  ║
║  💳 No payment found:   ${String(ordersWithoutPayment).padStart(10)}  ║
╚══════════════════════════════════════╝`);

  // TODO: Add plant/location dimension (plants, product_plants) for
  //       location-based graph queries and richer traversal.

  await prisma.$disconnect();
}