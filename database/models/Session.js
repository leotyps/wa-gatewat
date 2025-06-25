// database/models/Session.js
import { DataTypes } from 'sequelize';
import sequelize from '../index.js';

const Session = sequelize.define('Session', {
    sessionId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        primaryKey: true
    },
    creds: {
        type: DataTypes.TEXT, // Storing JSON as text
        allowNull: false
    }
}, {
    tableName: 'baileys_sessions' // Custom table name
});

export default Session;
