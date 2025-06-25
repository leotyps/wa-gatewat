// lib/whatsapp.js
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from '@jkt48connect-corp/baileys';
import Pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import Session from '../database/models/Session.js';
import NodeCache from 'node-cache';
import logger from './logger.js';
import readline from 'readline';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const msgRetryCounterCache = new NodeCache();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

let waSocket;
let sessionCreds = {};

export const initializeWhatsAppClient = async (sessionId = 'default') => {
    logger.info(`Initializing WhatsApp client for session: ${sessionId}`);

    // Load credentials from database
    const sessionRecord = await Session.findByPk(sessionId);
    if (sessionRecord) {
        sessionCreds = JSON.parse(sessionRecord.creds);
        logger.info(`Loaded credentials for session ${sessionId} from database.`);
    } else {
        logger.warn(`No existing session found for ${sessionId}. A new one will be created.`);
        sessionCreds = {}; // Initialize empty for new session
    }

    const saveCreds = async () => {
        await Session.upsert({
            sessionId: sessionId,
            creds: JSON.stringify(waSocket.authState.creds)
        });
        logger.info(`Credentials for session ${sessionId} saved to database.`);
    };

    const connectionOptions = {
        printQRInTerminal: false,
        logger: Pino({ level: 'silent' }),
        auth: {
            creds: sessionCreds,
            keys: {
                get: async (type, ids) => {
                    const data = JSON.parse(sessionRecord?.creds || '{}');
                    return data.keys[type][ids];
                },
                set: async (data) => {
                    Object.assign(sessionCreds.keys, data);
                    await saveCreds();
                }
            }
        },
        markOnlineOnConnect: false,
        browser: Browsers.macOS('Safari'),
        version: [2, 3000, 1015901307],
        getMessage: async (key) => {
            // This is crucial for message re-sends and status updates
            // You might need to implement a message store here
            // For now, we return null, which means messages won't be re-sent automatically
            return null;
        }
    };

    waSocket = makeWASocket(connectionOptions);

    waSocket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin } = update;
        if (qr) {
            logger.info(`QR Code received for session ${sessionId}: ${qr}`);
            // Here you can emit the QR code to the API client or display it
            // For API, you'll likely send this back as a response.
            // Example: io.emit('qr', qr);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            logger.error(`Connection closed for session ${sessionId}. Reason: ${lastDisconnect.error?.output?.statusCode || lastDisconnect.error}. Reconnecting: ${shouldReconnect}`);
            // Clear credentials if logged out
            if (lastDisconnect.error?.output?.statusCode === DisconnectReason.loggedOut) {
                await Session.destroy({ where: { sessionId } });
                sessionCreds = {};
                logger.info(`Session ${sessionId} logged out. Credentials cleared.`);
            }
            if (shouldReconnect) {
                setTimeout(() => initializeWhatsAppClient(sessionId), 5000); // Reconnect after 5 seconds
            }
        } else if (connection === 'open') {
            logger.info(`WhatsApp client connected for session: ${sessionId}`);
            // You can send a confirmation message or update status here
            try {
                const {data} = await axios.get('https://ipwho.is');
                const message = `WhatsApp Bot Active!\nIP: ${data.ip}\nTime: ${new Date().toLocaleString()}`;
                await waSocket.sendMessage(waSocket.user.id, { text: message }); // Send to self
                logger.info('Sent bot active message to self.');
            } catch (e) {
                logger.error('Failed to send bot active message:', e);
            }
        }
    });

    waSocket.ev.on('creds.update', saveCreds);

    // You might want to add listeners for messages.upsert, etc. if you need to receive messages
    // waSocket.ev.on('messages.upsert', async (m) => {
    //     logger.info('Received message:', JSON.stringify(m, undefined, 2));
    // });

    return waSocket;
};

export const getWhatsAppClient = () => {
    if (!waSocket || !waSocket.user) {
        logger.warn('WhatsApp client not initialized or not connected.');
        return null;
    }
    return waSocket;
};

export const sendMessage = async (to, message) => {
    const client = getWhatsAppClient();
    if (!client) {
        throw new Error('WhatsApp client not initialized or not connected.');
    }

    try {
        const result = await client.sendMessage(to, { text: message });
        logger.info(`Message sent to ${to}: ${message}`);
        return result;
    } catch (error) {
        logger.error(`Failed to send message to ${to}:`, error);
        throw error;
    }
};

export const requestPairingCode = async (phoneNumber) => {
    const client = getWhatsAppClient();
    if (!client) {
        throw new Error('WhatsApp client not initialized or not connected.');
    }
    
    // Check if client is already registered
    if (client.authState.creds.registered) {
        throw new Error('WhatsApp client is already registered with a number.');
    }

    try {
        logger.info(`Requesting pairing code for ${phoneNumber}`);
        let code = await client.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        logger.info(`Generated pairing code: ${code}`);
        return code;
    } catch (err) {
        logger.error(`Failed to request pairing code: ${err.message}`);
        throw new Error(`Failed to request pairing code: ${err.message}`);
    }
};

// Simplified API Key Validation (as per your provided code)
import axios_jkt48 from 'axios';
import chalk from 'chalk';
import jkt48Api from '@jkt48connect-corp/baileys'; // Assuming this is the correct package for check

export async function validateApiKey() {
    try {
        logger.info(chalk.blue("🔐 Validating API..."));
        
        if (!process.env.JKT48_API_KEY) {
            logger.error(chalk.red("❌ API key not found in environment variables."));
            throw new Error("JKT48 API key not found.");
        }

        const check = await jkt48Api.check(process.env.JKT48_API_KEY); // Assuming jkt48Api.check exists in the package
        
        if (check.status) {
            logger.info(chalk.green(`✅ API Valid - ${check.message}`));
            return true;
        } else {
            logger.error(chalk.red(`❌ Invalid API: ${check.message}`));
            throw new Error(`Invalid JKT48 API key: ${check.message}`);
        }
    } catch (error) {
        logger.error(chalk.red(`🚫 API Error during validation: ${error.message}`));
        throw error;
    }
}
