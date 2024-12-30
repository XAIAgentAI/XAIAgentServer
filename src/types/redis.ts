import * as Redis from 'ioredis';

// Define the Redis instance type using the constructor type
export type RedisClient = Redis.Redis;
// Define the configuration type
export type RedisConfig = Redis.RedisOptions;

// Export the Redis constructor
export default Redis.default;
