import {
  Resolver,
  Query,
  Args,
  ResolveField,
  Parent,
  Mutation,
  Int,
} from '@nestjs/graphql';
import { AuctionsService } from './auctions.service';
import { BaseResolver } from '../base.resolver';
import { Account } from '../accounts/models/account.dto';
import {
  Auction,
  CreateAuctionArgs,
  TokenActionArgs,
  BidActionArgs,
  UpdateAuctionArgs,
} from './models';
import { AccountsService } from '../accounts/accounts.service';
import { AssetsService } from '../assets/assets.service';
import { elrondConfig } from 'src/config';
import { NftMarketplaceAbiService } from './nft-marketplace.abi.service';
import { TransactionNode } from '../transaction';
import { Asset } from '../assets/models/Asset.dto';
import { Order } from '../orders/models/Order.dto';
import { OrdersService } from '../orders/order.service';
import { Price } from '../assets/models';

@Resolver(() => Auction)
export class AuctionsResolver extends BaseResolver(Auction) {
  constructor(
    private auctionsService: AuctionsService,
    private nftAbiService: NftMarketplaceAbiService,
    private accountsService: AccountsService,
    private assetsService: AssetsService,
    private ordersService: OrdersService,
  ) {
    super();
  }

  @Mutation(() => TransactionNode)
  async createAuction(
    @Args('input') input: CreateAuctionArgs,
  ): Promise<TransactionNode> {
    return await this.nftAbiService.createAuction(input);
  }

  @Mutation(() => TransactionNode)
  async endAuction(
    @Args('input') input: TokenActionArgs,
  ): Promise<TransactionNode> {
    return await this.nftAbiService.endAuction(input);
  }

  @Mutation(() => Auction)
  async updateAuctionStatus(
    @Args('input') input: UpdateAuctionArgs,
  ): Promise<TransactionNode> {
    return await this.auctionsService.updateAuction(input);
  }

  @Mutation(() => TransactionNode)
  async bid(@Args('input') input: BidActionArgs): Promise<TransactionNode> {
    return await this.nftAbiService.bid(input);
  }

  @Mutation(() => TransactionNode)
  async withdraw(
    @Args('input') input: TokenActionArgs,
  ): Promise<TransactionNode> {
    return await this.nftAbiService.withdraw(input);
  }

  @Mutation(() => Auction)
  async saveAuction(
    @Args('token') tokenId: string,
    @Args('nonce', { type: () => Int }) nonce: number,
  ): Promise<Auction> {
    return await this.auctionsService.saveAuction(tokenId, nonce);
  }

  @Query(() => [Auction])
  async getAuctions(@Args('ownerAddress') address: string) {
    return await this.auctionsService.getAuctions(address);
  }

  @ResolveField('owner', () => Account)
  async owner(@Parent() auction: Auction) {
    const { ownerAddress } = auction;
    return await this.accountsService.getAccountByAddress(ownerAddress);
  }

  @ResolveField('asset', () => Asset)
  async asset(@Parent() auction: Auction) {
    const { token, nonce } = auction;
    return await this.assetsService.getAssetByToken(
      elrondConfig.nftMarketplaceAddress,
      token,
      nonce,
    );
  }

  @ResolveField('topBid', () => Price)
  async topBid(@Parent() auction: Auction) {
    const { id } = auction;
    return await this.ordersService.getTopBid(id);
  }

  @ResolveField('topBidder', () => Account)
  async topBidder(@Parent() auction: Auction) {
    const { id } = auction;
    const lastOrder = await this.ordersService.getActiveOrderForAuction(id);
    return lastOrder
      ? await this.accountsService.getAccountByAddress(lastOrder.ownerAddress)
      : undefined;
  }

  @ResolveField('orders', () => [Order])
  async orders(@Parent() auction: Auction) {
    const { id } = auction;
    return await this.ordersService.getOrdersForAuction(id);
  }
}
