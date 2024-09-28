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
