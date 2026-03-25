import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("Customer:", await prisma.customer.count());
  console.log("Order:", await prisma.order.count());
  console.log("Delivery:", await prisma.delivery.count());
  console.log("Invoice:", await prisma.invoice.count());
  console.log("Payment:", await prisma.payment.count());

  const firstPayment = await prisma.payment.findFirst();
  console.log("First Payment:", firstPayment);
}

main().catch(console.error).finally(() => prisma.$disconnect());
