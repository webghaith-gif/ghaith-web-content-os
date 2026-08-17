import { AppError } from '../core/errors';
import { supportedPlatforms } from '../config/env';
import { MakeAdapter } from '../integrations/make.adapter';
import { MakePlatformAdapter } from './make-platform.adapter';
import type { PlatformAdapter } from './platform.adapter';

export class PlatformRegistry {
  private readonly adapters = new Map<string, PlatformAdapter>();

  constructor(make = new MakeAdapter()) {
    for (const platform of supportedPlatforms) this.register(new MakePlatformAdapter(platform, make));
  }

  register(adapter: PlatformAdapter): void { this.adapters.set(adapter.platform.toLowerCase(), adapter); }

  get(platform: string): PlatformAdapter {
    const adapter = this.adapters.get(platform.toLowerCase());
    if (!adapter) throw new AppError(`Unsupported platform: ${platform}. Add it to SUPPORTED_PLATFORMS or register an adapter.`, 400, 'UNSUPPORTED_PLATFORM');
    return adapter;
  }

  list(): string[] { return [...this.adapters.keys()].sort(); }
}
