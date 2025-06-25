// database/index.js
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import Logger from '../lib/logger.js'; // Import the logger

dotenv.config();

const logger = Logger.child({ class: 'Database' });

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false // Set to true in production if you have a valid CA
        }
    },
    logging: msg => logger.debug(msg) // Log Sequelize queries at debug level
});

export const connectDB = async () => {
    try {
        await sequelize.authenticate();
        logger.info('Database connection has been established successfully.');
        await sequelize.sync(); // Sync all models
        logger.info('All models were synchronized successfully.');
    } catch (error) {
        logger.error('Unable to connect to the database:', error);
        process.exit(1); // Exit process on database connection failure
    }
};

export default sequelize;
