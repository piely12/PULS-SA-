import { Module, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

export const DATABASE_POOL = 'DATABASE_POOL';

class DatabaseLifecycle implements OnModuleDestroy {
  constructor(private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: () => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error('DATABASE_URL is required');
        }
        return new Pool({ connectionString, max: 10 });
      },
    },
    {
      provide: DatabaseLifecycle,
      useFactory: (pool: Pool) => new DatabaseLifecycle(pool),
      inject: [DATABASE_POOL],
    },
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
