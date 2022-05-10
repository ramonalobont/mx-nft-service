import {
  Resolver,
  Query,
  Args,
  ResolveField,
  Parent,
  Int,
} from '@nestjs/graphql';
import { BaseResolver } from '../common/base.resolver';
import { AssetsService } from '.';
import { Asset, AssetsResponse, NftTypeEnum } from './models';
import { Auction } from '../auctions/models';
import { Account } from '../account-stats/models/Account.dto';
import { AccountsProvider } from '../account-stats/loaders/accounts.loader';
import { AssetLikesProvider } from './loaders/asset-likes-count.loader';
import { AssetAuctionsCountProvider } from './loaders/asset-auctions-count.loader';
import { AssetAvailableTokensCountProvider } from './loaders/asset-available-tokens-count.loader';
import { AssetsSupplyLoader } from './loaders/assets-supply.loader';
import { AssetScamInfoProvider } from './loaders/assets-scam-info.loader';
import { IsAssetLikedProvider } from './loaders/asset-is-liked.loader';
import { LowestAuctionProvider } from '../auctions/loaders/lowest-auctions.loader';
import ConnectionArgs from '../common/filters/ConnectionArgs';
import { AssetsFilter } from '../common/filters/filtersTypes';
import PageResponse from '../common/PageResponse';
import { AssetsViewsLoader } from './loaders/assets-views.loader';

@Resolver(() => Asset)
export class AssetsQueriesResolver extends BaseResolver(Asset) {
  constructor(
    private assetsService: AssetsService,
    private accountsProvider: AccountsProvider,
    private assetsLikeProvider: AssetLikesProvider,
    private assetsViewsProvider: AssetsViewsLoader,
    private isAssetLikedProvider: IsAssetLikedProvider,
    private assetSupplyProvider: AssetsSupplyLoader,
    private assetsAuctionsProvider: AssetAuctionsCountProvider,
    private assetAvailableTokensCountProvider: AssetAvailableTokensCountProvider,
    private lowestAuctionProvider: LowestAuctionProvider,
    private assetScamProvider: AssetScamInfoProvider,
  ) {
    super();
  }

  @Query(() => AssetsResponse)
  async assets(
    @Args({ name: 'filters', type: () => AssetsFilter, nullable: true })
    filters,
    @Args({ name: 'pagination', type: () => ConnectionArgs, nullable: true })
    pagination: ConnectionArgs,
  ): Promise<AssetsResponse> {
    const { limit, offset } = pagination.pagingParams();
    const response = await this.assetsService.getAssets(offset, limit, filters);

    return PageResponse.mapResponse<Asset>(
      response?.items || [],
      pagination,
      response?.count || 0,
      offset,
      limit,
    );
  }

  @ResolveField('likesCount', () => Int)
  async likesCount(@Parent() asset: Asset) {
    const { identifier } = asset;
    const assetLikes = await this.assetsLikeProvider.load(identifier);
    return assetLikes || 0;
  }

  @ResolveField('viewsCount', () => Int)
  async viewsCount(@Parent() asset: Asset) {
    const { identifier } = asset;
    const assetviews = await this.assetsViewsProvider.load(identifier);
    return assetviews?.value ?? 0;
  }

  @ResolveField('supply', () => String)
  async supply(@Parent() asset: Asset) {
    const { identifier, type } = asset;
    if (type === NftTypeEnum.NonFungibleESDT) {
      return '1';
    }
    const assetSupply = await this.assetSupplyProvider.load(identifier);
    return assetSupply?.value ?? 0;
  }

  @ResolveField('isLiked', () => Boolean)
  async isLiked(@Parent() asset: Asset, @Args('byAddress') byAddress: string) {
    const { identifier } = asset;
    const assetLikes = await this.isAssetLikedProvider.load(
      `${identifier}_${byAddress}`,
    );
    return !!assetLikes?.value ?? false;
  }

  @ResolveField('totalRunningAuctions', () => String)
  async totalRunningAuctions(@Parent() asset: Asset) {
    const { identifier } = asset;
    const assetAuctions = await this.assetsAuctionsProvider.load(identifier);
    return assetAuctions?.value ?? 0;
  }

  @ResolveField('hasAvailableAuctions', () => Boolean)
  async hasAvailableAuctions(@Parent() asset: Asset) {
    const { identifier } = asset;
    const assetAuctions = await this.assetsAuctionsProvider.load(identifier);
    return !!assetAuctions?.value ?? false;
  }

  @ResolveField('totalAvailableTokens', () => String)
  async totalAvailableTokens(@Parent() asset: Asset) {
    const { identifier } = asset;
    const availableTokens = await this.assetAvailableTokensCountProvider.load(
      identifier,
    );
    return availableTokens?.value ?? 0;
  }

  @ResolveField('scamInfo', () => String)
  async scamInfo(@Parent() asset: Asset) {
    const { identifier } = asset;
    const scamInfo = await this.assetScamProvider.load(identifier);
    const scamInfoValue = scamInfo.value;
    return scamInfoValue && Object.keys(scamInfoValue).length !== 0
      ? scamInfoValue
      : null;
  }

  @ResolveField('lowestAuction', () => Auction)
  async lowestAuction(@Parent() asset: Asset) {
    const { identifier } = asset;
    if (!identifier) {
      return null;
    }
    const auctions = await this.lowestAuctionProvider.load(identifier);
    return auctions?.value ? Auction.fromEntity(auctions?.value) : null;
  }

  @ResolveField('creator', () => Account)
  async creator(@Parent() asset: Asset) {
    const { creatorAddress } = asset;

    if (!creatorAddress) return null;
    const account = await this.accountsProvider.load(creatorAddress);
    return Account.fromEntity(account?.value, creatorAddress);
  }

  @ResolveField(() => Account)
  async owner(@Parent() asset: Asset) {
    const { ownerAddress } = asset;

    if (!ownerAddress) return null;
    const account = await this.accountsProvider.load(ownerAddress);
    return Account.fromEntity(account?.value, ownerAddress);
  }
}