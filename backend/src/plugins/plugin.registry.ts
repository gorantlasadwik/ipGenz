import { Injectable, Logger } from '@nestjs/common';
import { IPlugin, PluginType } from './interfaces/plugin.interface';

@Injectable()
export class PluginRegistry {
  private readonly logger = new Logger(PluginRegistry.name);
  private plugins: Map<string, IPlugin> = new Map();

  async register(plugin: IPlugin) {
    if (this.plugins.has(plugin.id)) {
      this.logger.warn(`Plugin ${plugin.id} is already registered. Overwriting.`);
    }
    
    await plugin.onInit();
    this.plugins.set(plugin.id, plugin);
    this.logger.log(`Registered plugin: ${plugin.name} v${plugin.version} (${plugin.type})`);
  }

  getPlugin(id: string): IPlugin | undefined {
    return this.plugins.get(id);
  }

  getPluginsByType(type: PluginType): IPlugin[] {
    return Array.from(this.plugins.values()).filter(p => p.type === type);
  }

  async unregister(id: string) {
    const plugin = this.plugins.get(id);
    if (plugin) {
      await plugin.onDestroy();
      this.plugins.delete(id);
      this.logger.log(`Unregistered plugin: ${plugin.name}`);
    }
  }
}
