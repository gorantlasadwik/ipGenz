export enum PluginType {
  PROVIDER = 'PROVIDER',
  METADATA = 'METADATA',
  THEME = 'THEME',
  ANALYTICS = 'ANALYTICS',
}

export interface IPlugin {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  
  onInit(): Promise<void>;
  onDestroy(): Promise<void>;
}

export interface MetadataPlugin extends IPlugin {
  type: PluginType.METADATA;
  fetchMovieMetadata(title: string, year?: number): Promise<any>;
  fetchSeriesMetadata(title: string, year?: number): Promise<any>;
}

export interface AnalyticsPlugin extends IPlugin {
  type: PluginType.ANALYTICS;
  trackEvent(eventName: string, payload: any): void;
  reportMetric(metricName: string, value: number): void;
}
