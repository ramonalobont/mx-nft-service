import { Injectable, Logger } from '@nestjs/common';
import { MxElasticService, Nft } from 'src/common';
import { ElasticQuery, QueryOperator, QueryType } from '@elrondnetwork/erdnest';
import { constants, elasticDictionary } from 'src/config';
import { NftTypeEnum, ScamInfoTypeEnum } from '../assets/models';
import { NftScamInfoModel } from './models/nft-scam-info.model';

@Injectable()
export class NftScamElasticService {
  constructor(
    private mxService: MxElasticService,
    private readonly logger: Logger,
  ) {}

  async getNftWithScamInfoFromElastic(identifier: string): Promise<any> {
    let nft: any;
    try {
      const query = this.getNftWithScamInfoFromElasticQuery(identifier);

      await this.mxService.getScrollableList(
        'tokens',
        'identifier',
        query,
        async (items) => {
          nft = items[0];
          return undefined;
        },
      );
    } catch (error) {
      this.logger.error(`Error when getting NFT trait values from Elastic`, {
        path: `${NftScamElasticService.name}.${this.getNftWithScamInfoFromElastic.name}`,
        exception: error?.message,
        identifier: identifier,
      });
    }
    return nft;
  }

  async setBulkNftScamInfoInElastic(
    nfts: Nft[],
    clearScamInfoIfEmpty?: boolean,
  ): Promise<void> {
    if (nfts.length > 0) {
      try {
        await this.mxService.bulkRequest(
          'tokens',
          this.buildNftScamInfoBulkUpdate(nfts, clearScamInfoIfEmpty),
        );
      } catch (error) {
        this.logger.error('Error when bulk updating nft scam info in Elastic', {
          path: `${NftScamElasticService.name}.${this.setBulkNftScamInfoInElastic.name}`,
          exception: error?.message,
        });
      }
    }
  }

  async updateBulkNftScamInfoInElastic(updates: string[]): Promise<void> {
    if (updates.length > 0) {
      try {
        await this.mxService.bulkRequest('tokens', updates, '?timeout=1m');
      } catch (error) {
        this.logger.error('Error when bulk updating nft scam info in Elastic', {
          path: `${NftScamElasticService.name}.${this.updateBulkNftScamInfoInElastic.name}`,
          exception: error?.message,
        });
      }
    }
  }

  async setNftScamInfoManuallyInElastic(
    identifier: string,
    type?: ScamInfoTypeEnum,
    info?: string,
  ): Promise<void> {
    try {
      const updates = [
        this.mxService.buildBulkUpdate<string>(
          'tokens',
          identifier,
          elasticDictionary.scamInfo.typeKey,
          type ?? null,
        ),
        this.mxService.buildBulkUpdate<string>(
          'tokens',
          identifier,
          elasticDictionary.scamInfo.infoKey,
          info ?? null,
        ),
      ];
      await this.mxService.bulkRequest('tokens', updates);
    } catch (error) {
      this.logger.error(
        'Error when manually setting nft scam info in Elastic',
        {
          path: `${NftScamElasticService.name}.${this.setNftScamInfoManuallyInElastic.name}`,
          exception: error?.message,
        },
      );
    }
  }

  async getAllCollectionsFromElastic(): Promise<string[]> {
    const query = this.getAllCollectionsFromElasticQuery();
    let collections: string[] = [];
    await this.mxService.getScrollableList(
      'tokens',
      'token',
      query,
      async (items) => {
        collections = collections.concat([
          ...new Set(items.map((i) => i.token)),
        ]);
      },
    );
    return collections;
  }

  buildNftScamInfoBulkUpdate(nfts: Nft[], clearScamInfo?: boolean): string[] {
    let updates: string[] = [];
    for (const nft of nfts) {
      if (nft.scamInfo) {
        updates.push(
          this.mxService.buildBulkUpdate<string>(
            'tokens',
            nft.identifier,
            elasticDictionary.scamInfo.typeKey,
            nft.scamInfo.type,
          ),
        );
        updates.push(
          this.mxService.buildBulkUpdate<string>(
            'tokens',
            nft.identifier,
            elasticDictionary.scamInfo.infoKey,
            nft.scamInfo.info,
          ),
        );
      } else if (clearScamInfo) {
        updates.push(
          this.mxService.buildBulkUpdate<string>(
            'tokens',
            nft.identifier,
            elasticDictionary.scamInfo.typeKey,
            null,
          ),
        );
        updates.push(
          this.mxService.buildBulkUpdate<string>(
            'tokens',
            nft.identifier,
            elasticDictionary.scamInfo.infoKey,
            null,
          ),
        );
      }
    }
    return updates;
  }

  buildNftScamInfoDbToElasticMigrationBulkUpdate(
    nftsFromDb: NftScamInfoModel[],
    nftsFromElastic: any,
  ): string[] {
    let updates: string[] = [];
    for (let i = 0; i < nftsFromDb.length; i++) {
      const nftFromElastic = nftsFromElastic.find(
        (nft) => nft.identifier === nftsFromDb[i].identifier,
      );
      if (
        !nftsFromDb[i] &&
        nftFromElastic?.[elasticDictionary.scamInfo.typeKey]
      ) {
        updates.push(
          this.mxService.buildBulkUpdate<string>(
            'tokens',
            nftsFromDb[i].identifier,
            elasticDictionary.scamInfo.typeKey,
            null,
          ),
        );
        updates.push(
          this.mxService.buildBulkUpdate<string>(
            'tokens',
            nftsFromDb[i].identifier,
            elasticDictionary.scamInfo.infoKey,
            null,
          ),
        );
      } else {
        updates.push(
          this.mxService.buildBulkUpdate<string>(
            'tokens',
            nftsFromDb[i].identifier,
            elasticDictionary.scamInfo.typeKey,
            nftsFromDb[i].type,
          ),
        );
        updates.push(
          this.mxService.buildBulkUpdate<string>(
            'tokens',
            nftsFromDb[i].identifier,
            elasticDictionary.scamInfo.infoKey,
            nftsFromDb[i].info,
          ),
        );
      }
    }
    return updates;
  }

  getNftWithScamInfoFromElasticQuery(identifier: string): ElasticQuery {
    return ElasticQuery.create()
      .withMustExistCondition('nonce')
      .withMustCondition(
        QueryType.Match('identifier', identifier, QueryOperator.AND),
      )
      .withFields([
        'identifier',
        elasticDictionary.scamInfo.typeKey,
        elasticDictionary.scamInfo.infoKey,
      ])
      .withPagination({
        from: 0,
        size: 1,
      });
  }

  getAllCollectionsFromElasticQuery(): ElasticQuery {
    return ElasticQuery.create()
      .withMustExistCondition('token')
      .withMustNotExistCondition('nonce')
      .withMustMultiShouldCondition(
        [NftTypeEnum.NonFungibleESDT, NftTypeEnum.SemiFungibleESDT],
        (type) => QueryType.Match('type', type),
      )
      .withFields(['token'])
      .withPagination({
        from: 0,
        size: constants.getCollectionsFromElasticBatchSize,
      });
  }

  getAllCollectionNftsFromElasticQuery(collection: string): ElasticQuery {
    return ElasticQuery.create()
      .withMustExistCondition('nonce')
      .withMustCondition(
        QueryType.Match('token', collection, QueryOperator.AND),
      )
      .withMustMultiShouldCondition(
        [NftTypeEnum.NonFungibleESDT, NftTypeEnum.SemiFungibleESDT],
        (type) => QueryType.Match('type', type),
      )
      .withFields([
        'identifier',
        elasticDictionary.scamInfo.typeKey,
        elasticDictionary.scamInfo.infoKey,
      ])
      .withPagination({
        from: 0,
        size: constants.getNftsForScamInfoBatchSize,
      });
  }
}
