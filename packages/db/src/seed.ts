import { PrismaClient } from '@prisma/client';
import { resolve } from 'path';
process.env.DATABASE_URL = process.env.DATABASE_URL || `file:${resolve(__dirname, '../../skbox.db')}`;

const prisma = new PrismaClient();

async function main() {
  const rooms = [
    { name: 'Salon', icon: 'sofa', order: 0 },
    { name: 'Chambre', icon: 'bed', order: 1 },
    { name: 'Cuisine', icon: 'chef-hat', order: 2 },
    { name: 'Salle de bain', icon: 'bath', order: 3 },
    { name: 'Bureau', icon: 'desk', order: 4 },
  ];

  for (const room of rooms) {
    await prisma.room.upsert({
      where: { name: room.name },
      update: {},
      create: room,
    });
  }

  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
