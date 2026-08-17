import type { PublishRequest, PublishResponse } from '../core/types';
import { MakeAdapter } from '../integrations/make.adapter';
import type { PlatformAdapter } from './platform.adapter';

export class MakePlatformAdapter implements PlatformAdapter {
  constructor(public readonly platform: string, private readonly make: MakeAdapter) {}
  publish(payload: PublishRequest): Promise<PublishResponse> { return this.make.publish(payload); }
}
