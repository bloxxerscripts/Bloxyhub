const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ============================================================
// CONFIG
// ============================================================

const LOOTLABS_LINK_BASE =
    process.env.LOOTLABS_LINK_BASE ||
    "https://loot-link.com/s?YOUR_LOOTLABS_ID";

const KEY_LIFETIME = 12 * 60 * 60 * 1000;
const CLAIM_LIFETIME = 30 * 60 * 1000;

// ============================================================
// STORAGE
// ============================================================

const claims = new Map();
const keys = new Map();

// ============================================================
// HELPERS
// ============================================================

function createRandomId(bytes = 16) {
    return crypto.randomBytes(bytes).toString("hex");
}

function createKey() {
    return "BLOXY-" + crypto.randomBytes(8).toString("hex").toUpperCase();
}

function cleanOldData() {
    const now = Date.now();

    for (const [claimId, claim] of claims.entries()) {
        if (now - claim.createdAt > CLAIM_LIFETIME) {
            claims.delete(claimId);
        }
    }

    for (const [key, keyData] of keys.entries()) {
        if (now > keyData.expiresAt) {
            keys.delete(key);
        }
    }
}

setInterval(cleanOldData, 5 * 60 * 1000);

// ============================================================
// HOME
// ============================================================

app.get("/", (req, res) => {
    res.status(200).send("BloxyHub Key System Backend is Live!");
});

// ============================================================
// GET LOOTLABS LINK
// ============================================================

app.get("/api/get-link", (req, res) => {
    const userId = String(req.query.userId || "").trim();

    if (!userId) {
        return res.status(400).json({
            success: false,
            error: "Missing userId"
        });
    }

    if (!/^\d+$/.test(userId)) {
        return res.status(400).json({
            success: false,
            error: "Invalid Roblox userId"
        });
    }

    const claimId = createRandomId(18);

    claims.set(claimId, {
        userId: userId,
        createdAt: Date.now(),
        completed: false,
        uniqueId: null
    });

    const separator = LOOTLABS_LINK_BASE.includes("?")
        ? "&"
        : "?";

    const lootLabsLink =
        LOOTLABS_LINK_BASE +
        separator +
        "puid=" +
        encodeURIComponent(claimId);

    console.log(
        "[Claim Created] UserID=" +
        userId +
        " ClaimID=" +
        claimId
    );

    res.json({
        success: true,
        claimId: claimId,
        link: lootLabsLink
    });
});

// ============================================================
// LOOTLABS POSTBACK
// ============================================================

app.get("/api/lootlabs-postback", (req, res) => {
    const clickId = String(req.query.click_id || "").trim();
    const uniqueId = String(req.query.unique_id || "").trim();
    const ip = String(req.query.ip || "").trim();

    if (!clickId) {
        console.warn("[LootLabs] Missing click_id");
        return res.status(400).send("Missing click_id");
    }

    const claim = claims.get(clickId);

    if (!claim) {
        console.warn("[LootLabs] Unknown claim: " + clickId);
        return res.status(404).send("Unknown claim");
    }

    if (claim.completed) {
        console.log(
            "[LootLabs] Claim already completed: " +
            clickId
        );

        return res.status(200).send("OK");
    }

    claim.completed = true;
    claim.completedAt = Date.now();
    claim.uniqueId = uniqueId || null;
    claim.ip = ip || null;

    const generatedKey = createKey();
    const createdAt = Date.now();

    keys.set(generatedKey, {
        userId: claim.userId,
        createdAt: createdAt,
        expiresAt: createdAt + KEY_LIFETIME,
        claimId: clickId,
        uniqueId: uniqueId || null
    });

    console.log(
        "[Key Generated] Key=" +
        generatedKey +
        " UserID=" +
        claim.userId
    );

    res.status(200).send("OK");
});

// ============================================================
// CLAIM STATUS
// ============================================================

app.get("/api/claim-status", (req, res) => {
    const claimId = String(req.query.claimId || "").trim();

    if (!claimId) {
        return res.status(400).json({
            success: false,
            error: "Missing claimId"
        });
    }

    const claim = claims.get(claimId);

    if (!claim) {
        return res.status(404).json({
            success: false,
            error: "Claim not found or expired"
        });
    }

    if (!claim.completed) {
        return res.json({
            success: true,
            completed: false
        });
    }

    let foundKey = null;

    for (const [key, keyData] of keys.entries()) {
        if (keyData.claimId === claimId) {
            foundKey = key;
            break;
        }
    }

    if (!foundKey) {
        return res.status(404).json({
            success: false,
            error: "Key not found"
        });
    }

    const keyData = keys.get(foundKey);

    if (Date.now() > keyData.expiresAt) {
        keys.delete(foundKey);

        return res.json({
            success: false,
            completed: true,
            error: "Key expired"
        });
    }

    res.json({
        success: true,
        completed: true,
        key: foundKey,
        expiresAt: keyData.expiresAt
    });
});

// ============================================================
// VERIFY KEY
// ============================================================

app.get("/api/verify-key", (req, res) => {
    const userId = String(req.query.userId || "").trim();
    const key = String(req.query.key || "").trim();

    if (!userId || !key) {
        return res.json({
            valid: false,
            message: "Missing parameters"
        });
    }

    const keyData = keys.get(key);

    if (!keyData) {
        return res.json({
            valid: false,
            message: "Invalid key"
        });
    }

    if (Date.now() > keyData.expiresAt) {
        keys.delete(key);

        return res.json({
            valid: false,
            message: "Key expired"
        });
    }

    if (keyData.userId !== userId) {
        return res.json({
            valid: false,
            message: "Key belongs to another user"
        });
    }

    res.json({
        valid: true,
        message: "Access Granted",
        expiresAt: keyData.expiresAt
    });
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
    res.json({
        online: true,
        service: "BloxyHub Key System",
        claims: claims.size,
        activeKeys: keys.size
    });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log(
        "BloxyHub Key System running on port " + PORT
    );
});
