import type { PublishRequest, PublishResponse } from '../core/types';

export interface PlatformAdapter {
  readonly platform: string;
  publish(payload: PublishRequest): Promise<PublishResponse>;
}
