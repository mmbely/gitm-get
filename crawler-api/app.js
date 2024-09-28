const express = require('express');
const crawlRoutes = require('./routes/crawlRoutes');
require('dotenv').config();
const { ensureTableExists } = require('./services/crawlerService');
const fetch = require('node-fetch');
const { processCrawledData } = require('./models/pages/pagesService');

const app = express();
app.use(express.json()); // Ensure you can parse JSON requests

// Define the /crawl/single endpoint
app.post('/crawl/single', async (req, res) => {
    console.log('Received request:', req.body);
    const urlToCrawl = req.body.url;

    try {
        // Fetch the URL
        const response = await fetch(urlToCrawl);
        
        // Check if the response is okay (status code 200-299)
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Get the response data as text
        const html = await response.text();

        // Process the crawled data and store it in BigQuery
        await processCrawledData(urlToCrawl, html);

        // Send a success response
        res.send({ message: 'Crawling completed and data stored in BigQuery' });
    } catch (error) {
        console.error('Error during crawling:', error);
        res.status(500).send({ message: 'Crawling failed', error: error.message });
    }
});

app.use('/crawl', crawlRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Crawling service running on port ${PORT}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Application specific logging, throwing an error, or other logic here
});

async function startApp(port) {
  try {
    await ensureTableExists();

    const server = app.listen(port, () => {
      console.log(`Crawling service running on port ${port}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is in use. Trying next port...`);
        startApp(port + 1); // Increment the port number and restart the app
      } else {
        console.error('Failed to start server:', err);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application on the specified port
const basePort = parseInt(process.env.PORT, 10) || 4000; // Ensure basePort is a number
startApp(basePort);
