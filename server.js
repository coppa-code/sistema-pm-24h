// server.js - Sistema PM com HORÁRIOS DINÂMICOS - v2.5.0
const express = require('express');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// ⚙️ CONFIGURAÇÕES DINÂMICAS
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
    },
    // 🕘 HORÁRIOS DINÂMICOS - PODEM SER ALTERADOS VIA ENV OU API
    schedules: {
        time1: process.env.SCHEDULE_TIME1 || '19:20', // Formato HH:MM Brasil
        time2: process.env.SCHEDULE_TIME2 || '19:25', // Formato HH:MM Brasil
        adminPassword: process.env.ADMIN_PASSWORD || 'pm2024', // Senha para alterar horários
        timezone: 'America/Sao_Paulo'
    },
    keepAlive: {
        enabled: process.env.KEEP_ALIVE_ENABLED !== 'false',
        interval: 10 * 60 * 1000
    }
};

// 🛡️ CONTROLE DE LIMITE DIÁRIO E TWILIO
let dailyMessageCount = 0;
const MAX_DAILY_MESSAGES = 3;
let twilioLimitReached = false;

// 🕘 CONTROLE DE CRON JOBS DINÂMICOS
let activeCronJobs = [];

// 🔥 INICIALIZAR FIREBASE
let db = null;
let firebaseModules = null;

async function initializeFirebase() {
    try {
        const { initializeApp } = await import('firebase/app');
        const { getFirestore, collection, getDocs, query, orderBy } = await import('firebase/firestore');
        
        firebaseModules = { collection, getDocs, query, orderBy };
        
        const firebaseApp = initializeApp(CONFIG.firebase);
        db = getFirestore(firebaseApp);
        
        console.log('🔥 Firebase conectado com sucesso!');
        return true;
    } catch (error) {
        console.error('❌ Erro ao conectar Firebase:', error);
        return false;
    }
}

// 🕘 FUNÇÕES DE CONVERSÃO DE HORÁRIO
function brasilToUTC(brasilTime) {
    const [hours, minutes] = brasilTime.split(':').map(Number);
    
    // Brasil está UTC-3, então para converter:
    // Brasil 19:20 = UTC 22:20
    let utcHours = hours + 3;
    let utcMinutes = minutes;
    
    // Ajustar se passar de 24h
    if (utcHours >= 24) {
        utcHours -= 24;
    }
    
    return {
        hours: utcHours.toString().padStart(2, '0'),
        minutes: utcMinutes.toString().padStart(2, '0'),
        cron: `${utcMinutes} ${utcHours} * * *`
    };
}

function getCurrentScheduleInfo() {
    const time1UTC = brasilToUTC(CONFIG.schedules.time1);
    const time2UTC = brasilToUTC(CONFIG.schedules.time2);
    
    return {
        brasil: {
            time1: CONFIG.schedules.time1,
            time2: CONFIG.schedules.time2
        },
        utc: {
            time1: `${time1UTC.hours}:${time1UTC.minutes}`,
            time2: `${time2UTC.hours}:${time2UTC.minutes}`
        },
        cron: {
            time1: time1UTC.cron,
            time2: time2UTC.cron
        }
    };
}

// 🔄 LIMPAR CRON JOBS EXISTENTES
function clearExistingCronJobs() {
    console.log(`🔄 Limpando ${activeCronJobs.length} cron jobs existentes...`);
    activeCronJobs.forEach(job => {
        try {
            job.destroy();
        } catch (error) {
            console.log(`⚠️ Erro ao limpar cron job: ${error.message}`);
        }
    });
    activeCronJobs = [];
}

// 🕘 CRIAR CRON JOBS DINAMICAMENTE
function setupDynamicCronJobs() {
    // Limpar jobs existentes primeiro
    clearExistingCronJobs();
    
    const scheduleInfo = getCurrentScheduleInfo();
    
    console.log('⏰ Configurando cron jobs dinâmicos...');
    console.log(`   🌙 ${CONFIG.schedules.time1} Brasil = ${scheduleInfo.utc.time1} UTC`);
    console.log(`   🌅 ${CONFIG.schedules.time2} Brasil = ${scheduleInfo.utc.time2} UTC`);
    
    // Cron Job 1
    const job1 = cron.schedule(scheduleInfo.cron.time1, () => {
        const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        console.log(`🌙 EXECUÇÃO ${CONFIG.schedules.time1} BRASIL (${scheduleInfo.utc.time1} UTC) - ${brasilTime}`);
        executeAutomaticCheck(CONFIG.schedules.time1);
    }, {
        timezone: "UTC",
        scheduled: true
    });
    
    // Cron Job 2
    const job2 = cron.schedule(scheduleInfo.cron.time2, () => {
        const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        console.log(`🌅 EXECUÇÃO ${CONFIG.schedules.time2} BRASIL (${scheduleInfo.utc.time2} UTC) - ${brasilTime}`);
        executeAutomaticCheck(CONFIG.schedules.time2);
    }, {
        timezone: "UTC",
        scheduled: true
    });
    
    // Reset diário sempre às 00:00 UTC
    const resetJob = cron.schedule('0 0 * * *', () => {
        dailyMessageCount = 0;
        twilioLimitReached = false;
        console.log('🔄 Contador de mensagens e flag Twilio resetados para novo dia');
    }, {
        timezone: "UTC",
        scheduled: true
    });
    
    // Armazenar referências dos jobs
    activeCronJobs = [job1, job2, resetJob];
    
    console.log(`✅ ${activeCronJobs.length} cron jobs configurados com sucesso!`);
    return scheduleInfo;
}

// 🔧 ATUALIZAR HORÁRIOS DINAMICAMENTE
function updateSchedules(newTime1, newTime2, password) {
    // Verificar senha
    if (password !== CONFIG.schedules.adminPassword) {
        throw new Error('Senha administrativa incorreta');
    }
    
    // Validar formato de horário
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(newTime1) || !timeRegex.test(newTime2)) {
        throw new Error('Formato de horário inválido. Use HH:MM (ex: 19:30)');
    }
    
    // Verificar se os horários são diferentes
    if (newTime1 === newTime2) {
        throw new Error('Os dois horários devem ser diferentes');
    }
    
    console.log(`🔄 ATUALIZANDO HORÁRIOS:`);
    console.log(`   Anterior: ${CONFIG.schedules.time1} e ${CONFIG.schedules.time2}`);
    console.log(`   Novo: ${newTime1} e ${newTime2}`);
    
    // Atualizar configuração
    CONFIG.schedules.time1 = newTime1;
    CONFIG.schedules.time2 = newTime2;
    
    // Recriar cron jobs
    const scheduleInfo = setupDynamicCronJobs();
    
    console.log(`✅ Horários atualizados com sucesso!`);
    return scheduleInfo;
}

// [Resto das funções permanecem iguais - sendWhatsAppMessage, getBirthdaysFromFirebase, etc.]
async function sendWhatsAppMessage(to, message) {
    if (twilioLimitReached) {
        console.log(`🚫 LIMITE TWILIO ATINGIDO - Mensagem não enviada para economizar`);
        throw new Error('Limite Twilio atingido - Mensagem bloqueada para economizar');
    }

    if (dailyMessageCount >= MAX_DAILY_MESSAGES) {
        console.log(`⚠️ LIMITE DIÁRIO INTERNO ATINGIDO: ${dailyMessageCount}/${MAX_DAILY_MESSAGES}`);
        throw new Error(`Limite diário interno atingido (${dailyMessageCount}/${MAX_DAILY_MESSAGES})`);
    }

    try {
        let fetch;
        
        try {
            fetch = globalThis.fetch;
            if (!fetch) {
                const nodeFetch = await import('node-fetch');
                fetch = nodeFetch.default || nodeFetch;
            }
        } catch (error) {
            console.error('❌ Erro ao importar fetch:', error);
            throw new Error('Fetch não disponível');
        }

        const url = `https://api.twilio.com/2010-04-01/Accounts/${CONFIG.twilio.accountSid}/Messages.json`;
        const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
        
        console.log('📤 Enviando mensagem WhatsApp...');
        console.log(`📞 Para: ${toNumber}`);
        console.log(`📝 Tamanho: ${message.length} caracteres`);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${CONFIG.twilio.accountSid}:${CONFIG.twilio.authToken}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                From: CONFIG.twilio.fromNumber,
                To: toNumber,
                Body: message
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Resposta Twilio:', response.status, errorText);
            
            if (response.status === 429 || errorText.includes('63038')) {
                twilioLimitReached = true;
                console.error('🚫 LIMITE TWILIO DETECTADO - Bloqueando próximas tentativas');
            }
            
            throw new Error(`Twilio Error ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        
        dailyMessageCount++;
        console.log(`✅ WhatsApp enviado com sucesso!`);
        console.log(`📊 Mensagens hoje: ${dailyMessageCount}/${MAX_DAILY_MESSAGES}`);
        console.log(`🆔 SID: ${result.sid}`);
        
        return result;
        
    } catch (error) {
        console.error('❌ Erro detalhado no envio WhatsApp:', error);
        
        if (error.message.includes('63038') || error.message.includes('429')) {
            twilioLimitReached = true;
            console.error('🚫 LIMITE TWILIO ATINGIDO - Bloqueando próximas tentativas');
        }
        
        throw error;
    }
}

async function getBirthdaysFromFirebase() {
    try {
        if (!db || !firebaseModules) {
            console.log('❌ Firebase não inicializado');
            return [];
        }

        const { collection, getDocs, query, orderBy } = firebaseModules;
        const q = query(collection(db, 'birthdays'), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
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
        console.error('❌ Erro ao buscar aniversários:', error);
        return [];
    }
}

function calculateAge(dateString) {
    try {
        if (!dateString || dateString.trim() === '') {
            return 0;
        }
        
        let day, month, year;
        
        if (dateString.includes('/')) {
            const dateParts = dateString.split('/');
            if (dateParts.length < 3) return 0;
            [day, month, year] = dateParts;
        } else if (dateString.includes('-')) {
            const dateParts = dateString.split('-');
            if (dateParts.length < 3) return 0;
            [year, month, day] = dateParts;
        } else {
            return 0;
        }
        
        if (!day || !month || !year) return 0;
        
        const birth = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        const today = new Date();
        
        if (isNaN(birth.getTime())) return 0;
        
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        
        return age > 0 ? age : 0;
    } catch (error) {
        console.error(`❌ Erro ao calcular idade para "${dateString}":`, error.message);
        return 0;
    }
}

function checkTomorrowBirthdays(birthdays) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const tomorrowDay = tomorrow.getDate().toString().padStart(2, '0');
    const tomorrowMonth = (tomorrow.getMonth() + 1).toString().padStart(2, '0');
    
    console.log(`🔍 Verificando aniversários para AMANHÃ: ${tomorrowDay}/${tomorrowMonth}`);
    
    const tomorrowBirthdays = birthdays.filter(birthday => {
        try {
            if (!birthday || !birthday.date || birthday.date.trim() === '') {
                return false;
            }
            
            let day, month;
            
            if (birthday.date.includes('/')) {
                const dateParts = birthday.date.split('/');
                if (dateParts.length < 2) return false;
                day = dateParts[0];
                month = dateParts[1];
            } else if (birthday.date.includes('-')) {
                const dateParts = birthday.date.split('-');
                if (dateParts.length < 3) return false;
                month = dateParts[1];
                day = dateParts[2];
            } else {
                return false;
            }
            
            if (!day || !month || day.trim() === '' || month.trim() === '') {
                return false;
            }
            
            const birthdayDay = day.toString().trim().padStart(2, '0');
            const birthdayMonth = month.toString().trim().padStart(2, '0');
            
            const match = birthdayDay === tomorrowDay && birthdayMonth === tomorrowMonth;
            
            if (match) {
                console.log(`🎂 ENCONTRADO: ${birthday.graduation || 'Sem graduação'} ${birthday.name || 'Sem nome'} - ${birthday.date}`);
            }
            
            return match;
            
        } catch (error) {
            console.error(`❌ Erro ao processar aniversário de ${birthday.name || 'Nome desconhecido'}:`, error.message);
            return false;
        }
    });
    
    console.log(`📊 Total de aniversários AMANHÃ: ${tomorrowBirthdays.length}`);
    return tomorrowBirthdays;
}

function createCombinedBirthdayMessage(birthdays, periodo = 'padrão') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const periodoEmoji = periodo === CONFIG.schedules.time1 ? '🌙' : 
                        periodo === CONFIG.schedules.time2 ? '🌅' : '🎂';
    
    const periodoTexto = periodo === CONFIG.schedules.time1 ? `(Lembrete ${CONFIG.schedules.time1}h)` : 
                        periodo === CONFIG.schedules.time2 ? `(Lembrete ${CONFIG.schedules.time2}h)` : 
                        '(Lembrete Automático)';
    
    const birthdayList = birthdays.map((birthday, index) => {
        const nextAge = calculateAge(birthday.date) + 1;
        const ageText = nextAge > 0 ? `${nextAge} anos` : 'Idade não calculada';
        
        return `${index + 1}. 🎖️ *${birthday.graduation || 'Sem graduação'} ${birthday.name || 'Sem nome'}*
   🎈 Fará: ${ageText}
   📞 Tel: ${birthday.phone || 'Não informado'}
   👥 ${birthday.relationship || 'Não informado'}
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

async function executeAutomaticCheck(periodo = 'padrão') {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🎖️ === EXECUÇÃO AUTOMÁTICA PM (${periodo.toUpperCase()}) === ${brasilTime}`);
    
    if (twilioLimitReached) {
        console.log(`🚫 EXECUÇÃO CANCELADA - Limite Twilio atingido (${periodo})`);
        return;
    }
    
    try {
        const allBirthdays = await getBirthdaysFromFirebase();
        
        if (allBirthdays.length === 0) {
            console.log('📋 Nenhum aniversário encontrado no Firebase');
            return;
        }
        
        const tomorrowBirthdays = checkTomorrowBirthdays(allBirthdays);
        
        if (tomorrowBirthdays.length === 0) {
            console.log(`ℹ️ Nenhum aniversário AMANHÃ (${periodo})`);
            console.log(`💡 Nenhuma mensagem enviada - Economizando limite Twilio`);
            return;
        }
        
        console.log(`🎂 ENVIANDO 1 MENSAGEM ÚNICA com ${tomorrowBirthdays.length} aniversariante(s)...`);
        
        const combinedMessage = createCombinedBirthdayMessage(tomorrowBirthdays, periodo);
        const result = await sendWhatsAppMessage(CONFIG.twilio.toNumber, combinedMessage);
        
        console.log(`✅ MENSAGEM ÚNICA ENVIADA - SID: ${result.sid}`);
        console.log(`🎂 Aniversariantes: ${tomorrowBirthdays.map(b => `${b.graduation || 'Sem graduação'} ${b.name || 'Sem nome'}`).join(', ')}`);
        
        console.log(`📊 RELATÓRIO FINAL (${periodo}):`);
        console.log(`   ✅ Mensagem enviada: 1`);
        console.log(`   🎂 Aniversariantes: ${tomorrowBirthdays.length}`);
        console.log(`   💰 Economia: ${tomorrowBirthdays.length - 1} mensagens poupadas`);
        console.log(`   📊 Mensagens hoje: ${dailyMessageCount}/${MAX_DAILY_MESSAGES}`);
        
    } catch (error) {
        console.error(`❌ Erro na execução automática (${periodo}):`, error.message);
        
        if (twilioLimitReached || error.message.includes('Limite Twilio atingido')) {
            console.log(`🚫 Alerta de erro não enviado - Limite Twilio atingido`);
            return;
        }
        
        try {
            if (dailyMessageCount < MAX_DAILY_MESSAGES) {
                const errorMessage = `❌ *ERRO SISTEMA PM* 🚨

⏰ *Horário:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
🔧 *Período:* ${periodo}
⚠️ *Erro:* ${error.message}

💡 *Verificar logs no Render para mais detalhes*

---
_Sistema PM - Alerta de Erro v2.5.0_ ⚠️`;

                await sendWhatsAppMessage(CONFIG.twilio.toNumber, errorMessage);
            }
        } catch (e) {
            console.error('❌ Erro ao enviar alerta de erro:', e);
        }
    }
}

// 🌐 ROTAS WEB
app.use(express.json());

// 🔧 ENDPOINT ADMINISTRATIVO PARA ALTERAR HORÁRIOS
app.post('/admin/update-schedules', async (req, res) => {
    try {
        const { time1, time2, password } = req.body;
        
        if (!time1 || !time2 || !password) {
            return res.status(400).json({
                success: false,
                error: 'Campos obrigatórios: time1, time2, password'
            });
        }
        
        const scheduleInfo = updateSchedules(time1, time2, password);
        
        // Enviar confirmação via WhatsApp
        try {
            const confirmMessage = `🔧 *HORÁRIOS ATUALIZADOS* ✅

⏰ *Novos horários:*
• 🌙 Verificação 1: ${time1} Brasil (${scheduleInfo.utc.time1} UTC)  
• 🌅 Verificação 2: ${time2} Brasil (${scheduleInfo.utc.time2} UTC)

🔄 *Cron jobs recriados automaticamente*
📊 *Sistema funcionando com novos horários*

---
_Atualização via API - v2.5.0_ 🚀
_${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}_`;

            await sendWhatsAppMessage(CONFIG.twilio.toNumber, confirmMessage);
        } catch (whatsappError) {
            console.log('⚠️ Erro ao enviar confirmação via WhatsApp:', whatsappError.message);
        }
        
        res.json({
            success: true,
            message: 'Horários atualizados com sucesso!',
            schedules: scheduleInfo,
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            version: '2.5.0'
        });
        
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
            version: '2.5.0'
        });
    }
});

// 📊 ENDPOINT PARA VER HORÁRIOS ATUAIS
app.get('/admin/current-schedules', (req, res) => {
    const scheduleInfo = getCurrentScheduleInfo();
    
    res.json({
        success: true,
        currentSchedules: scheduleInfo,
        activeCronJobs: activeCronJobs.length,
        lastUpdate: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        version: '2.5.0'
    });
});

// 🖥️ INTERFACE WEB PARA ALTERAR HORÁRIOS
app.get('/admin', (req, res) => {
    const scheduleInfo = getCurrentScheduleInfo();
    
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin - Configurar Horários</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: rgba(255, 255, 255, 0.95);
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                }
                h1 {
                    text-align: center;
                    color: #333;
                    margin-bottom: 30px;
                    font-size: 2rem;
                }
                .current-schedule {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 30px;
                    border-left: 4px solid #667eea;
                }
                .form-group {
                    margin-bottom: 20px;
                }
                label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 600;
                    color: #333;
                }
                input[type="time"], input[type="password"] {
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    font-size: 16px;
                    transition: border-color 0.3s;
                }
                input:focus {
                    border-color: #667eea;
                    outline: none;
                }
                button {
                    width: 100%;
                    padding: 15px;
                    background: linear-gradient(45deg, #667eea, #764ba2);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s;
                }
                button:hover {
                    transform: translateY(-2px);
                }
                .alert {
                    padding: 15px;
                    border-radius: 8px;
                    margin-top: 20px;
                    display: none;
                }
                .alert.success {
                    background: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }
                .alert.error {
                    background: #f8d7da;
                    color: #721c24;
                    border: 1px solid #f5c6cb;
                }
                .info-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-bottom: 20px;
                }
                .info-item {
                    background: white;
                    padding: 15px;
                    border-radius: 8px;
                    border: 1px solid #ddd;
                }
                .info-item strong {
                    color: #667eea;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔧 Painel Administrativo - Horários</h1>
                
                <div class="current-schedule">
                    <h3>📅 Horários Atuais</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <strong>Verificação 1:</strong><br>
                            🌙 ${scheduleInfo.brasil.time1} Brasil<br>
                            🌍 ${scheduleInfo.utc.time1} UTC
                        </div>
                        <div class="info-item">
                            <strong>Verificação 2:</strong><br>
                            🌅 ${scheduleInfo.brasil.time2} Brasil<br>
                            🌍 ${scheduleInfo.utc.time2} UTC
                        </div>
                    </div>
                    <p><strong>Cron Jobs Ativos:</strong> ${activeCronJobs.length}</p>
                </div>
                
                <form id="scheduleForm">
                    <div class="form-group">
                        <label for="time1">🌙 Novo Horário 1 (Brasil):</label>
                        <input type="time" id="time1" name="time1" value="${scheduleInfo.brasil.time1}" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="time2">🌅 Novo Horário 2 (Brasil):</label>
                        <input type="time" id="time2" name="time2" value="${scheduleInfo.brasil.time2}" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="password">🔐 Senha Administrativa:</label>
                        <input type="password" id="password" name="password" placeholder="Digite a senha admin" required>
                    </div>
                    
                    <button type="submit">🔄 Atualizar Horários</button>
                </form>
                
                <div id="alert" class="alert"></div>
                
                <div style="margin-top: 30px; text-align: center; color: #666;">
                    <p><strong>Instruções:</strong></p>
                    <p>• Use formato 24h (ex: 19:30)</p>
                    <p>• Os horários devem ser diferentes</p>
                    <p>• Conversão UTC automática</p>
                    <p>• Cron jobs recriados automaticamente</p>
                </div>
            </div>
            
            <script>
                document.getElementById('scheduleForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const formData = new FormData(e.target);
                    const data = {
                        time1: formData.get('time1'),
                        time2: formData.get('time2'),
                        password: formData.get('password')
                    };
                    
                    const alert = document.getElementById('alert');
                    
                    try {
                        const response = await fetch('/admin/update-schedules', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(data)
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            alert.className = 'alert success';
                            alert.innerHTML = '✅ ' + result.message + '<br>Página será recarregada em 3 segundos...';
                            alert.style.display = 'block';
                            
                            setTimeout(() => {
                                window.location.reload();
                            }, 3000);
                        } else {
                            alert.className = 'alert error';
                            alert.innerHTML = '❌ ' + result.error;
                            alert.style.display = 'block';
                        }
                    } catch (error) {
                        alert.className = 'alert error';
                        alert.innerHTML = '❌ Erro ao conectar com servidor: ' + error.message;
                        alert.style.display = 'block';
                    }
                    
                    // Limpar senha
                    document.getElementById('password').value = '';
                });
            </script>
        </body>
        </html>
    `);
});

// Rota principal atualizada
app.get('/', async (req, res) => {
    const scheduleInfo = getCurrentScheduleInfo();
    // ... resto do código da página principal com scheduleInfo
    
    res.send(`[Página principal com horários dinâmicos]`);
});

// 🚀 INICIALIZAR SERVIDOR
async function startServer() {
    try {
        console.log('🎖️ === INICIANDO SISTEMA PM 24/7 v2.5.0 HORÁRIOS DINÂMICOS ===');
        
        // Inicializar Firebase
        const firebaseConnected = await initializeFirebase();
        
        // Configurar cron jobs dinâmicos
        const scheduleInfo = setupDynamicCronJobs();
        
        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`\n🚀 === SERVIDOR ONLINE v2.5.0 ===`);
            console.log(`🌐 URL: https://seu-app.onrender.com`);
            console.log(`🔌 Porta: ${PORT}`);
            console.log(`🔥 Firebase: ${firebaseConnected ? 'Conectado ✅' : 'Desconectado ❌'}`);
            console.log(`\n⏰ HORÁRIOS DINÂMICOS ATIVOS:`);
            console.log(`   🌙 ${scheduleInfo.brasil.time1} Brasil = ${scheduleInfo.utc.time1} UTC`);
            console.log(`   🌅 ${scheduleInfo.brasil.time2} Brasil = ${scheduleInfo.utc.time2} UTC`);
            console.log(`   🔄 00:00 UTC = Reset diário`);
            console.log(`\n🔧 CONTROLES ADMINISTRATIVOS:`);
            console.log(`   📱 Interface: /admin`);
            console.log(`   🔧 API: POST /admin/update-schedules`);
            console.log(`   📊 Status: GET /admin/current-schedules`);
            console.log(`   🔐 Senha: ${CONFIG.schedules.adminPassword}`);
            console.log(`\n✅ Sistema com horários dinâmicos funcionando!`);
        });
        
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

startServer();
module.exports = app;
