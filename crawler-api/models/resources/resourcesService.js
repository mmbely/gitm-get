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
