const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 

async function main() { 
  const canteens = await prisma.canteen.findMany({ 
    include: { 
      _count: { select: { preferredUsers: true } }, 
      preferredUsers: { select: { id: true, name: true, isActive: true, role: true } } 
    } 
  }); 
  console.dir(canteens, {depth: null}); 
} 

main().catch(console.error).finally(() => prisma.$disconnect());
