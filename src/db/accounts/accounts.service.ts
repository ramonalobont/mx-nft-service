import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import FilterQueryBuilder from 'src/modules/FilterQueryBuilder';
import { FiltersExpression } from 'src/modules/filtersTypes';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AccountEntity } from './account.entity';

@Injectable()
export class AccountsServiceDb {
  constructor(
    @InjectRepository(AccountEntity)
    private accountRepository: Repository<AccountEntity>,
  ) {}

  async insertAccount(account: AccountEntity): Promise<AccountEntity> {
    return await this.accountRepository.save(account);
  }

  async getAccountByAddress(address: string): Promise<AccountEntity> {
    return await this.accountRepository.findOne({
      where: [{ address: address }],
    });
  }

  async getAccounts(
    limit: number = 50,
    offset: number,
    filters: FiltersExpression,
  ): Promise<[AccountEntity[], number]> {
    const filterQueryBuilder = new FilterQueryBuilder<AccountEntity>(
      this.accountRepository,
      filters,
    );
    const queryBuilder: SelectQueryBuilder<AccountEntity> =
      filterQueryBuilder.build();
    queryBuilder.offset(offset);
    queryBuilder.limit(limit);

    return await queryBuilder.getManyAndCount();
  }

  async updateAccount(account: AccountEntity) {
    await this.accountRepository.update(account.id, account);
  }
}
