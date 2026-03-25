import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const paymentCount = await prisma.payment.count();
  console.log(`Payment count: ${paymentCount}`);
  
  if (paymentCount > 0) {
    const payment = await prisma.payment.findFirst({
        include: {
            invoice: true
        }
    });
    console.log("Sample Payment:", payment);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
