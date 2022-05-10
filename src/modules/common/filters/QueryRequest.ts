import { FiltersExpression, Sorting, Grouping } from './filtersTypes';

export class QueryRequest {
  limit: number = 20;
  offset: number = 0;
  filters: FiltersExpression;
  sorting: Sorting[];
  groupByOption: Grouping;

  constructor(init?: Partial<QueryRequest>) {
    Object.assign(this, init);
  }
}