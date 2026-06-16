import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ObservabilityService } from './observability.service';

@Injectable()
export class LatencyInterceptor implements NestInterceptor {
  constructor(private observability: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;
    const now = Date.now();

    return next
      .handle()
      .pipe(
        tap(() => {
          const durationMs = Date.now() - now;
          this.observability.recordApiLatency(url, method, durationMs);
        }),
      );
  }
}
