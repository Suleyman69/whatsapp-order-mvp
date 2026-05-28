const guessLang = (msg) => {
    const trWords = ['döner', 'büyük', 'acısız', 'küçük', 'orta'];
    const deWords = ['groß', 'klein', 'scharf', 'ohne', 'mittel'];
    const tr = trWords.some((w) => msg.includes(w));
    const de = deWords.some((w) => msg.includes(w));
    if (tr) return 'tr';
    if (de) return 'de';
    return 'tr';
};

module.exports = function (req, res, next) {
    let text = '';
    try {
        const payload = req.body.entry ? req.body.entry[0] : req.body;
        if (payload?.changes?.[0]?.value?.messages?.[0]?.text?.body) {
            text = payload.changes[0].value.messages[0].text.body.toLowerCase();
        }
    } catch { /* ignore */ }

    req.language = guessLang(text);
    next();
};