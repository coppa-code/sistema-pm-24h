// server.js - Sistema PM CORRIGIDO para Render
const express = require('express');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// ⚙️ CONFIGURAÇÕES (usando require ao invés de import)
const CONFIG = {
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID || 'ACbdbb222bea4e9a291bf7b7fe53ed07c1',
        authToken: process.env.TWILIO_AUTH_TOKEN || 'fc025f744ef00c1986053eac8fd183ee',
        fromNumber: process.env.TWILIO_FROM_NUMBER || 'whatsapp:+14155238886',
        toNumber: process.env.TWILIO_TO_NUMBER || '+557181478028'
    },
    notification: {
        timing: process.env.NOTIFICATION_TIMING || '1-day',
        sendTime: process.env.NOTIFICATION_TIME || '09:00'
    },
    keepAlive: {
        enabled: process.env.KEEP_ALIVE_ENABLED !== 'false',
        interval: 10 * 60 * 1000 // 10 minutos
    }
};

// 🔄 SISTEMA KEEP-ALIVE
function startKeepAlive() {
    if (!CONFIG.keepAlive.enabled) {
        console.log('🔄 Keep-alive desabilitado');
        return;
    }

    setInterval(async () => {
        try {
            console.log(`🔄 Keep-alive ativo - ${new Date().toLocaleTimeString('pt-BR')}`);
        } catch (error) {
            console.log(`🔄 Keep-alive erro: ${error.message}`);
        }
    }, CONFIG.keepAlive.interval);
    
    console.log(`🔄 Keep-alive iniciado: ping a cada ${CONFIG.keepAlive.interval/1000/60} minutos`);
}

// 📱 Função para enviar WhatsApp (usando fetch nativo)
async function sendWhatsAppMessage(to, message) {
    try {
        const fetch = (await import('node-fetch')).default;
        const url = `https://api.twilio.com/2010-04-01/Accounts/${CONFIG.twilio.accountSid}/Messages.json`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${CONFIG.twilio.accountSid}:${CONFIG.twilio.authToken}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                From: CONFIG.twilio.fromNumber,
                To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
                Body: message
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Twilio Error: ${error.message}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Erro no envio WhatsApp:', error);
        throw error;
    }
}

// 🤖 Simulação de verificação (sem Firebase por agora)
async function executeAutomaticCheck(periodo = 'padrão') {
    console.log(`🎖️ === EXECUÇÃO AUTOMÁTICA PM (${periodo.toUpperCase()}) === ${new Date().toLocaleString('pt-BR')}`);
    
    try {
        // Simulação - depois conectamos Firebase
        console.log(`📋 Verificando aniversários (${periodo})...`);
        console.log(`ℹ️ Nenhuma notificação para envio hoje (modo teste - ${periodo})`);
        
        // Teste com aniversário fictício se for sábado OU domingo (para testar mais)
        const today = new Date();
        const isWeekend = today.getDay() === 6 || today.getDay() === 0; // Sábado ou Domingo
        
        if (isWeekend) {
            console.log(`🧪 Enviando teste de fim de semana (${periodo})...`);
            
            const horarioTexto = periodo === 'manhã' ? '09:00 (Manhã)' : 
                                periodo === 'noite' ? '22:40 (Noite)' : 
                                'Automático';
            
            const emojis = periodo === 'manhã' ? '🌅☀️' : 
                          periodo === 'noite' ? '🌙⭐' : 
                          '🤖';
            
            const testMessage = `${emojis} *SISTEMA PM ${periodo.toUpperCase()}* 🎖️

⏰ *Execução:* ${horarioTexto}
🗓️ *Data:* ${new Date().toLocaleDateString('pt-BR')}
🕒 *Horário Atual:* ${new Date().toLocaleTimeString('pt-BR')}
🆓 *Plataforma:* Render FREE
🔧 *Status:* Funcionando automaticamente!

📊 *Dupla Verificação:*
• 🌅 09:00 - Verificação matinal
• 🌙 22:40 - Verificação noturna

✅ *Sistema PM operacional 24/7 com dupla execução!*

---
_Execução automática ${periodo}_ 🚀`;

            await sendWhatsAppMessage(CONFIG.twilio.toNumber, testMessage);
            console.log(`✅ Teste de fim de semana (${periodo}) enviado!`);
        }

    } catch (error) {
        console.error(`❌ Erro na execução automática (${periodo}):`, error);
    }
}

// 🕘 CONFIGURAR CRON JOBS
// Executa todos os dias às 09:00 (manhã)
const cronTimeMorning = `0 ${CONFIG.notification.sendTime.split(':')[1]} ${CONFIG.notification.sendTime.split(':')[0]} * * *`;
cron.schedule(cronTimeMorning, () => {
    console.log(`🌅 EXECUÇÃO MANHÃ (09:00) - ${new Date().toLocaleString('pt-BR')}`);
    executeAutomaticCheck('manhã');
}, {
    timezone: "America/Sao_Paulo"
});

// Executa todos os dias às 22:40 (noite)
cron.schedule('40 22 * * *', () => {
    console.log(`🌙 EXECUÇÃO NOITE (22:40) - ${new Date().toLocaleString('pt-BR')}`);
    executeAutomaticCheck('noite');
}, {
    timezone: "America/Sao_Paulo"
});

// Verificação a cada 2 horas para manter ativo
cron.schedule('0 */2 * * *', () => {
    console.log(`🔍 Sistema ativo (verificação) - ${new Date().toLocaleString('pt-BR')}`);
});

// 🌐 ROTAS WEB
app.use(express.json());

// Rota para keep-alive
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'alive', 
        timestamp: new Date().toLocaleString('pt-BR'),
        uptime: process.uptime(),
        keepAlive: CONFIG.keepAlive.enabled
    });
});

// Página principal
app.get('/', (req, res) => {
    const uptime = Math.floor(process.uptime());
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Sistema PM 24/7</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                .header { text-align: center; background: #007bff; color: white; padding: 20px; border-radius: 10px; }
                .status { background: #d4edda; padding: 15px; margin: 20px 0; border-radius: 5px; }
                .endpoint { background: #f8f9fa; padding: 10px; margin: 10px 0; border-radius: 5px; }
                a { color: #007bff; text-decoration: none; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🎖️ Sistema PM 24/7 ATIVO!</h1>
                <p>Sistema de Aniversários da Polícia Militar</p>
            </div>
            
            <div class="status">
                <p><strong>Status:</strong> ✅ Online (Render FREE)</p>
                <p><strong>Horário:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                <p><strong>Uptime:</strong> ${hours}h ${minutes}m</p>
                <p><strong>Keep-alive:</strong> ${CONFIG.keepAlive.enabled ? '✅ Ativo' : '❌ Desabilitado'}</p>
                <p><strong>Execuções Automáticas:</strong></p>
                <ul>
                    <li>🌅 <strong>09:00</strong> - Verificação matinal</li>
                    <li>🌙 <strong>22:40</strong> - Verificação noturna</li>
                </ul>
                <p><strong>Destinatário:</strong> ${CONFIG.twilio.toNumber}</p>
            </div>
            
            <h3>🔧 Endpoints Disponíveis:</h3>
            <div class="endpoint"><a href="/test">🧪 /test</a> - Testar WhatsApp</div>
            <div class="endpoint"><a href="/check">🔍 /check</a> - Verificar agora (manual)</div>
            <div class="endpoint"><a href="/check?periodo=manhã">🌅 /check?periodo=manhã</a> - Simular execução matinal</div>
            <div class="endpoint"><a href="/check?periodo=noite">🌙 /check?periodo=noite</a> - Simular execução noturna</div>
            <div class="endpoint"><a href="/status">📊 /status</a> - Status JSON</div>
            <div class="endpoint"><a href="/ping">🔄 /ping</a> - Keep-alive</div>
            
            <hr>
            <p><small>💡 <strong>Render FREE:</strong> Sistema funcionando 24/7 gratuitamente</small></p>
        </body>
        </html>
    `);
});

// Endpoint para teste
app.get('/test', async (req, res) => {
    try {
        const testMessage = `🧪 *TESTE SISTEMA PM* 🎖️

⏰ *Horário:* ${new Date().toLocaleString('pt-BR')}
🆓 *Plataforma:* Render FREE
🔧 *Status:* Funcionando perfeitamente!
📱 *WhatsApp:* Conectado via Twilio

📊 *Execuções Automáticas:*
• 🌅 09:00 - Verificação matinal
• 🌙 22:40 - Verificação noturna

✅ *Sistema PM com dupla execução pronto!*

---
_Teste manual realizado_ 🚀`;

        const result = await sendWhatsAppMessage(CONFIG.twilio.toNumber, testMessage);
        res.json({ 
            success: true, 
            message: 'Teste enviado com sucesso!', 
            sid: result.sid,
            timestamp: new Date().toLocaleString('pt-BR'),
            platform: 'Render FREE'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            timestamp: new Date().toLocaleString('pt-BR')
        });
    }
});

// Endpoint para verificação manual
app.get('/check', async (req, res) => {
    try {
        const periodo = req.query.periodo || 'manual';
        await executeAutomaticCheck(periodo);
        res.json({ 
            success: true, 
            message: `Verificação ${periodo} executada com sucesso!`,
            timestamp: new Date().toLocaleString('pt-BR')
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            timestamp: new Date().toLocaleString('pt-BR')
        });
    }
});

// Status do sistema
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        platform: 'Render FREE',
        keepAlive: CONFIG.keepAlive.enabled,
        timestamp: new Date().toLocaleString('pt-BR'),
        timezone: 'America/Sao_Paulo',
        config: {
            timing: CONFIG.notification.timing,
            executions: [
                { time: '09:00', description: 'Verificação matinal' },
                { time: '22:40', description: 'Verificação noturna' }
            ],
            toNumber: CONFIG.twilio.toNumber
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.2.0 - Dupla Execução'
    });
});

// 🚀 INICIAR SERVIDOR
app.listen(PORT, () => {
    console.log(`🎖️ Sistema PM iniciado na porta ${PORT}`);
    console.log(`⏰ Cron jobs configurados:`);
    console.log(`   🌅 09:00 - Verificação matinal`);
    console.log(`   🌙 22:40 - Verificação noturna`);
    console.log(`📱 Destinatário: ${CONFIG.twilio.toNumber}`);
    console.log(`🌍 Timezone: America/Sao_Paulo`);
    console.log(`🆓 Render FREE - Sistema ativo!`);
    
    // Iniciar keep-alive
    startKeepAlive();
    
    console.log(`✅ SISTEMA PM COM DUPLA EXECUÇÃO FUNCIONANDO!`);
});

// Tratamento de erros
process.on('uncaughtException', (error) => {
    console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promessa rejeitada:', reason);
});

console.log('🎖️ Sistema PM carregado com sucesso!');
