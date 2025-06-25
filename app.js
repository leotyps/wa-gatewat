// app.js
import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { connectDB } from './database/index.js';
import { initializeWhatsAppClient, getWhatsAppClient, sendMessage, requestPairingCode, validateApiKey } from './lib/whatsapp.js';
import logger from './lib/logger.js'; // Import the logger

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- API Endpoints ---

// Endpoint to get connection status and QR code (for initial pairing)
app.get('/status', async (req, res) => {
    try {
        const client = getWhatsAppClient();
        if (!client) {
            return res.status(503).json({ status: 'error', message: 'WhatsApp client not initialized.' });
        }

        const connectionStatus = client.ws.readyState === client.ws.OPEN ? 'connected' : 'disconnected';
        const user = client.user ? client.user.id : null;

        let qrCode = null;
        if (!client.authState.creds.registered && client.ws.readyState === client.ws.CONNECTING) {
             qrCode = "Awaiting QR code. Check logs or implement QR callback.";
        }

        res.json({
            status: 'success',
            connection: connectionStatus,
            user: user,
            qrCode: qrCode,
            message: connectionStatus === 'connected' ? `Connected as ${user}` : 'Not connected'
        });
    } catch (error) {
        logger.error('Error getting status:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error', details: error.message });
    }
});

// Endpoint to request pairing code (for mobile pairing)
// Supports both POST (body) and GET (query parameters)
app.all('/request-pairing-code', async (req, res) => {
    // Determine if parameters come from body (POST) or query (GET)
    const phoneNumber = req.body.phoneNumber || req.query.phoneNumber;

    if (!phoneNumber) {
        return res.status(400).json({ status: 'error', message: 'Phone number is required.' });
    }

    try {
        const pairingCode = await requestPairingCode(phoneNumber);
        res.json({ status: 'success', message: 'Pairing code generated.', pairingCode: pairingCode });
    } catch (error) {
        logger.error('Failed to request pairing code:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});


// Endpoint to send a message
// Supports both POST (body) and GET (query parameters)
app.all('/send-message', async (req, res) => {
    // Determine if parameters come from body (POST) or query (GET)
    const to = req.body.to || req.query.to;
    const message = req.body.message || req.query.message;

    if (!to || !message) {
        return res.status(400).json({ status: 'error', message: 'Both "to" and "message" are required.' });
    }

    try {
        const recipientJid = to.endsWith('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
        await sendMessage(recipientJid, message);
        res.json({ status: 'success', message: 'Message sent successfully.' });
    } catch (error) {
        logger.error('Error sending message:', error);
        res.status(500).json({ status: 'error', message: 'Failed to send message', details: error.message });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.send('WhatsApp Baileys REST API is running!');
});

// --- Server Start ---

const startServer = async () => {
    try {
        await validateApiKey(); // Validate JKT48 API key first
        await connectDB(); // Connect to database
        await initializeWhatsAppClient(); // Initialize WhatsApp client

        app.listen(PORT, () => {
            logger.info(`Server is running on port ${PORT}`);
            logger.info(`Access API at http://localhost:${PORT}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1); // Exit if critical services fail to start
    }
};

startServer();
