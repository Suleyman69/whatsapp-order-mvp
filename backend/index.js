const { Pool } = require('pg');

let pool;

function init() {
    pool = new Pool({
        host: process.env.POSTGRES_HOST,
        port: process.env.POSTGRES_PORT,
        database: process.env.POSTGRES_DB,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
    });
    return pool.query('SELECT 1');
}

function query(text, params) {
    return pool.query(text, params);
}

module.exports = { init, query };