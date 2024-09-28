const puppeteer = require('puppeteer');
const { processPage } = require('../models/pages/pagesService');
const { processResources } = require('../models/resources/resourcesService');
const { processIssues } = require('../models/issues/issuesService');
const { processLinks } = require('../models/links/linksService');
const { hasBeenCrawled, markAsCrawled } = require('./queueService');
const { BigQuery } = require('@google-cloud/bigquery');
const fs = require('fs');

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!fs.existsSync(credentialsPath)) {
  console.error(`Credentials file not found at ${credentialsPath}`);
  throw new Error('Google Cloud credentials not found');
}

const bigquery = new BigQuery({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: credentialsPath
});

const dataset = bigquery.dataset(process.env.BIGQUERY_DATASET);
const table = dataset.table('crawled_pages');

async function ensureTableExists() {
  try {
    const [exists] = await table.exists();
    if (!exists) {
      const schema = [
        { name: 'url', type: 'STRING' },
        { name: 'title', type: 'STRING' },
        { name: 'content', type: 'STRING' },
        { name: 'crawled_at', type: 'TIMESTAMP' }
      ];

      const options = {
        schema: schema,
        timePartitioning: {
          type: 'DAY',
          field: 'crawled_at'
        }
      };

      await table.create(options);
      console.log(`Table ${process.env.BIGQUERY_DATASET}.crawled_pages created.`);
    }
  } catch (error) {
    console.error('Error ensuring table exists:', error);
    throw error;
  }
}

// Export the function
module.exports = {
  ensureTableExists,
  crawlSingleUrl: async (url) => {
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle2' });
    const html = await page.content();

    await processPage(html, url, 0);
    await processResources(html, url);
    await processIssues(html, url);
    await processLinks(html, url);

    await browser.close();
    return { message: 'Single URL crawl completed', url: url };
  },
  crawlDomainUrls: async (domain, maxUrls, maxLevels, urlRestrictions, obeyRobotsTxt) => {
    const crawledUrls = new Set();
    const queue = [{ url: domain, level: 0 }];
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    while (queue.length > 0 && crawledUrls.size < maxUrls) {
      const { url, level } = queue.shift();

      if (await hasBeenCrawled(url) || crawledUrls.has(url) || level > maxLevels) {
        continue;
      }

      try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });
        const html = await page.content();

        await processPage(html, url, level);
        await processResources(html, url);
        await processIssues(html, url);
        const internalLinks = await processLinks(html, url);

        crawledUrls.add(url);
        await markAsCrawled(url);

        internalLinks.forEach((newUrl) => {
          if (!crawledUrls.has(newUrl)) {
            queue.push({ url: newUrl, level: level + 1 });
          }
        });

        await page.close();
      } catch (error) {
        console.error(`Failed to crawl ${url}: ${error.message}`);
      }
    }

    await browser.close();
    return { message: `Crawl completed for domain ${domain}`, crawled_urls_count: crawledUrls.size };
  }
};
