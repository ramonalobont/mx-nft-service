import { Inject, Injectable } from '@nestjs/common';
import { Auction } from './models';
import '../../utils/extensions';
import { AuctionEntity } from 'src/db/auctions';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as Redis from 'ioredis';
import { QueryRequest } from '../common/filters/QueryRequest';
import { GroupBy, Operation, Sort } from '../common/filters/filtersTypes';
import { CacheInfo } from 'src/common/services/caching/entities/cache.info';
import { CachingService } from 'src/common/services/caching/caching.service';
import { PriceRange } from 'src/db/auctions/price-range';
import { AuctionsCachingService } from './caching/auctions-caching.service';
import { Constants } from '@elrondnetwork/erdnest';
import { cacheConfig, elrondConfig } from 'src/config';
import { AuctionCustomEnum } from '../common/filters/AuctionCustomFilters';
import BigNumber from 'bignumber.js';
import { PersistenceService } from 'src/common/persistence/persistence.service';
import { Token } from 'src/common/services/elrond-communication/models/Token.model';
import { UsdPriceService } from '../usdPrice/usd-price.service';
import {
  auctionsByNoBidsRequest,
  buyNowAuctionRequest,
  getAuctionsForCollectionRequest,
  getAuctionsForPaymentTokenRequest,
  runningAuctionRequest,
} from './auctionsRequest';
import { CurrentPaymentTokensFilters } from './models/CurrentPaymentTokens.Filter';
import { BigNumberUtils } from 'src/utils/bigNumber-utils';

@Injectable()
export class AuctionsGetterService {
  private redisClient: Redis.Redis;
  private auctionsRedisClient: Redis.Redis;
  constructor(
    private persistenceService: PersistenceService,
    private auctionCachingService: AuctionsCachingService,
    private cacheService: CachingService,
    private readonly usdPriceService: UsdPriceService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    this.redisClient = this.cacheService.getClient(
      cacheConfig.persistentRedisClientName,
    );
    this.auctionsRedisClient = this.cacheService.getClient(
      cacheConfig.auctionsRedisClientName,
    );
  }

  async getAuctions(
    queryRequest: QueryRequest,
  ): Promise<[Auction[], number, PriceRange]> {
    try {
      return await this.auctionCachingService.getOrSetAuctions(
        queryRequest,
        () => this.getMappedAuctions(queryRequest),
      );
    } catch (error) {
      this.logger.error('An error occurred while get auctions', {
        path: 'AuctionsService.getAuctions',
        queryRequest,
        exception: error,
      });
    }
  }

  async getAuctionsOrderByNoBids(
    queryRequest: QueryRequest,
  ): Promise<[Auction[], number, PriceRange]> {
    try {
      const tags = queryRequest.getFilterName('tags');
      if (tags && tags.length > 0 && tags[0]) {
        return this.getMappedAuctionsOrderBids(queryRequest);
      }

      const [allAuctions, count, priceRange] =
        await this.cacheService.getOrSetCache(
          this.redisClient,
          CacheInfo.TopAuctionsOrderByNoBids.key,
          async () => this.getTopAuctionsOrderByNoBids(),
          CacheInfo.TopAuctionsOrderByNoBids.ttl,
        );

      const auctions = allAuctions.slice(
        queryRequest.offset,
        queryRequest.offset + queryRequest.limit,
      );

      return [auctions, count, priceRange];
    } catch (error) {
      this.logger.error(
        'An error occurred while get auctions order by number of bids',
        {
          path: 'AuctionsService.getAuctionsOrderByNoBids',
          queryRequest,
          exception: error,
        },
      );
    }
  }

  async getClaimableAuctions(
    limit: number = 10,
    offset: number = 0,
    address: string,
    marketplaceKey: string,
  ): Promise<[Auction[], number]> {
    const key: string = marketplaceKey
      ? `${address}_${marketplaceKey}`
      : address;
    try {
      return await this.auctionCachingService.getClaimableAuctions(
        limit,
        offset,
        key,
        () =>
          this.getMappedClaimableAuctions(
            limit,
            offset,
            address,
            marketplaceKey,
          ),
      );
    } catch (error) {
      this.logger.error('An error occurred while get auctions', {
        path: 'AuctionsService.getClaimableAuctions',
        address,
        exception: error,
      });
    }
  }

  async getAuctionsThatReachedDeadline(): Promise<AuctionEntity[]> {
    return await this.persistenceService.getAuctionsThatReachedDeadline();
  }

  async getAuctionById(id: number): Promise<AuctionEntity> {
    return await this.persistenceService.getAuction(id);
  }

  async getAuctionByIdAndMarketplace(
    id: number,
    marketplaceKey: string,
  ): Promise<AuctionEntity> {
    return await this.persistenceService.getAuctionByMarketplace(
      id,
      marketplaceKey,
    );
  }

  async getAvailableTokens(id: number): Promise<number> {
    return await this.persistenceService.getAvailableTokensByAuctionId(id);
  }

  async getMinMaxPrice(
    token: string,
  ): Promise<{ minBid: string; maxBid: string }> {
    try {
      return await this.auctionCachingService.getMinAndMax(token, () =>
        this.persistenceService.getMinMax(token),
      );
    } catch (error) {
      this.logger.error('An error occurred while getting min max price', {
        path: 'AuctionsService.getMinMaxPrice',
        exception: error,
      });
    }
  }

  private async getMappedClaimableAuctions(
    limit: number = 10,
    offset: number = 0,
    address: string,
    marketplaceKey: string,
  ) {
    let [auctions, count] = [[], 0];
    if (marketplaceKey) {
      [auctions, count] =
        await this.persistenceService.getClaimableAuctionsForMarketplaceKey(
          limit,
          offset,
          address,
          marketplaceKey,
        );
    } else {
      [auctions, count] = await this.persistenceService.getClaimableAuctions(
        limit,
        offset,
        address,
      );
    }
    return [auctions?.map((element) => Auction.fromEntity(element)), count];
  }

  private async getMappedAuctions(
    queryRequest: QueryRequest,
  ): Promise<[Auction[], number, PriceRange]> {
    if (this.filtersByIdentifierWithoutId(queryRequest)) {
      return await this.getAuctionsForIdentifier(queryRequest);
    }
    if (queryRequest?.groupByOption?.groupBy === GroupBy.IDENTIFIER) {
      return await this.getAuctionsGroupByIdentifier(queryRequest);
    }

    const [auctions, count, priceRange] =
      await this.persistenceService.getAuctions(queryRequest);

    return [
      auctions?.map((element) => Auction.fromEntity(element)),
      count,
      priceRange,
    ];
  }

  private filtersByIdentifierWithoutId(queryRequest: QueryRequest) {
    return (
      queryRequest?.filters?.filters?.some(
        (f) => f.field === 'identifier' && f.op === Operation.EQ,
      ) &&
      !queryRequest?.filters?.filters?.some(
        (f) => f.field === 'id' && f.op === Operation.EQ,
      )
    );
  }

  private async getAuctionsForIdentifier(
    queryRequest: QueryRequest,
  ): Promise<[Auction[], number, PriceRange]> {
    const [auctions, count, priceRange] =
      await this.persistenceService.getAuctionsForIdentifier(queryRequest);
    return [
      auctions?.map((element) => Auction.fromEntity(element)),
      count,
      priceRange,
    ];
  }

  async getAuctionsGroupByIdentifier(
    queryRequest: QueryRequest,
  ): Promise<[Auction[], number, PriceRange]> {
    const collectionFilter = queryRequest.getFilterName('collection');
    const paymentTokenFilter = queryRequest.getFilterName('paymentToken');
    let paymentDecimals = elrondConfig.decimals;
    const currentPriceFilter = queryRequest.getRange(
      AuctionCustomEnum.CURRENTPRICE,
    );
    const sort = queryRequest.getSort();
    const allFilters = queryRequest.getAllFilters();

    const hasCurrentPriceFilter =
      currentPriceFilter &&
      (currentPriceFilter.startPrice !== '0000000000000000000' ||
        currentPriceFilter.endPrice !== '0000000000000000000');

    if (
      collectionFilter &&
      !hasCurrentPriceFilter &&
      (!paymentTokenFilter || paymentTokenFilter === elrondConfig.egld)
    ) {
      return await this.retriveCollectionAuctions(
        collectionFilter,
        queryRequest,
        sort,
      );
    }

    if (paymentTokenFilter) {
      return await this.retriveTokensAuctions(
        paymentTokenFilter,
        queryRequest,
        sort,
      );
    }

    if (this.requestForRunningAuctions(allFilters, queryRequest)) {
      return await this.retrieveRunningAuctions(sort, queryRequest);
    }

    if (this.requestForBuyNowAuctions(allFilters, queryRequest)) {
      return await this.retrieveBuyNowAuctions(sort, queryRequest);
    }

    const [auctions, count, priceRange] =
      await this.persistenceService.getAuctionsGroupBy(queryRequest);

    if (paymentTokenFilter) {
      const paymentToken = await this.usdPriceService.getToken(
        paymentTokenFilter,
      );
      paymentDecimals = paymentToken?.decimals;
    }
    return [
      auctions?.map((element) => Auction.fromEntity(element)),
      count,
      { ...priceRange, paymentDecimals },
    ];
  }

  private async retriveCollectionAuctions(
    collectionFilter: string,
    queryRequest: QueryRequest,
    sort: { field: string; direction: Sort },
  ): Promise<[Auction[], number, PriceRange]> {
    let [allAuctions, _totalCount, priceRange] =
      await this.cacheService.getOrSetCache(
        this.auctionsRedisClient,
        `collectionAuctions:${collectionFilter}`,
        async () => await this.getAuctionsByCollection(collectionFilter),
        Constants.oneMinute() * 10,
        Constants.oneSecond() * 30,
      );

    const marketplaceFilter = queryRequest.getFilterName('marketplaceKey');
    const typeFilter = queryRequest.getFilter('type');
    if (typeFilter) {
      allAuctions = allAuctions.filter((x) =>
        typeFilter.values.includes(x.type),
      );
    }

    const paymentTokenFilter = queryRequest.getFilterName('paymentToken');
    if (paymentTokenFilter) {
      allAuctions = allAuctions.filter(
        (x) => x.minBid?.token === paymentTokenFilter,
      );
      priceRange = await this.computePriceRange(
        allAuctions,
        paymentTokenFilter,
      );
    }

    if (marketplaceFilter) {
      allAuctions = allAuctions.filter(
        (x) => x.marketplaceKey === marketplaceFilter,
      );

      priceRange = await this.computePriceRange(
        allAuctions,
        paymentTokenFilter ?? elrondConfig.egld,
      );
    }

    if (sort) {
      if (sort.direction === Sort.ASC) {
        allAuctions = allAuctions.sorted((x) => x[sort.field]);
      } else {
        allAuctions = allAuctions.sortedDescending((x) => x[sort.field]);
      }
    }

    const count = allAuctions.length;
    const auctions = allAuctions.slice(
      queryRequest.offset,
      queryRequest.offset + queryRequest.limit,
    );

    return [auctions, count, priceRange];
  }

  private async retriveTokensAuctions(
    paymentTokenFilter: string,
    queryRequest: QueryRequest,
    sort: { field: string; direction: Sort },
  ): Promise<[Auction[], number, PriceRange]> {
    let [allAuctions, _totalCount, priceRange] =
      await this.cacheService.getOrSetCache(
        this.auctionsRedisClient,
        `paymentTokenAuctions:${paymentTokenFilter}`,
        async () => await this.getAuctionsByPaymentToken(paymentTokenFilter),
        Constants.oneMinute() * 10,
        Constants.oneSecond() * 30,
      );

    const paymentToken = await this.usdPriceService.getToken(
      paymentTokenFilter,
    );
    const marketplaceFilter = queryRequest.getFilterName('marketplaceKey');
    const typeFilter = queryRequest.getFilter('type');
    if (typeFilter) {
      allAuctions = allAuctions.filter((x) =>
        typeFilter.values.includes(x.type),
      );
    }

    const collectionFilter = queryRequest.getFilterName('collection');

    if (collectionFilter) {
      allAuctions = allAuctions.filter(
        (x) => x.collection === collectionFilter,
      );
      priceRange = await this.computePriceRange(
        allAuctions,
        paymentTokenFilter,
      );
    }
    if (marketplaceFilter) {
      allAuctions = allAuctions.filter(
        (x) => x.marketplaceKey === marketplaceFilter,
      );
      priceRange = await this.computePriceRange(
        allAuctions,
        paymentTokenFilter,
      );
    }

    const currentPriceFilter = queryRequest.getRange(
      AuctionCustomEnum.CURRENTPRICE,
    );

    if (currentPriceFilter && currentPriceFilter.startPrice) {
      const minBid = BigNumberUtils.denominateAmount(
        currentPriceFilter.startPrice ?? '0',
        paymentToken.decimals,
      );
      const maxBid = BigNumberUtils.denominateAmount(
        currentPriceFilter.endPrice ?? '0',
        paymentToken.decimals,
      );
      allAuctions = allAuctions.filter(
        (a) => a.startBid >= minBid && a.startBid <= maxBid,
      );
    }
    if (sort) {
      if (sort.direction === Sort.ASC) {
        allAuctions = allAuctions.sorted((x) => x[sort.field]);
      } else {
        allAuctions = allAuctions.sortedDescending((x) => x[sort.field]);
      }
    }

    const count = allAuctions.length;
    const auctions = allAuctions.slice(
      queryRequest.offset,
      queryRequest.offset + queryRequest.limit,
    );

    return [
      auctions,
      count,
      { ...priceRange, paymentDecimals: paymentToken?.decimals },
    ];
  }

  private async retrieveRunningAuctions(
    sort: { field: string; direction: Sort },
    queryRequest: QueryRequest,
  ): Promise<[Auction[], number, PriceRange]> {
    let [allAuctions, _totalCount, priceRange] =
      await this.cacheService.getOrSetCache(
        this.redisClient,
        CacheInfo.ActiveAuctions.key,
        async () => await this.getActiveAuctions(),
        CacheInfo.ActiveAuctions.ttl,
        Constants.oneSecond() * 30,
      );

    if (sort) {
      if (sort.direction === Sort.ASC) {
        allAuctions = allAuctions.sorted((x) => x[sort.field]);
      } else {
        allAuctions = allAuctions.sortedDescending((x) => x[sort.field]);
      }
    }

    const count = allAuctions.length;
    const auctions = allAuctions.slice(
      queryRequest.offset,
      queryRequest.offset + queryRequest.limit,
    );

    return [auctions, count, priceRange];
  }

  private async retrieveBuyNowAuctions(
    sort: { field: string; direction: Sort },
    queryRequest: QueryRequest,
  ): Promise<[Auction[], number, PriceRange]> {
    let [allAuctions, _totalCount, priceRange] =
      await this.cacheService.getOrSetCache(
        this.redisClient,
        CacheInfo.ActiveAuctions.key,
        async () => await this.getBuyNowAuctions(),
        CacheInfo.ActiveAuctions.ttl,
        Constants.oneSecond() * 30,
      );

    if (sort) {
      if (sort.direction === Sort.ASC) {
        allAuctions = allAuctions.sorted((x) => x[sort.field]);
      } else {
        allAuctions = allAuctions.sortedDescending((x) => x[sort.field]);
      }
    }

    const count = allAuctions.length;
    const auctions = allAuctions.slice(
      queryRequest.offset,
      queryRequest.offset + queryRequest.limit,
    );

    return [auctions, count, priceRange];
  }

  private requestForRunningAuctions(
    allFilters: Record<string, string>,
    queryRequest: QueryRequest,
  ) {
    const statusFilter = queryRequest.getFilterName('status');
    const startDateFilter = queryRequest.getFilterName('startDate');
    return (
      Object.keys(allFilters).length === 2 && statusFilter && startDateFilter
    );
  }

  private requestForBuyNowAuctions(
    allFilters: Record<string, string>,
    queryRequest: QueryRequest,
  ) {
    const statusFilter = queryRequest.getFilterName('status');
    const startDateFilter = queryRequest.getFilterName('startDate');
    const buyNowFilter = queryRequest.getFilter('maxBid');
    return (
      Object.keys(allFilters).length === 3 &&
      statusFilter &&
      startDateFilter &&
      buyNowFilter &&
      buyNowFilter.op === Operation.GE
    );
  }

  private async computePriceRange(
    auctions: Auction[],
    paymentTokenIdentifier: string,
  ): Promise<PriceRange> {
    const paymentToken = await this.usdPriceService.getToken(
      paymentTokenIdentifier,
    );
    const minBids = auctions
      .filter((x) => x.minBid.token === paymentTokenIdentifier)
      .map((x) =>
        new BigNumber(x.minBid.amount).dividedBy(
          new BigNumber(10 ** paymentToken?.decimals),
        ),
      );
    let minBid = new BigNumber('Infinity');
    for (const amount of minBids) {
      if (amount.isLessThan(minBid)) {
        minBid = amount;
      }
    }

    const maxBids = auctions
      .filter((x) => x.maxBid.token === paymentTokenIdentifier)
      .map((x) =>
        new BigNumber(x.maxBid.amount).dividedBy(
          new BigNumber(10 ** paymentToken?.decimals),
        ),
      );
    let maxBid = minBid;
    for (const amount of maxBids) {
      if (amount.isGreaterThan(maxBid)) {
        maxBid = amount;
      }
    }

    return {
      minBid: minBid.isFinite() ? minBid.toString() : '0',
      maxBid: maxBid.isFinite() ? maxBid.toString() : '0',
      paymentToken: paymentTokenIdentifier,
      paymentDecimals: paymentToken?.decimals,
    };
  }

  // TODO: use db access directly without intermediate caching layers once we optimize the model
  async getTopAuctionsOrderByNoBids(): Promise<
    [Auction[], number, PriceRange]
  > {
    return this.getMappedAuctionsOrderBids(auctionsByNoBidsRequest);
  }

  // TODO: use db access directly without intermediate caching layers once we optimize the model
  async getBuyNowAuctions(): Promise<[Auction[], number, PriceRange]> {
    return await this.getAuctionsGroupByIdentifierRaw(buyNowAuctionRequest);
  }

  // TODO: use db access directly without intermediate caching layers once we optimize the model
  async getActiveAuctions(): Promise<[Auction[], number, PriceRange]> {
    return await this.getAuctionsGroupByIdentifierRaw(runningAuctionRequest);
  }

  // TODO: use db access directly without intermediate caching layers once we optimize the model
  async getAuctionsByCollection(
    collection: string,
  ): Promise<[Auction[], number, PriceRange]> {
    const queryRequest = getAuctionsForCollectionRequest(collection);

    return await this.getAuctionsGroupByIdentifierRaw(queryRequest);
  }

  // TODO: use db access directly without intermediate caching layers once we optimize the model
  async getAuctionsByPaymentToken(
    paymentToken: string,
  ): Promise<[Auction[], number, PriceRange]> {
    const queryRequest = getAuctionsForPaymentTokenRequest(paymentToken);

    return await this.getAuctionsGroupByIdentifierRaw(queryRequest);
  }

  async getAuctionsGroupByIdentifierRaw(
    queryRequest: QueryRequest,
  ): Promise<[Auction[], number, PriceRange]> {
    const [auctions, count, priceRange] =
      await this.persistenceService.getAuctionsGroupBy(queryRequest);

    return [
      auctions?.map((element) => Auction.fromEntityWithStartBid(element)),
      count,
      priceRange,
    ];
  }

  private async getMappedAuctionsOrderBids(
    queryRequest: QueryRequest,
  ): Promise<[Auction[], number, PriceRange]> {
    let [auctions, count, priceRange] = [[], 0, undefined];
    if (queryRequest?.groupByOption?.groupBy === GroupBy.IDENTIFIER) {
      [auctions, count, priceRange] =
        await this.persistenceService.getAuctionsOrderByOrdersCountGroupByIdentifier(
          queryRequest,
        );
    } else {
      [auctions, count, priceRange] =
        await this.persistenceService.getAuctionsOrderByOrdersCount(
          queryRequest,
        );
    }

    return [
      auctions?.map((element) => Auction.fromEntity(element)),
      count,
      priceRange,
    ];
  }

  async getCurrentPaymentTokens(
    filters?: CurrentPaymentTokensFilters,
  ): Promise<Token[]> {
    try {
      return await this.auctionCachingService.getCurrentPaymentTokens(
        () =>
          this.getMappedCurrentPaymentTokens(
            filters?.marketplaceKey,
            filters?.collectionIdentifier,
          ),
        filters?.marketplaceKey,
        filters?.collectionIdentifier,
      );
    } catch (error) {
      this.logger.error('An error occurred while get auctions', {
        path: 'AuctionsService.getCurrentPaymentTokens',
        marketplaceKey: filters?.marketplaceKey,
        collectionIdentifier: filters?.collectionIdentifier,
        exception: error,
      });
    }
  }

  private async getMappedCurrentPaymentTokens(
    marketplaceKey?: string,
    collectionIdentifier?: string,
  ): Promise<Token[]> {
    const [currentPaymentTokenIds, allMexTokens, egldToken, lkmexToken] =
      await Promise.all([
        this.persistenceService.getCurrentPaymentTokenIdsWithCounts(
          marketplaceKey,
          collectionIdentifier,
        ),
        this.usdPriceService.getCachedMexTokensWithDecimals(),
        this.usdPriceService.getToken(elrondConfig.egld),
        this.usdPriceService.getToken(elrondConfig.lkmex),
      ]);

    const allTokens: Token[] = allMexTokens
      .concat(egldToken)
      .concat(lkmexToken);
    let mappedTokens = [];
    for (const payment of currentPaymentTokenIds) {
      const token = allTokens.find(
        (x) => x.identifier === payment.paymentToken,
      );
      if (token) {
        mappedTokens.push({ ...token, activeAuctions: payment.activeAuctions });
      }
    }

    return mappedTokens;
  }
}
