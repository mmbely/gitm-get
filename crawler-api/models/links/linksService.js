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
