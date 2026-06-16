import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ProvidersModule } from './providers/providers.module';
import { PluginsModule } from './plugins/plugins.module';
import { ObservabilityModule } from './observability/observability.module';
import { SyncModule } from './sync/sync.module';
import { StreamModule } from './stream/stream.module';
import { MetadataModule } from './metadata/metadata.module';
import { ContentModule } from './content/content.module';
import { LibraryModule } from './library/library.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    ProvidersModule,
    PluginsModule,
    ObservabilityModule,
    SyncModule,
    StreamModule,
    MetadataModule,
    ContentModule,
    LibraryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
