const express = require('express');
const { crawlSingle, crawlDomain, getCrawlStatus } = require('../controllers/crawlController');
const router = express.Router();

router.post('/single', crawlSingle);
router.post('/domain', crawlDomain);
router.get('/status/:crawl_id', getCrawlStatus);

module.exports = router;
