import { Injectable } from '@nestjs/common';
import '../../utils/extentions';
import { CollectionType } from '../assets/models/Collection.type';
import { MarketplaceRepository } from 'src/db/marketplaces/marketplaces.repository';
import { Marketplace } from './models';
import { MarketplacesCachingService } from './marketplaces-caching.service';
import { MarketplaceEntity } from 'src/db/marketplaces';
import { MarketplaceTypeEnum } from './models/MarketplaceType.enum';
import { MarketplaceCollectionsRepository } from 'src/db/marketplaces/marketplace-collections.repository';
import { MarketplaceFilters } from './models/Marketplace.Filter';

@Injectable()
export class MarketplacesService {
  constructor(
    private marketplacesRepository: MarketplaceRepository,
    private marketplaceCollectionsRepository: MarketplaceCollectionsRepository,
    private cacheService: MarketplacesCachingService,
  ) {}

  async getMarketplaces(
    limit: number = 10,
    offset: number = 0,
    filters: MarketplaceFilters,
  ): Promise<CollectionType<Marketplace>> {
    let allMarketplaces = await this.getAllMarketplaces();
    if (filters?.marketplaceKey) {
      const marketplace = allMarketplaces?.items?.find(
        (m) => m.key === filters?.marketplaceKey,
      );

      return new CollectionType({
        count: marketplace ? 1 : 0,
        items: [marketplace],
      });
    }
    const marketplaces = allMarketplaces?.items?.slice(offset, offset + limit);

    return new CollectionType({
      count: marketplaces?.length,
      items: marketplaces,
    });
  }

  async getInternalMarketplacesAddreses(): Promise<string[]> {
    let allMarketplaces = await this.getAllMarketplaces();

    const internalMarketplaces = allMarketplaces?.items?.filter(
      (m) => m.type === MarketplaceTypeEnum.Internal,
    );

    return internalMarketplaces.map((m) => m.address);
  }

  async getExternalMarketplacesAddreses(): Promise<string[]> {
    let allMarketplaces = await this.getAllMarketplaces();

    const externalMarketplaces = allMarketplaces?.items?.filter(
      (m) => m.type === MarketplaceTypeEnum.External,
    );

    return externalMarketplaces.map((m) => m.address);
  }

  async getInternalMarketplacesAddresesByKey(key: string): Promise<string> {
    let allMarketplaces = await this.getAllMarketplaces();

    const internalMarketplace = allMarketplaces?.items?.find(
      (m) => m.key === key,
    );

    return internalMarketplace?.address;
  }

  async getMarketplaceByCollectionAndAddress(
    collection: string,
    address: string,
  ): Promise<Marketplace> {
    return await this.cacheService.getMarketplaceByAddressAndCollection(
      () =>
        this.getMarketplaceByAddressAndCollectionFromDb(collection, address),
      `${collection}_${address}`,
    );
  }

  async getMarketplaceByCollection(collection: string): Promise<Marketplace> {
    return await this.cacheService.getMarketplaceByCollection(
      () => this.getMarketplaceByCollectionFromDb(collection),
      collection,
    );
  }

  async getCollectionsByMarketplace(marketplaceKey: string): Promise<string[]> {
    return await this.cacheService.getCollectionsByMarketplace(
      () => this.getCollectionsByMarketplaceFromDb(marketplaceKey),
      marketplaceKey,
    );
  }

  private async getAllMarketplaces(): Promise<CollectionType<Marketplace>> {
    return await this.cacheService.getAllMarketplaces(() =>
      this.getMarketplacesFromDb(),
    );
  }

  async getMarketplacesFromDb(): Promise<CollectionType<Marketplace>> {
    let [campaigns, count]: [MarketplaceEntity[], number] =
      await this.marketplacesRepository.getMarketplaces();
    return new CollectionType({
      count: count,
      items: campaigns.map((campaign) => Marketplace.fromEntity(campaign)),
    });
  }

  async getMarketplaceByAddressAndCollectionFromDb(
    collection: string,
    address: string,
  ): Promise<Marketplace> {
    let marketplace: MarketplaceEntity[] =
      await this.marketplaceCollectionsRepository.getMarketplaceByAddressAndCollection(
        collection,
        address,
      );
    return marketplace?.length > 0
      ? Marketplace.fromEntity(marketplace[0])
      : null;
  }

  async getMarketplaceByAddress(address: string): Promise<Marketplace> {
    let marketplace: MarketplaceEntity =
      await this.marketplacesRepository.getMarketplaceByAddress(address);
    return marketplace ? Marketplace.fromEntity(marketplace) : null;
  }

  async getMarketplaceByCollectionFromDb(
    collection: string,
  ): Promise<Marketplace> {
    let marketplace: MarketplaceEntity[] =
      await this.marketplaceCollectionsRepository.getMarketplaceByCollection(
        collection,
      );
    return marketplace?.length > 0
      ? Marketplace.fromEntity(marketplace[0])
      : null;
  }

  async getCollectionsByMarketplaceFromDb(
    marketplaceKey: string,
  ): Promise<string[]> {
    const collections =
      await this.marketplaceCollectionsRepository.getCollectionsByMarketplace(
        marketplaceKey,
      );
    return collections.map((c) => c.collectionIdentifier);
  }
}