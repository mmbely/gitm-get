#!/bin/bash

# Create the directory structure
mkdir -p crawler-api/{controllers,models/{pages,resources,issues,links},services,utils,routes}

# Create app.js
cat << EOF > crawler-api/app.js
const express = require('express');
const crawlRoutes = require('./routes/crawlRoutes');
require('dotenv').config();

const app = express();
app.use(express.json());

app.use('/crawl', crawlRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Crawling service running on port \${PORT}\`);
});
EOF

# Create package.json
cat << EOF > crawler-api/package.json
{
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
}
EOF

# Create Dockerfile
cat << EOF > crawler-api/Dockerfile
FROM node:16
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
EOF

# Create .env file
cat << EOF > crawler-api/.env
PORT=3000
GOOGLE_CLOUD_PROJECT_ID=your-gcp-project-id
BIGQUERY_DATASET=project_dataset
REDIS_HOST=localhost
EOF

# Create routes/crawlRoutes.js
cat << EOF > crawler-api/routes/crawlRoutes.js
const express = require('express');
const { crawlSingle, crawlDomain, getCrawlStatus } = require('../controllers/crawlController');
const router = express.Router();

router.post('/single', crawlSingle);
router.post('/domain', crawlDomain);
router.get('/status/:crawl_id', getCrawlStatus);

module.exports = router;
EOF

# Create controllers/crawlController.js
cat << EOF > crawler-api/controllers/crawlController.js
const { crawlSingleUrl, crawlDomainUrls, getCrawlStatusById } = require('../services/crawlerService');

exports.crawlSingle = async (req, res) => {
  const { url } = req.body;
  try {
    const result = await crawlSingleUrl(url);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.crawlDomain = async (req, res) => {
  const { domain, max_urls, max_levels, url_restrictions, obey_robots_txt } = req.body;
  try {
    const crawlId = await crawlDomainUrls(domain, max_urls, max_levels, url_restrictions, obey_robots_txt);
    res.status(202).json({ message: 'Crawl started', crawl_id: crawlId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCrawlStatus = async (req, res) => {
  const { crawl_id } = req.params;
  try {
    const status = await getCrawlStatusById(crawl_id);
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
EOF

# Create services/crawlerService.js
cat << EOF > crawler-api/services/crawlerService.js
const puppeteer = require('puppeteer');
const { processPage } = require('../models/pages/pagesService');
const { processResources } = require('../models/resources/resourcesService');
const { processIssues } = require('../models/issues/issuesService');
const { processLinks } = require('../models/links/linksService');
const { hasBeenCrawled, markAsCrawled } = require('./queueService');

exports.crawlSingleUrl = async (url) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'networkidle2' });
  const html = await page.content();

  await processPage(html, url, 0);
  await processResources(html, url);
  await processIssues(html, url);
  await processLinks(html, url);

  await browser.close();
  return { message: 'Single URL crawl completed', url: url };
};

exports.crawlDomainUrls = async (domain, maxUrls, maxLevels, urlRestrictions, obeyRobotsTxt) => {
  const crawledUrls = new Set();
  const queue = [{ url: domain, level: 0 }];
  const browser = await puppeteer.launch();

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
      console.error(\`Failed to crawl \${url}: \${error.message}\`);
    }
  }

  await browser.close();
  return { message: \`Crawl completed for domain \${domain}\`, crawled_urls_count: crawledUrls.size };
};
EOF

# Create services/queueService.js
cat << EOF > crawler-api/services/queueService.js
const redis = require('redis');

const client = redis.createClient();
client.on('error', (err) => console.error('Redis error:', err));

const crawledUrls = new Set();

exports.hasBeenCrawled = async (url) => {
  return crawledUrls.has(url);
};

exports.markAsCrawled = async (url) => {
  crawledUrls.add(url);
};

exports.clearCrawledUrls = () => {
  crawledUrls.clear();
};
EOF

# Create models/pages/pagesModel.js
cat << EOF > crawler-api/models/pages/pagesModel.js
const { BigQuery } = require('@google-cloud/bigquery');
const bigquery = new BigQuery();

const DATASET = process.env.BIGQUERY_DATASET;
const TABLE = 'crawled_pages';

exports.insertPageData = async (pageData) => {
  const rows = [pageData];
  await bigquery.dataset(DATASET).table(TABLE).insert(rows);
  console.log(\`Inserted \${rows.length} rows into \${TABLE}\`);
};
EOF

# Create models/pages/pagesService.js
cat << EOF > crawler-api/models/pages/pagesService.js
const cheerio = require('cheerio');
const { insertPageData } = require('./pagesModel');

exports.processPage = async (html, url, level) => {
  const $ = cheerio.load(html);

  const metaTitle = $('title').text();
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const canonicalUrl = $('link[rel="canonical"]').attr('href') || '';
  const hreflangLinks = $('link[rel="alternate"][hreflang]').map((i, el) => $(el).attr('href')).get();

  const pageData = {
    url,
    level,
    meta_title: metaTitle,
    meta_description: metaDescription,
    canonical_url: canonicalUrl,
    hreflang_links: hreflangLinks.join(', '),
  };

  await insertPageData(pageData);
};
EOF

# Create models/resources/resourcesModel.js
cat << EOF > crawler-api/models/resources/resourcesModel.js
const { BigQuery } = require('@google-cloud/bigquery');
const bigquery = new BigQuery();

const DATASET = process.env.BIGQUERY_DATASET;
const TABLE = 'crawled_resources';

exports.insertResourceData = async (resourceData) => {
  const rows = [resourceData];
  await bigquery.dataset(DATASET).table(TABLE).insert(rows);
  console.log(\`Inserted \${rows.length} rows into \${TABLE}\`);
};
EOF

# Create models/resources/resourcesService.js
cat << EOF > crawler-api/models/resources/resourcesService.js
const cheerio = require('cheerio');
const { insertResourceData } = require('./resourcesModel');

exports.processResources = async (html, url) => {
  const $ = cheerio.load(html);
  
  const resources = [];

  $('link[rel="stylesheet"]').each((i, el) => {
    resources.push({ type: 'css', url: $(el).attr('href') });
  });

  $('script[src]').each((i, el) => {
    resources.push({ type: 'javascript', url: $(el).attr('src') });
  });

  $('img[src]').each((i, el) => {
    resources.push({ type: 'image', url: $(el).attr('src') });
  });

  for (const resource of resources) {
    await insertResourceData({
      page_url: url,
      resource_url: resource.url,
      resource_type: resource.type
    });
  }
};
EOF

# Create models/issues/issuesModel.js
cat << EOF > crawler-api/models/issues/issuesModel.js
const { BigQuery } = require('@google-cloud/bigquery');
const bigquery = new BigQuery();

const DATASET = process.env.BIGQUERY_DATASET;
const TABLE = 'crawled_issues';

exports.insertIssueData = async (issueData) => {
  const rows = [issueData];
  await bigquery.dataset(DATASET).table(TABLE).insert(rows);
  console.log(\`Inserted \${rows.length} rows into \${TABLE}\`);
};
EOF

# Create models/issues/issuesService.js
cat << EOF > crawler-api/models/issues/issuesService.js
const cheerio = require('cheerio');
const { insertIssueData } = require('./issuesModel');

exports.processIssues = async (html, url) => {
  const $ = cheerio.load(html);
  
  const issues = [];

  if ($('title').length === 0) {
    issues.push({ type: 'missing_title', description: 'Page is missing a title tag' });
  }

  if ($('meta[name="description"]').length === 0) {
    issues.push({ type: 'missing_meta_description', description: 'Page is missing a meta description' });
  }

  $('img').each((i, el) => {
    if (!$(el).attr('src')) {
      issues.push({ type: 'broken_image', description: 'Image with missing src attribute' });
    }
  });

  for (const issue of issues) {
    await insertIssueData({
      page_url: url,
      issue_type: issue.type,
      issue_description: issue.description
    });
  }
};
EOF

# Create models/links/linksModel.js
cat << EOF > crawler-api/models/links/linksModel.js
const { BigQuery } = require('@google-cloud/bigquery');
const bigquery = new BigQuery();

const DATASET = process.env.BIGQUERY_DATASET;
const TABLE = 'crawled_links';

exports.insertLinkData = async (linkData) => {
  const rows = [linkData];
  await bigquery.dataset(DATASET).table(TABLE).insert(rows);
  console.log(\`Inserted \${rows.length} rows into \${TABLE}\`);
};
EOF

# Create models/links/linksService.js
cat << EOF > crawler-api/models/links/linksService.js
const cheerio = require('cheerio');
const { insertLinkData } = require('./linksModel');
const { URL } = require('url');

exports.processLinks = async (html, url) => {
  const $ = cheerio.load(html);
  const baseUrl = new URL(url);
  const internalLinks = new Set();
  
  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    const linkUrl = new URL(href, baseUrl);
    
    const linkData = {
      source_url: url,
      target_url: linkUrl.href,
      link_text: $(el).text().trim(),
      is_internal: linkUrl.hostname === baseUrl.hostname
    };
    
    insertLinkData(linkData);
    
    if (linkData.is_internal) {
      internalLinks.add(linkUrl.href);
    }
  });
  
  return Array.from(internalLinks);
};
EOF

echo "Crawler API project structure and files have been created successfully!"