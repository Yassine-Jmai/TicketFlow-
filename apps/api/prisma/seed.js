"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log("🌱 Seeding database with test data...");
    // Create test modules
    const module1 = await prisma.ticketModule.create({
        data: {
            nom: "Sage 100",
            description: "Module de gestion Sage 100",
        },
    });
    const module2 = await prisma.ticketModule.create({
        data: {
            nom: "Sage 1000 FRP",
            description: "Module de gestion Sage 1000 FRP",
        },
    });
    const module3 = await prisma.ticketModule.create({
        data: {
            nom: "Développement spécifique",
            description: "Module pour développements custom",
        },
    });
    console.log("✅ Modules created:", { module1, module2, module3 });
    // Create test users
    const testClient = await prisma.utilisateur.create({
        data: {
            nom: "Dupont",
            prenom: "Jean",
            email: "jean.dupont@example.com",
            motDePasse: "hashed_password_here", // TODO: Replace with hashed password
            role: "CLIENT",
        },
    });
    const testConsultant = await prisma.utilisateur.create({
        data: {
            nom: "Martin",
            prenom: "Sophie",
            email: "sophie.martin@example.com",
            motDePasse: "hashed_password_here", // TODO: Replace with hashed password
            role: "CONSULTANT",
        },
    });
    const testAdmin = await prisma.utilisateur.create({
        data: {
            nom: "Admin",
            prenom: "System",
            email: "admin@example.com",
            motDePasse: "hashed_password_here", // TODO: Replace with hashed password
            role: "ADMINISTRATEUR",
        },
    });
    console.log("✅ Users created:", { testClient, testConsultant, testAdmin });
    console.log("\n📝 Test Data Summary:");
    console.log("═".repeat(50));
    console.log(`Test Client ID: ${testClient.id}`);
    console.log(`Test Client Email: ${testClient.email}`);
    console.log(`\nTest Consultant ID: ${testConsultant.id}`);
    console.log(`Test Consultant Email: ${testConsultant.email}`);
    console.log(`\nTest Admin ID: ${testAdmin.id}`);
    console.log(`\nModule IDs:`);
    console.log(`  - Sage 100: ${module1.id}`);
    console.log(`  - Sage 1000 FRP: ${module2.id}`);
    console.log(`  - Dev spécifique: ${module3.id}`);
    console.log("═".repeat(50));
    console.log("\n💡 Use these IDs in your Postman requests!");
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
