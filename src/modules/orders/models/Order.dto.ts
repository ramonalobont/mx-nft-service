import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { OrderStatusEnum } from './order-status.enum';
import { Auction } from '../../auctions/models';
import { Account } from '../../accounts/models';
import { OrderPrice, Price } from '../../assets/models';
import { OrderEntity } from 'src/db/orders/order.entity';

@ObjectType()
export class Order {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  auctionId: number;

  @Field(() => String)
  ownerAddress: string;

  @Field(() => Account, { nullable: true })
  from: Account;

  @Field(() => Auction, { nullable: true })
  auction: Auction;

  @Field(() => OrderPrice)
  price: OrderPrice;

  @Field(() => OrderStatusEnum)
  status: OrderStatusEnum;

  @Field(() => Date)
  creationDate: Date;

  @Field(() => Date, { nullable: true })
  endDate: Date;

  constructor(init?: Partial<Order>) {
    Object.assign(this, init);
  }

  static fromEntity(order: OrderEntity) {
    return order
      ? new Order({
          id: order.id,
          ownerAddress: order.ownerAddress,
          price: new Price({
            amount: order.priceAmount,
            nonce: order.priceNonce,
            token: order.priceToken,
            timestamp: new Date(order.creationDate).getTime() / 1000,
          }),
          status: order.status,
          creationDate: order.creationDate,
          endDate: order.modifiedDate,
          auctionId: order.auctionId,
        })
      : null;
  }
}
