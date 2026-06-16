import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TmdbAdapter } from './adapters/tmdb.adapter';

@Module({
  imports: [HttpModule],
  providers: [TmdbAdapter],
  exports: [TmdbAdapter], // Export so SyncService can use it
})
export class MetadataModule {}
