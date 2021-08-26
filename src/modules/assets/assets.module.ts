import { Module } from '@nestjs/common';
import { ElrondCommunicationModule } from '../../common/services/elrond-communication/elrond-communication.module';
import { AssetsService } from './assets.service';
import { AssetsResolver } from './assets.resolver';
import { IpfsModule } from '../ipfs/ipfs.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsLikesService } from './assets-likes.service';
import { RedisCacheService } from 'src/common/services/redis-cache.service';
import { AssetsLikesRepository } from 'src/db/assets/assets-likes.repository';
import { AssetsHistoryResolver } from './assets-history.resolver';
import { AssetsHistoryService } from './assets-history.service';
import { S3Service } from '../s3/s3.service';

@Module({
  providers: [
    AssetsService,
    AssetsLikesService,
    AssetsHistoryService,
    AssetsResolver,
    AssetsHistoryResolver,
    RedisCacheService,
    S3Service,
  ],
  imports: [
    ElrondCommunicationModule,
    IpfsModule,
    TypeOrmModule.forFeature([AssetsLikesRepository]),
  ],
  exports: [AssetsService, AssetsLikesService, RedisCacheService, S3Service],
})
export class AssetsModuleGraph {}
