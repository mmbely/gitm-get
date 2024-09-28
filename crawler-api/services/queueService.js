const redis = require('redis');
const { promisify } = require('util');

const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
console.log('Connecting to Redis at:', redisUrl);

const client = redis.createClient(redisUrl);

const getAsync = promisify(client.get).bind(client);
const setAsync = promisify(client.set).bind(client);

client.on('error', (err) => console.error('Redis error:', err));
client.on('connect', () => console.log('Connected to Redis'));

// Export the functions that use the Redis client
module.exports = {
  async hasBeenCrawled(url) {
    try {
      return await getAsync(url) !== null;
    } catch (err) {
      console.error('Error checking if URL has been crawled:', err);
      return false;
    }
  },

  async markAsCrawled(url) {
    try {
      await setAsync(url, 'true');
    } catch (err) {
      console.error('Error marking URL as crawled:', err);
    }
  },

  clearCrawledUrls() {
    client.flushall((err) => {
      if (err) console.error('Error clearing crawled URLs:', err);
      else console.log('Cleared all crawled URLs');
    });
  }
};
