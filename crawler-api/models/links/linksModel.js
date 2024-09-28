const { BigQuery } = require('@google-cloud/bigquery');
const bigquery = new BigQuery();

const DATASET = process.env.BIGQUERY_DATASET;
const TABLE = 'crawled_links';

exports.insertLinkData = async (linkData) => {
  const rows = [linkData];
  await bigquery.dataset(DATASET).table(TABLE).insert(rows);
  console.log(`Inserted ${rows.length} rows into ${TABLE}`);
};
