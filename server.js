// server.js - Sistema PM OTIMIZADO - 09:00 e 09:10 Brasil - VERSÃO CORRIGIDA
const express = require('express');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 10000;

// ⚙️ CONFIGURAÇÕES
const CONFIG = {
    firebase: {
        apiKey: process.env.FIREBASE_API_KEY || "AIzaSyACqmiKFVEbm-P1tCVmYXl-B5a-wum2XPQ",
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || "aniversario-dcdd8.firebaseapp.com",
        projectId: process.env.FIREBASE_PROJECT_ID || "aniversario-dcdd8",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "aniversario-dcdd8.firebasestorage.app",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "848233635514",
        appId: process.env.FIREBASE_APP_ID || "1:848233635514:web:352f8de44f58ca86f7ec83"
    },
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID || 'ACbdbb222bea4e9a291bf7b7fe53ed07c1',
        authToken: process.env.TWILIO_AUTH_TOKEN || 'fc025f744ef00c1986053eac8fd183ee',
        fromNumber: process.env.TWILIO_FROM_NUMBER || 'whatsapp:+14155238886',
        toNumber: process.env.TWILIO_TO_NUMBER || 'whatsapp:+557181478028'
    }
};

// 🛡️ CONTROLE DE LIMITE DIÁRIO
let dailyMessageCount = 0;
const MAX_DAILY_MESSAGES = 8; // Deixar margem de segurança

// 📱 FUNÇÃO DE ENVIO WHATSAPP COM CONTROLE
async function sendWhatsAppMessage(to, message) {
    if (dailyMessageCount >= MAX_DAILY_MESSAGES) {
        console.log(`⚠️ LIMITE DIÁRIO ATINGIDO: ${dailyMessageCount}/${MAX_DAILY_MESSAGES}`);
        throw new Error(`Limite diário de mensagens atingido (${dailyMessageCount}/${MAX_DAILY_MESSAGES})`);
    }

    try {
        const twilio = require('twilio')(CONFIG.twilio.accountSid, CONFIG.twilio.authToken);
        
        console.log('📤 Enviando mensagem WhatsApp...');
        console.log(`📞 Para: ${to}`);
        console.log(`📝 Tamanho: ${message.length} caracteres`);
        
        const result = await twilio.messages.create({
            from: CONFIG.twilio.fromNumber,
            to: to,
            body: message
        });
        
        dailyMessageCount++;
        console.log(`✅ WhatsApp enviado com sucesso!`);
        console.log(`📊 Mensagens hoje: ${dailyMessageCount}/${MAX_DAILY_MESSAGES}`);
        console.log(`🆔 SID: ${result.sid}`);
        
        return result;
        
    } catch (error) {
        console.error('❌ Erro no envio WhatsApp:', error.message);
        
        if (error.code === 63038) {
            console.error('❌ LIMITE TWILIO EXCEDIDO - Upgrade necessário');
        }
        
        throw error;
    }
}

// 🔥 FUNÇÃO FIREBASE
async function getBirthdaysFromFirebase() {
    try {
        console.log('🔥 Conectando ao Firebase...');
        
        const { initializeApp } = require('firebase/app');
        const { getFirestore, collection, getDocs } = require('firebase/firestore');
        
        const app = initializeApp(CONFIG.firebase);
        const db = getFirestore(app);
        
        const querySnapshot = await getDocs(collection(db, 'birthdays'));
        const birthdays = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            birthdays.push({
                id: doc.id,
                name: data.name || 'Nome não informado',
                graduation: data.graduation || 'Graduação não informada',
                date: data.date || '',
                phone: data.phone || 'Telefone não informado',
                relationship: data.relationship || 'Relacionamento não informado',
                unit: data.unit || ''
            });
        });
        
        console.log(`✅ Firebase: ${birthdays.length} aniversários carregados`);
        return birthdays;
        
    } catch (error) {
        console.error('❌ Erro ao buscar dados do Firebase:', error.message);
        throw error;
    }
}

// 🎂 FUNÇÃO VERIFICAR ANIVERSÁRIOS DE AMANHÃ
function checkTomorrowBirthdays(birthdays) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const tomorrowDay = tomorrow.getDate().toString().padStart(2, '0');
    const tomorrowMonth = (tomorrow.getMonth() + 1).toString().padStart(2, '0');
    
    console.log(`🔍 Verificando aniversários para AMANHÃ: ${tomorrowDay}/${tomorrowMonth}`);
    
    const tomorrowBirthdays = birthdays.filter(birthday => {
        if (!birthday.date) return false;
        
        const [day, month] = birthday.date.split('/');
        const birthdayDay = day.padStart(2, '0');
        const birthdayMonth = month.padStart(2, '0');
        
        const match = birthdayDay === tomorrowDay && birthdayMonth === tomorrowMonth;
        
        if (match) {
            console.log(`🎂 ENCONTRADO: ${birthday.graduation} ${birthday.name} - ${birthday.date}`);
        }
        
        return match;
    });
    
    console.log(`📊 Total de aniversários AMANHÃ: ${tomorrowBirthdays.length}`);
    return tomorrowBirthdays;
}

// 🧮 CALCULAR IDADE
function calculateAge(birthDate) {
    try {
        const [day, month, year] = birthDate.split('/');
        const birth = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        const today = new Date();
        
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        
        return age;
    } catch (error) {
        console.error('❌ Erro ao calcular idade:', error.message);
        return 0;
    }
}

// 💬 FUNÇÃO CRIAR MENSAGEM ÚNICA OTIMIZADA
function createCombinedBirthdayMessage(birthdays, periodo = 'padrão') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const periodoEmoji = periodo === '09:00' ? '🌅' : 
                        periodo === '09:10' ? '☀️' : '🎂';
    
    const periodoTexto = periodo === '09:00' ? '(Lembrete 09:00h)' : 
                        periodo === '09:10' ? '(Lembrete 09:10h)' : 
                        '(Lembrete Automático)';
    
    const birthdayList = birthdays.map((birthday, index) => {
        const nextAge = calculateAge(birthday.date) + 1;
        return `${index + 1}. 🎖️ *${birthday.graduation} ${birthday.name}*
   🎈 Fará: ${nextAge} anos
   📞 Tel: ${birthday.phone}
   👥 ${birthday.relationship}
   ${birthday.unit ? `🏢 ${birthday.unit}` : ''}`;
    }).join('\n\n');
    
    return `${periodoEmoji} *LEMBRETES DE ANIVERSÁRIO PM* 🎖️
${periodoTexto}

📅 *AMANHÃ* - ${tomorrow.toLocaleDateString('pt-BR')}
🎂 *Total:* ${birthdays.length} aniversariante(s)

${birthdayList}

🎁 *NÃO ESQUEÇA DE PARABENIZAR TODOS AMANHÃ!*
💐 *Sugestões:* Ligação, mensagem, presente ou visita

---
_Sistema PM 24/7 - ${periodo}h Brasil_ 🎖️
_${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}_`;
}

// 🤖 EXECUÇÃO AUTOMÁTICA OTIMIZADA - UMA MENSAGEM SÓ
async function executeAutomaticCheck(periodo = 'padrão') {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🎖️ === EXECUÇÃO AUTOMÁTICA PM (${periodo.toUpperCase()}) === ${brasilTime}`);
    
    try {
        const allBirthdays = await getBirthdaysFromFirebase();
        
        if (allBirthdays.length === 0) {
            console.log('📋 Nenhum aniversário encontrado no Firebase');
            return;
        }
        
        const tomorrowBirthdays = checkTomorrowBirthdays(allBirthdays);
        
        if (tomorrowBirthdays.length === 0) {
            console.log(`ℹ️ Nenhum aniversário AMANHÃ (${periodo})`);
            return;
        }
        
        // ✅ ENVIAR UMA MENSAGEM ÚNICA COM TODOS
        console.log(`🎂 ENVIANDO 1 MENSAGEM ÚNICA com ${tomorrowBirthdays.length} aniversariante(s)...`);
        
        const combinedMessage = createCombinedBirthdayMessage(tomorrowBirthdays, periodo);
        const result = await sendWhatsAppMessage(CONFIG.twilio.toNumber, combinedMessage);
        
        console.log(`✅ MENSAGEM ÚNICA ENVIADA - SID: ${result.sid}`);
        console.log(`🎂 Aniversariantes: ${tomorrowBirthdays.map(b => `${b.graduation} ${b.name}`).join(', ')}`);
        
        // 📊 Relatório final
        console.log(`📊 RELATÓRIO FINAL (${periodo}):`);
        console.log(`   ✅ Mensagem enviada: 1`);
        console.log(`   🎂 Aniversariantes: ${tomorrowBirthdays.length}`);
        console.log(`   📊 Mensagens hoje: ${dailyMessageCount}/${MAX_DAILY_MESSAGES}`);
        
    } catch (error) {
        console.error(`❌ Erro na execução automática (${periodo}):`, error.message);
    }
}

// 🌐 ROTAS EXPRESS
app.use(express.json());

// Rota principal
app.get('/', (req, res) => {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const utcTime = new Date().toISOString();
    
    res.json({
        status: 'Sistema PM 24/7 Online! 🎖️',
        version: '2.0 - Otimizado',
        horario_brasil: brasilTime,
        horario_utc: utcTime,
        proximas_execucoes: [
            '09:00 Brasil (12:00 UTC)',
            '09:10 Brasil (12:10 UTC)'
        ],
        limite_diario: `${dailyMessageCount}/${MAX_DAILY_MESSAGES} mensagens`
    });
});

// Rota de status
app.get('/status', (req, res) => {
    res.json({
        sistema: 'Sistema PM 24/7',
        status: 'Online',
        servidor: 'Render',
        porta: PORT,
        timezone: 'America/Sao_Paulo',
        mensagens_hoje: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
        proxima_execucao_09h: '12:00 UTC',
        proxima_execucao_09h10: '12:10 UTC'
    });
});

// Rota de teste 09:00
app.get('/test-0900', async (req, res) => {
    try {
        console.log('🧪 TESTE MANUAL 09:00 INICIADO...');
        await executeAutomaticCheck('09:00');
        
        res.json({
            status: 'Teste 09:00 executado com sucesso! ✅',
            horario: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            mensagens_hoje: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`
        });
    } catch (error) {
        res.status(500).json({
            status: 'Erro no teste 09:00 ❌',
            erro: error.message,
            mensagens_hoje: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`
        });
    }
});

// Rota de teste 09:10
app.get('/test-0910', async (req, res) => {
    try {
        console.log('🧪 TESTE MANUAL 09:10 INICIADO...');
        await executeAutomaticCheck('09:10');
        
        res.json({
            status: 'Teste 09:10 executado com sucesso! ✅',
            horario: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            mensagens_hoje: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`
        });
    } catch (error) {
        res.status(500).json({
            status: 'Erro no teste 09:10 ❌',
            erro: error.message,
            mensagens_hoje: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`
        });
    }
});

// Rota para verificar aniversários
app.get('/check', async (req, res) => {
    try {
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        
        res.json({
            total_aniversarios: birthdays.length,
            aniversarios_amanha: tomorrowBirthdays.length,
            lista_amanha: tomorrowBirthdays.map(b => ({
                nome: `${b.graduation} ${b.name}`,
                data: b.date,
                telefone: b.phone
            })),
            mensagens_hoje: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`
        });
    } catch (error) {
        res.status(500).json({
            erro: error.message
        });
    }
});

// 🚀 INICIAR SERVIDOR PRIMEIRO
app.listen(PORT, () => {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    
    console.log(`🎖️ === SISTEMA PM 24/7 INICIADO ===`);
    console.log(`🌐 Servidor rodando na porta: ${PORT}`);
    console.log(`⏰ Horário Brasil: ${brasilTime}`);
    console.log(`🔥 Firebase configurado: ${CONFIG.firebase.projectId}`);
    console.log(`📱 Twilio configurado: ${CONFIG.twilio.accountSid}`);
    console.log(`📊 Limite diário: ${MAX_DAILY_MESSAGES} mensagens`);
    
    // 🕘 CONFIGURAR CRON JOBS APÓS SERVIDOR INICIAR
    console.log('⏰ Configurando cron jobs para 09:00 e 09:10 Brasil...');
    
    // 09:00 Brasil = 12:00 UTC (Brasil UTC-3)
    cron.schedule('0 12 * * *', () => {
        const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        console.log(`🌅 EXECUÇÃO 09:00 BRASIL (12:00 UTC) - ${brasilTime}`);
        executeAutomaticCheck('09:00');
    }, {
        timezone: "UTC"
    });
    
    // 09:10 Brasil = 12:10 UTC (Brasil UTC-3)
    cron.schedule('10 12 * * *', () => {
        const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        console.log(`☀️ EXECUÇÃO 09:10 BRASIL (12:10 UTC) - ${brasilTime}`);
        executeAutomaticCheck('09:10');
    }, {
        timezone: "UTC"
    });
    
    // Reset contador diário às 00:00 UTC
    cron.schedule('0 0 * * *', () => {
        dailyMessageCount = 0;
        console.log('🔄 Contador de mensagens resetado para novo dia');
    }, {
        timezone: "UTC"
    });
    
    console.log(`⏰ Cron jobs configurados para Render (UTC):`);
    console.log(`   🌅 12:00 UTC = 09:00 Brasil (Verificação 1)`);
    console.log(`   ☀️ 12:10 UTC = 09:10 Brasil (Verificação 2)`);
    console.log(`   🔄 00:00 UTC = Reset contador diário`);
    console.log(`✅ Sistema PM 24/7 operacional!`);
});

// 🛡️ TRATAMENTO DE ERROS GLOBAIS
process.on('uncaughtException', (error) => {
    console.error('❌ Erro não capturado:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rejeitada:', reason);
});
