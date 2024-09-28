const { BigQuery } = require('@google-cloud/bigquery');
const bigquery = new BigQuery();

const DATASET = process.env.BIGQUERY_DATASET;
const TABLE = 'crawled_pages';

async function insertPageData(pageData) {
    try {
        // Insert data into BigQuery
        const [response] = await bigquery
            .dataset(DATASET)
            .table(TABLE)
            .insert([pageData]);

        console.log(`Inserted data into BigQuery: ${JSON.stringify(pageData)}`);
    } catch (error) {
        console.error('Error inserting data into BigQuery:', error);
        if (error.errors) {
            error.errors.forEach(err => {
                console.error(`Insert error for row ${JSON.stringify(err.row)}: ${err.errors.map(e => e.message).join(', ')}`);
            });
        }
    }
}

module.exports = { insertPageData };
