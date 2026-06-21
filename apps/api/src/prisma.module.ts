import { Global, Module, OnModuleDestroy } from '@nestjs/common';
import { prisma } from '@skbox/db';

@Global()
@Module({
  providers: [
    {
      provide: 'PRISMA',
      useValue: prisma,
    },
  ],
  exports: ['PRISMA'],
})
export class PrismaModule implements OnModuleDestroy {
  async onModuleDestroy() {
    await prisma.$disconnect();
  }
}
