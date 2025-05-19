require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

app.post('/api/ask-ai', async (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'No text provided.' });
    }
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: text }],
            max_tokens: 256
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        const aiMessage = response.data.choices[0].message.content;
        res.json({ ai: aiMessage });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// In your server.js
app.post('/api/save-visualization-data', (req, res) => {
    const vizData = req.body; // { network: { nodes, links }, wordCloudText }

    if (!vizData || !vizData.network || !vizData.wordCloudText) {
        return res.status(400).json({ error: 'Invalid visualization data provided.' });
    }

    const vizFilePath = path.join(__dirname, 'visualization_data.json');
    
    fs.writeFile(vizFilePath, JSON.stringify(vizData, null, 2), (err) => { // Overwrite with new data
        if (err) {
            console.error('Failed to write visualization data to file:', err);
            return res.status(500).json({ error: 'Failed to save visualization data.' });
        }
        console.log('Visualization data saved successfully.');
        res.status(200).json({ status: 'success', message: 'Visualization data saved.' });
    });
});

// --- NEW ENDPOINT for logging clickstream data ---
app.post('/api/log-clickstream', (req, res) => {
    const clickstreamEvents = req.body; // req.body should be an array of event objects

    if (!Array.isArray(clickstreamEvents) || clickstreamEvents.length === 0) {
        return res.status(400).json({ error: 'No clickstream data provided or data is not an array.' });
    }

    const logFilePath = path.join(__dirname, 'clickstream_log.json');
    
    const logData = JSON.stringify(clickstreamEvents);

    // Append the new log data followed by a newline character
    fs.appendFile(logFilePath, logData + '\n', (err) => {
        if (err) {
            console.error('Failed to append to clickstream log:', err);
            return res.status(500).json({ error: 'Failed to log clickstream data.' });
        }
        console.log(`Successfully logged ${clickstreamEvents.length} clickstream events.`);
        res.status(200).json({ status: 'success', eventsReceived: clickstreamEvents.length });
    });
});

// --- NEW ENDPOINT for retrieving clickstream logs ---
app.get('/api/get-clickstream-logs', (req, res) => {
    const logFilePath = path.join(__dirname, 'clickstream_log.json');
    fs.readFile(logFilePath, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                return res.status(200).json([]); // File not found, return empty array
            }
            console.error('Failed to read clickstream log file:', err);
            return res.status(500).json({ error: 'Failed to retrieve clickstream logs.' });
        }
        try {
            // Each line is a JSON array string. Split by newline, filter out empty lines.
            const lines = data.trim().split('\n').filter(line => line.trim() !== '');
            // For now, send as an array of strings, client can parse if needed
            // Or, parse each line into an object: const parsedLogs = lines.map(line => JSON.parse(line));
            res.status(200).json(lines); 
        } catch (parseError) {
            console.error('Error parsing clickstream log data:', parseError);
            res.status(500).json({ error: 'Error parsing clickstream log data.' });
        }
    });
});

// --- NEW ENDPOINT for retrieving visualization data log ---
app.get('/api/get-visualization-logs', (req, res) => {
    const vizFilePath = path.join(__dirname, 'visualization_data.json');
    fs.readFile(vizFilePath, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                return res.status(200).json({}); // File not found, return empty object
            }
            console.error('Failed to read visualization data file:', err);
            return res.status(500).json({ error: 'Failed to retrieve visualization data.' });
        }
        try {
            const jsonData = JSON.parse(data);
            res.status(200).json(jsonData);
        } catch (parseError) {
            console.error('Error parsing visualization data:', parseError);
            res.status(500).json({ error: 'Error parsing visualization data.' });
        }
    });
});

app.listen(PORT, () => {
    console.log(`AI Proxy server running on port ${PORT}`);
});
