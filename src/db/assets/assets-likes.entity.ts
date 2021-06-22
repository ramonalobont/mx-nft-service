import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('assets_likes')
@Unique('AssetLikeEntity_UQ_LIKE', ['token', 'nonce', 'address'])
export class AssetLikeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 25 })
  @Index()
  token: string;

  @Column()
  @Index()
  nonce: number;

  @Column({ length: 62 })
  address: string;

  constructor(init?: Partial<AssetLikeEntity>) {
    Object.assign(this, init);
  }
}