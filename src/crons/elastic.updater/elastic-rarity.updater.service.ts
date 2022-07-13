import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RarityUpdaterService } from './rarity.updater.service';

@Injectable()
export class ElasticRarityUpdaterService {
  constructor(private readonly rarityUpdaterService: RarityUpdaterService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleValidateTokenRarity() {
    await this.rarityUpdaterService.handleValidateToken();
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleUpdateTokenRarity() {
    await this.rarityUpdaterService.handleUpdateTokenRarities(30);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleProcessTokenRarityQueue() {
    await this.rarityUpdaterService.processTokenRarityQueue();
  }
}