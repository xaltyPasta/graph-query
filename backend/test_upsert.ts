import { prisma } from "./src/config/prisma";
async function main() {
    try {
        const addr = await prisma.address.upsert({
            where: {
                street_city_postalCode: {
                    street: "UNKNOWN",
                    city: "UNKNOWN",
                    postalCode: null as any
                }
            },
            update: {},
            create: {
                street: "UNKNOWN",
                city: "UNKNOWN",
                postalCode: null
            }
        });
        console.log("Upsert succeeded:", addr);
    } catch (err) {
        console.error("Upsert failed:", err);
    }
}
main().then(() => prisma.$disconnect());
