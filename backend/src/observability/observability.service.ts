import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);
  
  // Keep sliding window of last 1 minute api request durations
  private apiRequests: { timestamp: number; durationMs: number }[] = [];

  recordSyncTime(providerId: string, durationMs: number) {
    this.logger.log(`[METRIC] ProviderSyncTime { providerId: ${providerId}, durationMs: ${durationMs} }`);
  }

  recordSearchLatency(query: string, durationMs: number) {
    this.logger.log(`[METRIC] SearchLatency { query: "${query}", durationMs: ${durationMs} }`);
  }

  recordPlayerError(contentId: string, errorType: string) {
    this.logger.error(`[METRIC] PlayerError { contentId: ${contentId}, errorType: ${errorType} }`);
  }

  recordApiLatency(path: string, method: string, durationMs: number) {
    this.logger.log(`[METRIC] ApiLatency { path: "${path}", method: "${method}", durationMs: ${durationMs} }`);
    this.apiRequests.push({ timestamp: Date.now(), durationMs });
    
    // Purge requests older than 2 minutes to save memory
    const cutoff = Date.now() - 120000;
    while (this.apiRequests.length > 0 && this.apiRequests[0].timestamp < cutoff) {
      this.apiRequests.shift();
    }
  }

  getApiMetrics() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Filter last 1 minute requests
    const lastMinRequests = this.apiRequests.filter(r => r.timestamp >= oneMinuteAgo);
    const rpm = lastMinRequests.length;
    
    const avgLatency = rpm > 0 
      ? Math.round(lastMinRequests.reduce((sum, r) => sum + r.durationMs, 0) / rpm)
      : 0;

    return { rpm, avgLatency };
  }
}
