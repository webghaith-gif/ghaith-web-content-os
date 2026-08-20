import type { Store } from '../repositories/store';

export interface AppNotification {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export class NotificationService {
  private static readonly recentTags = new Map<string, number>();

  constructor(private readonly store: Store) {}

  async publicKey(): Promise<string> {
    return (await this.ensureVapidKeys()).publicKey;
  }

  async status() {
    const subscriptions = await this.store.listPushSubscriptions();
    const keys = await this.store.getPushVapidKeys();
    return {
      enabled: true,
      configured: Boolean(keys),
      subscriptions: subscriptions.length,
    };
  }

  async subscribe(input: unknown) {
    const value = input as any;
    const endpoint = typeof value?.endpoint === 'string' ? value.endpoint.trim() : '';
    const p256dh = typeof value?.keys?.p256dh === 'string' ? value.keys.p256dh.trim() : '';
    const auth = typeof value?.keys?.auth === 'string' ? value.keys.auth.trim() : '';
    if (!endpoint || !p256dh || !auth) throw new Error('Invalid push subscription.');
    await this.ensureVapidKeys();
    return this.store.upsertPushSubscription({
      endpoint,
      expirationTime: typeof value.expirationTime === 'number' ? value.expirationTime : null,
      keys: { p256dh, auth },
    });
  }

  async send(notification: AppNotification) {
    const subscriptions = await this.store.listPushSubscriptions();
    if (!subscriptions.length) return { delivered: 0, failed: 0, subscriptions: 0 };

    const tag = notification.tag ?? 'ghaith-web-content-os';
    const previous = NotificationService.recentTags.get(tag) ?? 0;
    if (Date.now() - previous < 5000) {
      return { delivered: 0, failed: 0, subscriptions: subscriptions.length, deduped: true };
    }

    const webpush = await this.webPush();
    const keys = await this.ensureVapidKeys();
    webpush.setVapidDetails('mailto:webghaith@gmail.com', keys.publicKey, keys.privateKey);
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      url: notification.url ?? '/',
      tag,
      icon: '/icon.svg',
      badge: '/icon.svg',
    });

    let delivered = 0;
    let failed = 0;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime ?? null,
          keys: subscription.keys,
        }, payload, { TTL: 3600 });
        delivered += 1;
      } catch (error: any) {
        failed += 1;
        const status = Number(error?.statusCode ?? 0);
        if (status === 404 || status === 410) {
          await this.store.removePushSubscription(subscription.endpoint);
        } else {
          console.warn('Push notification failed', status || error?.message || error);
        }
      }
    }
    if (delivered > 0) {
      NotificationService.recentTags.set(tag, Date.now());
      if (NotificationService.recentTags.size > 500) {
        const cutoff = Date.now() - 60_000;
        for (const [key, at] of NotificationService.recentTags) {
          if (at < cutoff) NotificationService.recentTags.delete(key);
        }
      }
    }
    return { delivered, failed, subscriptions: subscriptions.length };
  }

  private async ensureVapidKeys() {
    const existing = await this.store.getPushVapidKeys();
    if (existing) return existing;
    const webpush = await this.webPush();
    const generated = webpush.generateVAPIDKeys();
    await this.store.setPushVapidKeys(generated.publicKey, generated.privateKey);
    return generated;
  }

  private async webPush() {
    const module = await import('web-push');
    return module.default;
  }
}
