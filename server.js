const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.json());

// CONFIGURATION - Change these values!
const OWNER_KEY = "SUPER_SECRET_OWNER_KEY_999"; 
const LOOTLABS_BASE_LINK = "https://loot-labs.com/your-tier-link?custom="; 
const PORT = process.env.PORT || 3000;

// IN-MEMORY STORAGE
const completedUsers = new Map();
const validKeys = new Map();

function generateKeyString() {
    return 'KEY-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

// 1. Redirect to LootLabs
app.get('/get-key', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).send('Missing userId parameter.');
    const lootLabsUrl = `${LOOTLABS_BASE_LINK}${encodeURIComponent(userId)}`;
    res.redirect(lootLabsUrl);
});

// 2. LootLabs Postback
app.get('/lootlabs-postback', (req, res) => {
    const userId = req.query.custom;
    if (!userId) return res.status(400).send('Invalid postback.');

    const expiry = Date.now() + (12 * 60 * 60 * 1000); // 12 hours
    completedUsers.set(String(userId), expiry);

    res.redirect(`/reveal-key?userId=${userId}`);
});

// 3. Key Reveal Page
app.get('/reveal-key', (req, res) => {
    const userId = String(req.query.userId);
    const expiry = completedUsers.get(userId);

    if (!expiry || Date.now() > expiry) {
        return res.send('<h2>Access Denied: Please complete the LootLabs task first.</h2>');
    }

    const userKey = generateKeyString();
    validKeys.set(userKey, expiry);
    completedUsers.delete(userId);

    res.send(`
        <html>
            <body style="font-family: Arial; text-align: center; padding-top: 50px; background-color: #121212; color: #fff;">
                <h1>Your 12-Hour Key</h1>
                <input type="text" value="${userKey}" readonly style="font-size: 20px; padding: 10px; width: 300px; text-align: center;" />
                <p>This key will expire in 12 hours.</p>
            </body>
        </html>
    `);
});

// 4. Verification API for Roblox
app.post('/api/verify-key', (req, res) => {
    const { key } = req.body;

    if (!key) return res.json({ success: false, message: 'No key provided.' });

    if (key === OWNER_KEY) {
        return res.json({ success: true, isOwner: true, message: 'Owner Key Validated (Permanent).' });
    }

    const expiry = validKeys.get(key);

    if (!expiry) return res.json({ success: false, message: 'Invalid Key.' });

    if (Date.now() > expiry) {
        validKeys.delete(key);
        return res.json({ success: false, message: 'Key Has Expired.' });
    }

    return res.json({ success: true, isOwner: false, message: 'Key Validated (12 Hours).' });
});

app.listen(PORT, () => console.log(`Key System Server running on port ${PORT}`));
