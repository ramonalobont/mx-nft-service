import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CacheInfo } from 'src/common/services/caching/entities/cache.info';
import { ClientProxy } from '@nestjs/microservices';
import { CachingService, Locker } from '@multiversx/sdk-nestjs';
import { AssetsLikesService } from 'src/modules/assets';

@Injectable()
export class LikesWarmerService {
  constructor(
    @Inject('PUBSUB_SERVICE') private clientProxy: ClientProxy,
    private cacheService: CachingService,
    private assetsLikesService: AssetsLikesService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async mostLikesAssets() {
    await Locker.lock(
      'Most liked assets invalidation',
      async () => {
        const assets = await this.assetsLikesService.getMostLikedAssets();
        await this.invalidateKey(
          CacheInfo.MostLikedAssets.key,
          assets,
          CacheInfo.MostLikedAssets.ttl,
        );
      },
      true,
    );
  }

  private async invalidateKey(key: string, data: any, ttl: number) {
    await this.cacheService.setCache(key, data, ttl);
    await this.refreshCacheKey(key, ttl);
  }

  private async refreshCacheKey(key: string, ttl: number) {
    await this.clientProxy.emit<{
      key: string;
      ttl: number;
    }>('refreshCacheKey', {
      key,
      ttl,
    });
  }
}
