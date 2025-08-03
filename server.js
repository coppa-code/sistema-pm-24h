// 🛡️ CONTROLE DE LIMITE DIÁRIO
let dailyMessageCount = 0;
const MAX_DAILY_MESSAGES = 8; // Deixar 1 de margem

async function sendWhatsAppMessage(to, message) {
    if (dailyMessageCount >= MAX_DAILY_MESSAGES) {
        console.log(`⚠️ LIMITE DIÁRIO ATINGIDO: ${dailyMessageCount}/${MAX_DAILY_MESSAGES}`);
        throw new Error('Limite diário de mensagens atingido');
    }
    
    try {
        // ... código do envio ...
        dailyMessageCount++;
        console.log(`📊 Mensagens enviadas hoje: ${dailyMessageCount}/${MAX_DAILY_MESSAGES}`);
        return result;
    } catch (error) {
        // ... tratamento de erro ...
    }
}

// Reset diário às 00:00 UTC
cron.schedule('0 0 * * *', () => {
    dailyMessageCount = 0;
    console.log('🔄 Contador de mensagens resetado para novo dia');
}, {
    timezone: "UTC"
});
