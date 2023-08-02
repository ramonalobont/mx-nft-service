import { Injectable } from '@nestjs/common';
import { Address, AddressValue, BytesValue, U32Value } from '@multiversx/sdk-core/out';
import { ContractLoader } from '@multiversx/sdk-nestjs';
import { MarketplaceUtils } from '../auctions/marketplaceUtils';
import { TransactionNode } from '../common/transaction';
import { DeployMinterRequest } from './models/requests/DeployMinterRequest';
import { mxConfig, gas } from 'src/config';

@Injectable()
export class MintersDeployerAbiService {
  private contract = new ContractLoader(MarketplaceUtils.deployerMintersAbiPath, MarketplaceUtils.deployerAbiInterface);

  async deployMinter(request: DeployMinterRequest): Promise<TransactionNode> {
    const contract = await this.contract.getContract('erd1qqqqqqqqqqqqqpgqut6lamz9dn480ytj8cmcwvydcu3lj55epltq9t9kam');

    return contract.methodsExplicit
      .createNftMinter([
        BytesValue.fromUTF8(request.collectionCategory),
        new AddressValue(new Address(request.royaltiesClaimAddress)),
        new AddressValue(new Address(request.mintClaimAddress)),
        new U32Value(request.maxNftsPerTransaction),
      ])

      .withChainID(mxConfig.chainID)
      .withGasLimit(gas.deployMinter)
      .buildTransaction()
      .toPlainObject(new Address(request.ownerAddress));
  }
}
