const cheerio = require('cheerio');
const { insertPageData } = require('./pagesModel');

async function processCrawledData(url, html) {
    const $ = cheerio.load(html);

    const metaTitle = $('title').text();
    const metaDescription = $('meta[name="description"]').attr('content') || '';
    const canonicalUrl = $('link[rel="canonical"]').attr('href') || '';
    const hreflangLinks = $('link[rel="alternate"][hreflang]').map((i, el) => $(el).attr('href')).get();

    const pageData = {
        url,
        meta_title: metaTitle,
        meta_description: metaDescription,
        canonical_url: canonicalUrl,
        hreflang_links: hreflangLinks.join(', '),
    };

    // Insert the page data into BigQuery
    await insertPageData(pageData);
}

module.exports = { processCrawledData };
