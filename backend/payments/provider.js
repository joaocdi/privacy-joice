require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const name = process.env.PAYMENT_PROVIDER || 'mock';
if (name === 'mock' && process.env.NODE_ENV === 'production') throw new Error('Mock payments are forbidden in production');
if (!['mock','sigilopay'].includes(name)) throw new Error('PAYMENT_PROVIDER must be mock or sigilopay');
module.exports = require('./' + (name === 'mock' ? 'mock' : 'sigilopay') + '-provider');
