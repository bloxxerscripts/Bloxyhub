const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.json());

// In-memory key database (For production, consider using MongoDB / Quick.db)
const activeKeys = new Map();

// YOUR CONFIGURATION
const PORT = process.env.PORT || 3000;
const LOOTLABS_LINK_BASE = "https://loot-link.com/s?YOUR_LOOTLABS_ID"; // Replace with your actual LootLabs link

// ----------------------------------------------------
// 1. HOME ROUTE (Fixes "Cannot GET /")
// ----------------------------------------------------
app.get('/', (req, res) => {
    res.send('BloxyHub Key System Backend is Live!');
});

// ----------------------------------------------------
// 2. GET LINK ENDPOINT (Called by Roblox)
// Returns LootLabs link with Roblox userId in the 'puid' parameter
// ----------------------------------------------------
app.get('/api/get-link', (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ error: 'Missing userId parameter' });
    }

    // Embed the Roblox userId into LootLabs via puid
    const generatedLink = `${LOOTLABS_LINK_BASE}&puid=${userId}`;
    res.json({ link: generatedLink });
});

// ----------------------------------------------------
// 3. LOOTLABS POSTBACK ENDPOINT
// LootLabs sends a request here when a user completes the link
// ----------------------------------------------------
app.get('/api/lootlabs-postback', (req, res) => {
    const userId = req.query.click_id; // LootLabs returns puid as click_id
    const uniqueId = req.query.unique_id;

    if (!userId) {
        return res.status(400).send('Missing click_id');
    }

    // Generate a secure 12-character key for the user
    const generatedKey = "BLOXY-" + crypto.randomBytes(4).toString('hex').toUpperCase();
    
    // Save key valid for 24 hours (86400000 ms)
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000);
    activeKeys.set(generatedKey, { userId, expiresAt });

    console.log(`[Key Generated] Key: ${generatedKey} for Roblox UserID: ${userId}`);

    // Standard LootLabs response
    res.status(200).send('OK');
});

// ----------------------------------------------------
// 4. VERIFY KEY ENDPOINT (Called by Roblox UI)
// Checks if the key submitted in Roblox is valid
// ----------------------------------------------------
app.get('/api/verify-key', (req, res) => {
    const { userId, key } = req.query;

    if (!userId || !key) {
        return res.json({ valid: false, message: "Missing parameters" });
    }

    const keyData = activeKeys.get(key);

    if (!keyData) {
        return res.json({ valid: false, message: "Invalid key" });
    }

    if (Date.now() > keyData.expiresAt) {
        activeKeys.delete(key);
        return res.json({ valid: false, message: "Key expired" });
    }

    // Verify key belongs to the Roblox User attempting to redeem it
    if (keyData.userId !== String(userId)) {
        return res.json({ valid: false, message: "Key bound to another user" });
    }

    res.json({ valid: true, message: "Access Granted" });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
