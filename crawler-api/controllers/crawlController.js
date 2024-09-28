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
