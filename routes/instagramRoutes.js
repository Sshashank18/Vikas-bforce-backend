// Import necessary packages
require('dotenv').config(); // Loads .env file contents into process.env
const express = require('express');
const axios = require('axios');
const app = express.Router();

// Get your secret token from .env
const INSTAGRAM_TOKEN = process.env.INSTAGRAM_TOKEN;
// Use the API version you mentioned
const API_VERSION = 'v24.0';

// --- The API Endpoint ---
// This is the endpoint your React app will call
app.get('/', async (req, res) => {
    
    // Check if the token is even in the .env file
    if (!INSTAGRAM_TOKEN) {
        console.error('Missing INSTAGRAM_TOKEN in .env file');
        return res.status(500).json({ message: 'Server configuration error' });
    }

    try {
        console.log('Request received at /api/instagram-posts');
        
        // --- STEP 1: Get your Instagram Business Account ID ---
        // We use the Facebook endpoint and your User Token to find your page
        const accountsApiUrl = `https://graph.facebook.com/${API_VERSION}/me/accounts?fields=instagram_business_account{id}&access_token=${INSTAGRAM_TOKEN}`;
        
        console.log('Fetching Instagram Business ID...');
        const accountsResponse = await axios.get(accountsApiUrl);

        // Find the first Instagram account linked
        const igAccount = accountsResponse.data.data.find(page => page.instagram_business_account);

        if (!igAccount) {
            console.error('No Instagram Business Account found linked to your Facebook Page.');
            return res.status(404).json({ message: 'No Instagram Business Account found.' });
        }

        const INSTAGRAM_BUSINESS_ID = igAccount.instagram_business_account.id;
        console.log('Got IG Business ID:', INSTAGRAM_BUSINESS_ID);

        // --- STEP 2: Use that ID to get the 5 most recent media posts ---
        const fields = 'id,media_url,permalink,media_type,thumbnail_url';
        const mediaApiUrl = `https://graph.facebook.com/${API_VERSION}/${INSTAGRAM_BUSINESS_ID}/media?fields=${fields}&limit=5&access_token=${INSTAGRAM_TOKEN}`;

        console.log('Fetching media from Instagram...');
        const mediaResponse = await axios.get(mediaApiUrl);
        
        console.log('Successfully fetched data from Instagram');
        
        // Send the data (the array of posts) back to your React app
        res.status(200).json(mediaResponse.data.data);

    } catch (error) {
        // Log the full error for debugging on the server
        const apiError = error.response ? error.response.data.error : { message: error.message };
        console.error('Error fetching from Facebook/Instagram API:', apiError);
        
        // Send a generic error message to the client
        res.status(500).json({ message: 'Error fetching Instagram posts', error: apiError });
    }
});

module.exports = app;