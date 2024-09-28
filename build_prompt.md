# Create a directory structure for a web crawling API system
mkdir -p crawler-api/{controllers,models/pages,models/resources,models/issues,models/links,services,utils,routes}

# Generate the main entry point file (app.js) for the Express app
echo "const express = require('express');
const crawlRoutes = require('./routes/crawlRoutes');
require('dotenv').config();

const app = express();
app.use(express.json());

app.use('/crawl', crawlRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Crawling service running on port \${PORT}\`);
});
" > crawler-api/app.js

# Create the package.json file for dependency management
echo '{
  "name": "crawler-api",
  "version": "1.0.0",
  "description": "A web crawler API for extracting pages, resources, issues, and links.",
  "main": "app.js",
  "scripts": {
    "start": "node app.js"
  },
  "dependencies": {
    "axios": "^0.21.1",
    "cheerio": "^1.0.0-rc.10",
    "express": "^4.17.1",
    "dotenv": "^10.0.0",
    "puppeteer": "^10.0.0",
    "@google-cloud/bigquery": "^5.10.0",
    "redis": "^3.1.2"
  }
}' > crawler-api/package.json

# Create the Dockerfile to containerize the API
echo 'FROM node:16
WORKDIR /app

# Install necessary dependencies for Puppeteer and headless Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    libx11-6 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock ./
RUN yarn install

COPY . .

# Expose the default port
EXPOSE 3000

# Set necessary environment variables to allow Puppeteer to run in headless mode in Docker
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

CMD ["yarn", "start"]
' > crawler-api/Dockerfile

# Create the .env file for environment variables
echo 'PORT=3000
GOOGLE_CLOUD_PROJECT_ID=your-gcp-project-id
BIGQUERY_DATASET=project_dataset
REDIS_HOST=localhost
' > crawler-api/.env

# Create routes file to handle API endpoints (routes/crawlRoutes.js)
echo "const express = require('express');
const { crawlSingle, crawlDomain, getCrawlStatus } = require('../controllers/crawlController');
const router = express.Router();

router.post('/single', crawlSingle);
router.post('/domain', crawlDomain);
router.get('/status/:crawl_id', getCrawlStatus);

module.exports = router;
" > crawler-api/routes/crawlRoutes.js

# Create controller to handle crawl requests (controllers/crawlController.js)
echo "const { crawlSingleUrl, crawlDomainUrls, getCrawlStatusById } = require('../services/crawlerService');

// Handle single URL crawl
exports.crawlSingle = async (req, res) => {
  const { url } = req.body;
  try {
    const result = await crawlSingleUrl(url);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Handle full domain crawl with settings
exports.crawlDomain = async (req, res) => {
  const { domain, max_urls, max_levels, url_restrictions, obey_robots_txt } = req.body;
  try {
    const crawlId = await crawlDomainUrls(domain, max_urls, max_levels, url_restrictions, obey_robots_txt);
    res.status(202).json({ message: 'Crawl started', crawl_id: crawlId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get status of a running/completed crawl
exports.getCrawlStatus = async (req, res) => {
  const { crawl_id } = req.params;
  try {
    const status = await getCrawlStatusById(crawl_id);
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
" > crawler-api/controllers/crawlController.js

# Create services for crawling and managing the queue (services/crawlerService.js)
echo "const puppeteer = require('puppeteer');
const { processPage } = require('../models/pages/pagesService');
const { processResources } = require('../models/resources/resourcesService');
const { processIssues } = require('../models/issues/issuesService');
const { processLinks } = require('../models/links/linksService');
const { hasBeenCrawled, markAsCrawled } = require('./queueService');

// Single URL crawl function
exports.crawlSingleUrl = async (url) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'networkidle2' });
  const html = await page.content();

  // Process different aspects of the page
  await processPage(html, url, 0); // level 0 for single URL
  await processResources(html, url);
  await processIssues(html, url);
  await processLinks(html, url);

  await browser.close();
  return { message: 'Single URL crawl completed', url: url };
};

// Full domain crawl with levels
exports.crawlDomainUrls = async (domain, maxUrls, maxLevels, urlRestrictions, obeyRobotsTxt) => {
  const crawledUrls = new Set(); // For deduplication
  const queue = [{ url: domain, level: 0 }];
  const browser = await puppeteer.launch();

  while (queue.length > 0 && crawledUrls.size < maxUrls) {
    const { url, level } = queue.shift();

    // Check if the URL has already been crawled
    if (await hasBeenCrawled(url) || crawledUrls.has(url) || level > maxLevels) {
      continue;
    }

    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle2' });
      const html = await page.content();

      // Process the page, resources, issues, and links
      await processPage(html, url, level);
      await processResources(html, url);
      await processIssues(html, url);
      const internalLinks = await processLinks(html, url);

      // Mark the URL as crawled
      crawledUrls.add(url);
      await markAsCrawled(url);

      // Add discovered internal links to the queue for the next level
      internalLinks.forEach((newUrl) => {
        if (!crawledUrls.has(newUrl)) {
          queue.push({ url: newUrl, level: level + 1 });
        }
      });

      await page.close();
    } catch (error) {
      console.error(\`Failed to crawl \${url}: \${error.message}\`);
    }
  }

  await browser.close();
  return { message: \`Crawl completed for domain \${domain}\`, crawled_urls_count: crawledUrls.size };
};
" > crawler-api/services/crawlerService.js

# Create queue service to handle URL deduplication (services/queueService.js)
echo "const redis = require('redis');

const client = redis.createClient();
client.on('error', (err) => console.error('Redis error:', err));

const crawledUrls = new Set(); // For local memory-based deduplication

// Check if a URL has been crawled (in Redis or Set)
exports.hasBeenCrawled = async (url) => {
  // For Redis
  // return client.exists(url);
  
  // For in-memory Set
  return crawledUrls.has(url);
};

// Mark a URL as crawled (add to Redis or Set)
exports.markAsCrawled = async (url) => {
  // For Redis
  // client.set(url, 'true');
  
  // For in-memory Set
  crawledUrls.add(url);
};

// Clear the set (for testing purposes)
exports.clearCrawledUrls = () => {
  crawledUrls.clear();
};
" > crawler-api/services/queueService.js

# Create model and service files for pages (models/pages/pagesModel.js)
echo "const { BigQuery } = require('@google-cloud/bigquery');
const bigquery = new BigQuery();

const DATASET = process.env.BIGQUERY_DATASET;
const TABLE = 'crawled_pages';

// Insert page data into BigQuery, including the crawl level
exports.insertPageData = async (pageData) => {
  const rows = [pageData];
  await bigquery.dataset(DATASET).table(TABLE).insert(rows);
  console.log(\`Inserted \${rows.length} rows into \${TABLE}\`);
};
" > crawler-api/models/pages/pagesModel.js

# Create the pages service (models/pages/pagesService.js)
echo "const cheerio = require('cheerio');
const { insertPageData } = require('./pagesModel');

// Process and extract page-level data, including the level metric
exports.processPage = async (html, url, level) => {
  const $ = cheerio.load(html);

  const metaTitle = $('title').text();
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const canonicalUrl = $('link[rel="canonical"]').attr('href') || '';
  const hreflangLinks = $('link[rel="alternate"][hreflang]').map((i, el) => $(el).attr('href')).get();

  const pageData = {
    url,
    level,  // Crawl level (depth)
    meta_title: metaTitle,
    meta_description: metaDescription,
    canonical_url: canonicalUrl,
    hreflang_links: hreflangLinks.join(', '),
  };

  await insertPageData(pageData);
};
" > crawler-api/models/pages/pagesService.js

# Create other models and services similarly for resources, issues, links...
