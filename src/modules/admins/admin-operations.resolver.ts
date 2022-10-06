import { Resolver, Args, Mutation } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAdminAuthGuard } from '../auth/gql-admin.auth-guard';
import { FlagNftService } from './flag-nft.service';
import { FlagCollectionInput, FlagNftInput } from './models/flag-nft.input';
import { ApolloError } from 'apollo-server-express';
import { NftRarityService } from '../nft-rarity/nft-rarity.service';
import { NftTraitsService } from '../nft-traits/nft-traits.service';

@Resolver(() => Boolean)
export class AdminOperationsResolver {
  constructor(
    private readonly flagService: FlagNftService,
    private readonly nftRarityService: NftRarityService,
    private readonly nftTraitService: NftTraitsService,
  ) {}

  @Mutation(() => Boolean)
  @UseGuards(GqlAdminAuthGuard)
  flagNft(
    @Args('input', { type: () => FlagNftInput }) input: FlagNftInput,
  ): Promise<boolean> {
    return this.flagService.updateNftNSFWByAdmin(
      input.identifier,
      input.nsfwFlag,
    );
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAdminAuthGuard)
  flagCollection(
    @Args('input', { type: () => FlagCollectionInput })
    input: FlagCollectionInput,
  ): Promise<boolean> {
    return this.flagService.updateCollectionNftsNSFWByAdmin(
      input.collection,
      input.nsfwFlag,
    );
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAdminAuthGuard)
  async updateNftRarities(
    @Args('collectionTicker')
    collectionTicker: string,
  ): Promise<boolean> {
    try {
      return await this.nftRarityService.updateRarities(collectionTicker);
    } catch (error) {
      throw new ApolloError(error);
    }
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAdminAuthGuard)
  async validateNftRarities(
    @Args('collectionTicker')
    collectionTicker: string,
  ): Promise<boolean> {
    try {
      return await this.nftRarityService.validateRarities(collectionTicker);
    } catch (error) {
      throw new ApolloError(error);
    }
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAdminAuthGuard)
  async updateCollectionTraits(
    @Args('collectionTicker')
    collectionTicker: string,
    @Args('forceRefresh')
    forceRefresh: boolean = false,
  ): Promise<boolean> {
    try {
      return await this.nftTraitService.updateCollectionTraits(
        collectionTicker,
        forceRefresh,
      );
    } catch (error) {
      throw new ApolloError(error);
    }
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAdminAuthGuard)
  async updateNftTraits(
    @Args('identifier')
    identifier: string,
  ): Promise<boolean> {
    try {
      return await this.nftTraitService.updateNftTraits(identifier);
    } catch (error) {
      throw new ApolloError(error);
    }
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAdminAuthGuard)
  updateAllCollectionTraits(): void {
    try {
      this.nftTraitService.updateAllCollections();
    } catch (error) {
      throw new ApolloError(error);
    }
  }
}
