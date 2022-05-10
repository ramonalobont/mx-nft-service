import {
  Resolver,
  Query,
  Args,
  ResolveField,
  Parent,
  Int,
} from '@nestjs/graphql';
import { BaseResolver } from '../common/base.resolver';
import { Auction, AuctionTypeEnum, AuctionResponse } from './models';
import { NftMarketplaceAbiService } from './nft-marketplace.abi.service';
import { Asset, Price } from '../assets/models';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/gql.auth-guard';
import { AccountsProvider } from '../account-stats/loaders/accounts.loader';
import { AssetsProvider } from '../assets/loaders/assets.loader';
import { Selections } from '@jenyus-org/nestjs-graphql-utils';
import { Account } from '../account-stats/models';
import ConnectionArgs from '../common/filters/ConnectionArgs';
import {
  FiltersExpression,
  Sorting,
  Grouping,
} from '../common/filters/filtersTypes';
import PageResponse from '../common/PageResponse';
import { QueryRequest } from '../common/filters/QueryRequest';
import { User } from '../auth/user';
import { AvailableTokensForAuctionProvider } from './loaders/available-tokens-auction.loader';
import { LastOrdersProvider } from '../orders/loaders/last-order.loader';
import { AuctionsGetterService } from './auctions-getter.service';

@Resolver(() => Auction)
export class AuctionsQueriesResolver extends BaseResolver(Auction) {
  constructor(
    private auctionsService: AuctionsGetterService,
    private nftAbiService: NftMarketplaceAbiService,
    private accountsProvider: AccountsProvider,
    private assetsProvider: AssetsProvider,
    private lastOrderProvider: LastOrdersProvider,
    private availableTokensProvider: AvailableTokensForAuctionProvider,
  ) {
    super();
  }

  @Query(() => AuctionResponse)
  async auctions(
    @Args({ name: 'filters', type: () => FiltersExpression, nullable: true })
    filters,
    @Args({ name: 'sorting', type: () => [Sorting], nullable: true })
    sorting,
    @Args({ name: 'grouping', type: () => Grouping, nullable: true })
    groupBy,
    @Args({ name: 'pagination', type: () => ConnectionArgs, nullable: true })
    pagination: ConnectionArgs,
  ) {
    const { limit, offset } = pagination.pagingParams();
    const [auctions, count] = await this.auctionsService.getAuctions(
      new QueryRequest({
        limit,
        offset,
        filters,
        sorting,
        groupByOption: groupBy,
      }),
    );
    return PageResponse.mapResponse<Auction>(
      auctions,
      pagination,
      count,
      offset,
      limit,
    );
  }

  @Query(() => AuctionResponse)
  async auctionsSortByBids(
    @Args({ name: 'filters', type: () => FiltersExpression, nullable: true })
    filters,
    @Args({ name: 'grouping', type: () => Grouping, nullable: true })
    groupBy,
    @Args({ name: 'pagination', type: () => ConnectionArgs, nullable: true })
    pagination: ConnectionArgs,
  ) {
    const { limit, offset } = pagination.pagingParams();
    const [auctions, count] =
      await this.auctionsService.getAuctionsOrderByNoBids(
        new QueryRequest({ limit, offset, filters, groupByOption: groupBy }),
      );

    return PageResponse.mapResponse<Auction>(
      auctions,
      pagination,
      count,
      offset,
      limit,
    );
  }

  @Query(() => String)
  async marketplaceCutPercentage() {
    return await this.nftAbiService.getCutPercentage();
  }

  @Query(() => AuctionResponse)
  @UseGuards(GqlAuthGuard)
  async myClaimableAuctions(
    @User() user: any,
    @Args({ name: 'pagination', type: () => ConnectionArgs, nullable: true })
    pagination: ConnectionArgs,
  ) {
    const { limit, offset } = pagination.pagingParams();
    const [auctions, count] = await this.auctionsService.getClaimableAuctions(
      limit,
      offset,
      user.publicKey,
    );
    return PageResponse.mapResponse<Auction>(
      auctions,
      pagination,
      count,
      offset,
      limit,
    );
  }

  @ResolveField('asset', () => Asset)
  async asset(
    @Parent() auction: Auction,
    @Selections('asset', ['*.']) fields: string[],
  ) {
    const { identifier } = auction;
    if (this.hasToResolveAsset(fields)) {
      const asset = await this.assetsProvider.load(identifier);
      return asset?.value ?? null;
    }

    return new Asset({ identifier: identifier });
  }

  @ResolveField('topBid', () => Price)
  async topBid(@Parent() auction: Auction) {
    const { id, type } = auction;
    if (type === AuctionTypeEnum.SftOnePerPayment) return null;
    const activeOrders = await this.lastOrderProvider.load(id);
    const activeOrdersValue = activeOrders?.value;
    return activeOrdersValue?.length > 0
      ? Price.fromEntity(activeOrdersValue[activeOrdersValue.length - 1])
      : null;
  }

  @ResolveField('topBidder', () => Account)
  async topBidder(
    @Parent() auction: Auction,
    @Selections('topBidder', ['*.']) fields: string[],
  ) {
    const { id, type } = auction;
    if (type === AuctionTypeEnum.SftOnePerPayment) return null;
    const activeOrders = await this.lastOrderProvider.load(id);
    const activeOrdersValue = activeOrders?.value;
    return activeOrdersValue && activeOrdersValue?.length > 0
      ? await this.getAccount(
          fields,
          activeOrdersValue[activeOrdersValue?.length - 1].ownerAddress,
        )
      : null;
  }

  @ResolveField('availableTokens', () => Int)
  async availableTokens(@Parent() auction: Auction) {
    const { id, nrAuctionedTokens, type } = auction;
    if (type === AuctionTypeEnum.SftOnePerPayment) {
      const availableTokens = await this.availableTokensProvider.load(id);
      return availableTokens?.value ?? 0;
    }
    return nrAuctionedTokens;
  }

  @ResolveField('owner', () => Account)
  async owner(
    @Parent() auction: Auction,
    @Selections('owner', ['*.']) fields: string[],
  ) {
    const { ownerAddress } = auction;

    if (!ownerAddress) return null;
    return await this.getAccount(fields, ownerAddress);
  }

  private hasToResolveAsset(fields: string[]) {
    return (
      fields.filter(
        (x) =>
          x !== 'totalAvailableTokens' &&
          x !== 'totalRunningAuctions' &&
          x !== 'identifier' &&
          x !== 'hasAvailableAuctions',
      ).length > 0
    );
  }

  private async getAccount(fields: string[], ownerAddress: any) {
    const account = this.hasToResolveAccount(fields)
      ? Account.fromEntity(
          (await this.accountsProvider.load(ownerAddress)).value,
          ownerAddress,
        )
      : Account.fromEntity(null, ownerAddress);
    return account;
  }

  private hasToResolveAccount(fields: string[]) {
    return (
      fields.length > 1 || (fields.length === 1 && fields[0] !== 'address')
    );
  }
}