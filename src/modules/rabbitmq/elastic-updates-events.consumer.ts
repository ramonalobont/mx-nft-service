import { Injectable } from '@nestjs/common';
import { NftEventEnum } from '../assets/models/AuctionEvent.enum';
import { ElasticUpdatesEventsService } from './elastic-updates-events.service';
import { CompetingRabbitConsumer } from './rabbitmq.consumers';

@Injectable()
export class ElasiticUpdatesConsumer {
  constructor(
    private readonly elasticUpdateService: ElasticUpdatesEventsService,
  ) {}

  @CompetingRabbitConsumer({
    queueName: 'nft-service-elastic',
    exchange: process.env.RABBITMQ_EXCHANGE,
    dlqExchange: process.env.RABBITMQ_DLQ_EXCHANGE,
  })
  async consumeMintEvents(mintEvents: any) {
    if (!mintEvents.events) {
      return;
    }

    await Promise.all([
      this.elasticUpdateService.handleNftMintEvents(
        mintEvents?.events?.filter(
          (e: { identifier: NftEventEnum }) =>
            e.identifier === NftEventEnum.ESDTNFTCreate,
        ),
        mintEvents.hash,
      ),
      this.elasticUpdateService.handleRaritiesForNftMintAndBurnEvents(
        mintEvents?.events?.filter(
          (e: { identifier: NftEventEnum }) =>
            e.identifier === NftEventEnum.ESDTNFTCreate ||
            e.identifier === NftEventEnum.ESDTNFTBurn,
        ),
      ),
    ]);
  }
}
