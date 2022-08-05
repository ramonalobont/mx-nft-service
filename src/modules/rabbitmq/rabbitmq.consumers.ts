import {
  defaultNackErrorHandler,
  RabbitSubscribe,
} from '@golevelup/nestjs-rabbitmq';
import { applyDecorators } from '@nestjs/common';
import { RabbitConsumerConfig } from './rabbit-config';
import * as uuid from 'uuid';

/** Competing Consumer which will be handled by only one instance of the microservice.
 * Make sure the exchange exists.
 */
export const CompetingRabbitConsumer = (config: RabbitConsumerConfig) => {
  return applyDecorators(
    RabbitSubscribe({
      connection: config.connection ?? 'default',
      queue: config.queueName,
      exchange: config.exchange,
      routingKey: '',
      errorHandler: defaultNackErrorHandler,
      queueOptions: {
        autoDelete: false,
        durable: true,
        arguments: {
          'x-queue-type': 'classic',
          'x-queue-mode': 'lazy',
          'x-single-active-consumer': true,
        },
        deadLetterExchange: config.dlqExchange,
      },
    }),
  );
};

/** Public Consumer which will be handled by all instances of the microservice.
 * Make sure the exchange exists.
 */
export const PublicRabbitConsumer = (config: RabbitConsumerConfig) => {
  const { queueName, exchange, connection } = config;
  return applyDecorators(
    RabbitSubscribe({
      connection: connection ?? 'default',
      queue: `${queueName}_${uuid.v4()}`,
      exchange,
      routingKey: '',
      queueOptions: {
        autoDelete: true,
      },
    }),
  );
};
