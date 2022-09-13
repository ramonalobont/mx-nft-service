import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ElrondApiService, RedisCacheService } from 'src/common';
import * as Redis from 'ioredis';
import { generateCacheKeyFromParams } from 'src/utils/generate-cache-key';
import { cacheConfig } from 'src/config';
import { Asset } from '../assets/models';
import { Collection } from '../nftCollections/models';
import { TimeConstants } from 'src/utils/time-utils';
import { PersistenceService } from 'src/common/persistance/persistance.service';

@Injectable()
export class FeaturedService {
  private redisClient: Redis.Redis;
  constructor(
    private apiService: ElrondApiService,
    private persistenceService: PersistenceService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private redisCacheService: RedisCacheService,
  ) {
    this.redisClient = this.redisCacheService.getClient(
      cacheConfig.assetsRedisClientName,
    );
  }

  async getFeaturedNfts(
    limit: number = 10,
    offset: number,
  ): Promise<[Asset[], number]> {
    try {
      const cacheKey = this.getFeaturedNftsCacheKey(limit, offset);
      const getAssetLiked = () =>
        this.persistenceService.getFeaturedNfts(limit, offset);
      const [featuredNfts, count] = await this.redisCacheService.getOrSet(
        this.redisClient,
        cacheKey,
        getAssetLiked,
        30 * TimeConstants.oneMinute,
      );
      const nfts = await this.apiService.getNftsByIdentifiers(
        featuredNfts?.map((x) => x.identifier),
      );
      return [nfts?.map((nft) => Asset.fromNft(nft)), count];
    } catch (err) {
      this.logger.error('An error occurred while loading featured nfts.', {
        path: 'FeaturedNftsService.getFeaturedNfts',
        exception: err,
      });
    }
  }

  private getFeaturedNftsCacheKey(limit, offset) {
    return generateCacheKeyFromParams('featuredNfts', limit, offset);
  }

  async getFeaturedCollections(
    limit: number = 10,
    offset: number,
  ): Promise<[Collection[], number]> {
    try {
      const cacheKey = this.getFeaturedCollectionsCacheKey(limit, offset);
      const getFeaturedCollections = () =>
        this.persistenceService.getFeaturedCollections(limit, offset);
      const [featuredCollections, count] =
        await this.redisCacheService.getOrSet(
          this.redisClient,
          cacheKey,
          getFeaturedCollections,
          30 * TimeConstants.oneMinute,
        );
      const collections = await this.apiService.getCollectionsByIdentifiers(
        featuredCollections?.map((x) => x.identifier),
      );
      return [
        collections?.map((nft) => Collection.fromCollectionApi(nft)),
        count,
      ];
    } catch (err) {
      this.logger.error(
        'An error occurred while loading featured Collections.',
        {
          path: 'FeaturedService.getFeaturedCollections',
          exception: err,
        },
      );
    }
  }

  private getFeaturedCollectionsCacheKey(limit, offset) {
    return generateCacheKeyFromParams('featuredCollections', limit, offset);
  }
}
