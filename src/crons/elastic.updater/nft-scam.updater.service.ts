import { Injectable, Logger } from '@nestjs/common';
import {
  ElrondApiService,
  ElrondElasticService,
  RedisCacheService,
} from 'src/common';
import * as Redis from 'ioredis';
import { cacheConfig, constants } from 'src/config';
import { ElasticQuery, QueryType } from '@elrondnetwork/erdnest';
import { NftTypeEnum } from 'src/modules/assets/models';
import { Locker } from 'src/utils/locker';
import { NftScamService } from 'src/modules/nft-scam/nft-scam.service';

@Injectable()
export class NftScamUpdaterService {
  private readonly persistentRedisClient: Redis.Redis;

  constructor(
    private readonly nftScamService: NftScamService,
    private readonly redisCacheService: RedisCacheService,
    private readonly elasticService: ElrondElasticService,
    private readonly elrondApiService: ElrondApiService,
    private readonly logger: Logger,
  ) {
    this.persistentRedisClient = this.redisCacheService.getClient(
      cacheConfig.persistentRedisClientName,
    );
  }

  async handleUpdateScamInfoWhereNotSetOrOutdated(): Promise<void> {
    try {
      await Locker.lock(
        `handleValidateTokenTraits`,
        async () => {
          const elrondApiAbout =
            await this.elrondApiService.getElrondApiAbout();

          const query = this.getNftWithScamInfoWhereNotSetElasticQuery(
            elrondApiAbout.version,
          );

          await this.elasticService.getScrollableList(
            'tokens',
            'token',
            query,
            async (nfts) => {
              for (const nft of nfts) {
                await this.nftScamService.validateOrUpdateNftScamInfo(
                  nft.identifier,
                  {
                    elrondApiAbout: elrondApiAbout,
                    nftFromElastic: nft,
                  },
                );
              }
            },
          );
        },
        true,
      );
    } catch (error) {
      this.logger.error(
        `Error when setting/updating scam info where not set / outdated`,
        {
          path: `${NftScamUpdaterService.name}.${this.handleUpdateScamInfoWhereNotSetOrOutdated.name}`,
          exception: error?.message,
        },
      );
    }
  }

  private getNftWithScamInfoWhereNotSetElasticQuery(
    version: string,
  ): ElasticQuery {
    return ElasticQuery.create()
      .withMustExistCondition('token')
      .withMustExistCondition('nonce')
      .withMustNotCondition(QueryType.Match('nft_scamInfoVersion', version))
      .withMustNotCondition(QueryType.Match('nft_scamInfoVersion', 'manual'))
      .withMustMultiShouldCondition(
        [NftTypeEnum.NonFungibleESDT, NftTypeEnum.SemiFungibleESDT],
        (type) => QueryType.Match('type', type),
      )
      .withPagination({
        from: 0,
        size: constants.getCollectionsFromElasticBatchSize,
      });
  }
}