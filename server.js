const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ============================================================
// CONFIG
// ============================================================

// Set this in Render Environment Variables.
//
// Example:
// LOOTLABS_LINK_BASE=https://loot-link.com/s/XXXXXXXX
//
// Do NOT put your LootLabs API key here.
const LOOTLABS_LINK_BASE =
    process.env.LOOTLABS_LINK_BASE || "";

// Keys last 5 hours.
const KEY_LIFETIME = 5 * 60 * 60 * 1000;

// Claims that were started but not completed
// are kept for 30 minutes.
const CLAIM_LIFETIME = 30 * 60 * 1000;

// ============================================================
// STORAGE
// ============================================================

const claims = new Map();
const keys = new Map();

// ============================================================
// HELPERS
// ============================================================

function createRandomId(bytes = 18) {
    return crypto.randomBytes(bytes).toString("hex");
}

function createKey() {
    return (
        "BLOXY-" +
        crypto.randomBytes(8).toString("hex").toUpperCase()
    );
}

function cleanOldData() {
    const now = Date.now();

    // Remove old claims
    for (const [claimId, claim] of claims.entries()) {
        if (now - claim.createdAt > CLAIM_LIFETIME) {
            claims.delete(claimId);
        }
    }

    // Remove expired keys
    for (const [key, keyData] of keys.entries()) {
        if (now >= keyData.expiresAt) {
            keys.delete(key);
        }
    }
}

setInterval(cleanOldData, 5 * 60 * 1000);

// ============================================================
// CUSTOM BLOXYHUB PAGE
// ============================================================

app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>BloxyHub Key System</title>

    <meta
        name="description"
        content="BloxyHub Key System"
    >

    <!-- =====================================================
         LOOTLABS PLACEMENT
         ===================================================== -->

    <script
        data-cfasync="false"
        src="//dcbbwymp1bhlf.cloudfront.net/?wbbcd=1724481">
    </script>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;

            display: flex;
            align-items: center;
            justify-content: center;

            background:
                radial-gradient(
                    circle at top,
                    #202020 0%,
                    #101010 45%,
                    #080808 100%
                );

            color: white;
            font-family:
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                Arial,
                sans-serif;

            padding: 20px;
        }

        .container {
            width: 100%;
            max-width: 460px;
        }

        .card {
            background: rgba(20, 20, 20, 0.96);
            border: 1px solid #303030;
            border-radius: 22px;
            padding: 30px;

            box-shadow:
                0 20px 60px rgba(0, 0, 0, 0.45);

            text-align: center;
        }

        .logo {
            width: 64px;
            height: 64px;

            margin: 0 auto 18px;

            border-radius: 18px;

            display: flex;
            align-items: center;
            justify-content: center;

            background: #ffffff;
            color: #111111;

            font-size: 25px;
            font-weight: 800;
        }

        h1 {
            margin: 0;
            font-size: 28px;
        }

        .subtitle {
            color: #a8a8a8;
            margin-top: 8px;
            line-height: 1.5;
        }

        .button {
            width: 100%;

            border: 0;
            border-radius: 12px;

            padding: 14px 18px;
            margin-top: 22px;

            background: white;
            color: black;

            font-size: 15px;
            font-weight: 700;

            cursor: pointer;

            transition:
                transform 0.15s,
                opacity 0.15s;
        }

        .button:hover {
            transform: translateY(-1px);
        }

        .button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .status {
            display: none;

            margin-top: 18px;
            padding: 14px;

            border-radius: 12px;

            background: #171717;
            border: 1px solid #292929;

            color: #bdbdbd;

            font-size: 14px;
            line-height: 1.5;
        }

        .key-box {
            display: none;

            margin-top: 22px;
            padding: 18px;

            background: #111111;
            border: 1px solid #333333;
            border-radius: 14px;
        }

        .key-label {
            color: #888888;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 9px;
        }

        .key {
            word-break: break-all;

            font-family:
                "SFMono-Regular",
                Consolas,
                monospace;

            font-size: 18px;
            font-weight: 700;
        }

        .timer {
            margin-top: 12px;
            color: #bdbdbd;
            font-size: 14px;
        }

        .timer strong {
            color: white;
        }

        .small {
            margin-top: 18px;
            color: #666666;
            font-size: 12px;
            line-height: 1.5;
        }

        .hidden {
            display: none !important;
        }

        .error {
            color: #ff8c8c;
        }

        .success {
            color: #a5f3a5;
        }
    </style>
</head>

<body>

<div class="container">
    <div class="card">

        <div class="logo">
            BH
        </div>

        <h1>BloxyHub</h1>

        <div class="subtitle">
            Complete the required tasks to receive your access key.
        </div>

        <button
            id="startButton"
            class="button"
            onclick="startClaim()"
        >
            GET KEY
        </button>

        <div
            id="status"
            class="status"
        ></div>

        <div
            id="keyBox"
            class="key-box"
        >
            <div class="key-label">
                Your Key
            </div>

            <div
                id="key"
                class="key"
            ></div>

            <div
                id="timer"
                class="timer"
            ></div>
        </div>

        <div class="small">
            Keys are valid for 5 hours after generation.
        </div>

    </div>
</div>

<script>
    let claimId = null;
    let statusTimer = null;
    let countdownTimer = null;

    const startButton =
        document.getElementById("startButton");

    const statusBox =
        document.getElementById("status");

    const keyBox =
        document.getElementById("keyBox");

    const keyElement =
        document.getElementById("key");

    const timerElement =
        document.getElementById("timer");

    function showStatus(message, className = "") {
        statusBox.style.display = "block";
        statusBox.className = "status " + className;
        statusBox.textContent = message;
    }

    async function startClaim() {
        startButton.disabled = true;

        showStatus(
            "Creating your verification session..."
        );

        try {
            const response = await fetch(
                "/api/start"
            );

            const data = await response.json();

            if (!data.success) {
                throw new Error(
                    data.error || "Unable to create claim"
                );
            }

            claimId = data.claimId;

            // Open LootLabs
            window.open(
                data.link,
                "_blank"
            );

            showStatus(
                "Complete the required LootLabs tasks in the new tab. This page will automatically detect when you finish."
            );

            startButton.textContent =
                "WAITING FOR COMPLETION";

            startStatusChecking();

        } catch (error) {
            showStatus(
                error.message || "Something went wrong.",
                "error"
            );

            startButton.disabled = false;
            startButton.textContent = "GET KEY";
        }
    }

    function startStatusChecking() {
        if (statusTimer) {
            clearInterval(statusTimer);
        }

        checkClaim();

        statusTimer = setInterval(
            checkClaim,
            3000
        );
    }

    async function checkClaim() {
        if (!claimId) {
            return;
        }

        try {
            const response = await fetch(
                "/api/claim-status?claimId=" +
                encodeURIComponent(claimId)
            );

            const data = await response.json();

            if (!data.success) {
                if (data.error === "Key expired") {
                    showExpired();
                }

                return;
            }

            if (!data.completed) {
                return;
            }

            if (!data.key) {
                return;
            }

            clearInterval(statusTimer);

            statusBox.style.display = "none";

            startButton.classList.add("hidden");

            keyBox.style.display = "block";

            keyElement.textContent =
                data.key;

            startCountdown(
                data.expiresAt
            );

        } catch (error) {
            console.log(
                "Status check failed:",
                error
            );
        }
    }

    function startCountdown(expiresAt) {
        if (countdownTimer) {
            clearInterval(countdownTimer);
        }

        function updateCountdown() {
            const remaining =
                expiresAt - Date.now();

            if (remaining <= 0) {
                showExpired();
                return;
            }

            const totalSeconds =
                Math.floor(
                    remaining / 1000
                );

            const hours =
                Math.floor(
                    totalSeconds / 3600
                );

            const minutes =
                Math.floor(
                    (totalSeconds % 3600) / 60
                );

            const seconds =
                totalSeconds % 60;

            timerElement.innerHTML =
                "Expires in <strong>" +
                hours +
                "h " +
                String(minutes).padStart(2, "0") +
                "m " +
                String(seconds).padStart(2, "0") +
                "s</strong>";
        }

        updateCountdown();

        countdownTimer =
            setInterval(
                updateCountdown,
                1000
            );
    }

    function showExpired() {
        if (statusTimer) {
            clearInterval(statusTimer);
        }

        if (countdownTimer) {
            clearInterval(countdownTimer);
        }

        keyBox.style.display = "none";

        startButton.classList.remove(
            "hidden"
        );

        startButton.disabled = false;

        startButton.textContent =
            "GET NEW KEY";

        showStatus(
            "Your key has expired. You can generate a new one.",
            "error"
        );

        claimId = null;
    }
</script>

</body>
</html>
    `);
});

// ============================================================
// START ANONYMOUS CLAIM
// ============================================================

app.get("/api/start", (req, res) => {

    if (!LOOTLABS_LINK_BASE) {
        return res.status(500).json({
            success: false,
            error: "LootLabs link has not been configured on the server."
        });
    }

    const claimId =
        createRandomId(18);

    claims.set(claimId, {
        createdAt: Date.now(),
        completed: false,
        uniqueId: null
    });

    const separator =
        LOOTLABS_LINK_BASE.includes("?")
            ? "&"
            : "?";

    const lootLabsLink =
        LOOTLABS_LINK_BASE +
        separator +
        "puid=" +
        encodeURIComponent(claimId);

    console.log(
        "[Claim Created] " +
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

    const clickId =
        String(
            req.query.click_id || ""
        ).trim();

    const uniqueId =
        String(
            req.query.unique_id || ""
        ).trim();

    const ip =
        String(
            req.query.ip || ""
        ).trim();

    if (!clickId) {
        console.warn(
            "[LootLabs] Missing click_id"
        );

        return res
            .status(400)
            .send("Missing click_id");
    }

    const claim =
        claims.get(clickId);

    if (!claim) {
        console.warn(
            "[LootLabs] Unknown claim: " +
            clickId
        );

        return res
            .status(404)
            .send("Unknown claim");
    }

    // Prevent duplicate rewards.
    if (claim.completed) {
        return res
            .status(200)
            .send("OK");
    }

    claim.completed = true;
    claim.completedAt = Date.now();
    claim.uniqueId =
        uniqueId || null;
    claim.ip =
        ip || null;

    const generatedKey =
        createKey();

    const createdAt =
        Date.now();

    const expiresAt =
        createdAt +
        KEY_LIFETIME;

    keys.set(
        generatedKey,
        {
            createdAt: createdAt,
            expiresAt: expiresAt,
            claimId: clickId,
            uniqueId: uniqueId || null
        }
    );

    console.log(
        "[Key Generated] " +
        generatedKey +
        " Expires=" +
        new Date(
            expiresAt
        ).toISOString()
    );

    res
        .status(200)
        .send("OK");
});

// ============================================================
// CLAIM STATUS
// ============================================================

app.get("/api/claim-status", (req, res) => {

    const claimId =
        String(
            req.query.claimId || ""
        ).trim();

    if (!claimId) {
        return res.status(400).json({
            success: false,
            error: "Missing claimId"
        });
    }

    const claim =
        claims.get(claimId);

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

    for (
        const [key, keyData]
        of keys.entries()
    ) {
        if (
            keyData.claimId ===
            claimId
        ) {
            foundKey = key;
            break;
        }
    }

    if (!foundKey) {
        return res.json({
            success: false,
            completed: true,
            error: "Key not found"
        });
    }

    const keyData =
        keys.get(foundKey);

    if (
        Date.now() >=
        keyData.expiresAt
    ) {
        keys.delete(
            foundKey
        );

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
        expiresAt:
            keyData.expiresAt
    });
});

// ============================================================
// VERIFY KEY
// ============================================================
//
// Roblox can call:
//
// /api/verify-key?key=BLOXY-XXXXXXXX
//
// Since this version doesn't use a Roblox User ID,
// possession of a valid key is what grants access.
// ============================================================

app.get("/api/verify-key", (req, res) => {

    const key =
        String(
            req.query.key || ""
        ).trim();

    if (!key) {
        return res.json({
            valid: false,
            message: "Missing key"
        });
    }

    const keyData =
        keys.get(key);

    if (!keyData) {
        return res.json({
            valid: false,
            message: "Invalid key"
        });
    }

    if (
        Date.now() >=
        keyData.expiresAt
    ) {
        keys.delete(key);

        return res.json({
            valid: false,
            message: "Key expired"
        });
    }

    res.json({
        valid: true,
        message: "Access Granted",
        expiresAt:
            keyData.expiresAt
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
        "BloxyHub Key System running on port " +
        PORT
    );
});
