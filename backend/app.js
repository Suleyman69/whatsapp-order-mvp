require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const whatsappWebhook = require('./api/webhook');
const db = require('./db/index');

const app = express();

app.use(bodyParser.json());

app.use('/webhook/whatsapp', whatsappWebhook);

// Sağlık kontrolü
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;

db.init().then(() => {
    app.listen(PORT, () => {
        console.log(`Server started on port ${PORT}`);
    });
}).catch((e) => {
    console.error('DB init error:', e);
    process.exit(1);
});