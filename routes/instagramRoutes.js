// Import necessary packages
require('dotenv').config(); // Loads .env file contents into process.env
const express = require('express');
const axios = require('axios');
const app = express.Router();

// Get your secret token from .env
const INSTAGRAM_TOKEN = process.env.INSTAGRAM_TOKEN;

// This is the API URL from your React component.
// We add "&limit=5" to get only 5 posts, as you requested.
const fields = 'id,media_url,permalink,media_type,thumbnail_url';
const API_URL = `https://graph.instagram.com/me/media?fields=${fields}&limit=5&access_token=${INSTAGRAM_TOKEN}`;

// --- The API Endpoint ---
// This is the endpoint your React app will call
app.get('/api/instagram-posts', async (req, res) => {
    try {
        console.log('Request received at /api/instagram-posts');
        
        // Make the secure call to the Instagram API from the server
        const response = await axios.get(API_URL);
        
        console.log('Successfully fetched data from Instagram');
        
        // Send the data (the array of posts) back to your React app
        res.status(200).json(response.data.data);

    } catch (error) {
        // Log the full error for debugging on the server
        console.error('Error fetching from Instagram:', error.response ? error.response.data : error.message);
        
        // Send a generic error message to the client
        res.status(500).json({ message: 'Error fetching Instagram posts' });
    }
});

module.exports = app;