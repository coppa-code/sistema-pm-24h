// server.js - Sistema PM OTIMIZADO - SUPORTE DUPLO FORMATO + LIMITE TWILIO + HORÁRIOS DINÂMICOS - v2.4.1
const express = require('express');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

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
    },
    notification: {
        timing: process.env.NOTIFICATION_TIMING || '1-day',
        sendTime: process.env.NOTIFICATION_TIME || '19:20-19:25' // ATUALIZADO
    },
    keepAlive: {
        enabled: process.env.KEEP_ALIVE_ENABLED !== 'false',
        interval: 10 * 60 * 1000 // 10 minutos
    },
    // 🕘 NOVO: HORÁRIOS DINÂMICOS
    schedules: {
        time1: process.env.SCHEDULE_TIME1 || '19:20', // Formato HH:MM Brasil
        time2: process.env.SCHEDULE_TIME2 || '19:25', // Formato HH:MM Brasil
        adminPassword: process.env.ADMIN_PASSWORD || 'pm2024', // Senha para alterar horários
        timezone: 'America/Sao_Paulo'
    }
};

// 🛡️ CONTROLE DE LIMITE DIÁRIO E TWILIO
let dailyMessageCount = 0;
const MAX_DAILY_MESSAGES = 3; // ⚠️ REDUZIDO PARA EVITAR LIMITE TWILIO
let twilioLimitReached = false;

// 🕘 NOVO: CONTROLE DE CRON JOBS DINÂMICOS
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

// 🔄 SISTEMA KEEP-ALIVE
function startKeepAlive() {
    if (!CONFIG.keepAlive.enabled) {
        console.log('🔄 Keep-alive desabilitado');
        return;
    }

    setInterval(async () => {
        try {
            console.log(`🔄 Keep-alive ativo - ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
            // Limpar cache de memória
            if (global.gc) {
                global.gc();
            }
        } catch (error) {
            console.log(`🔄 Keep-alive erro: ${error.message}`);
        }
    }, CONFIG.keepAlive.interval);
    
    console.log(`🔄 Keep-alive iniciado: ping a cada ${CONFIG.keepAlive.interval/1000/60} minutos`);
}

// 🕘 NOVO: FUNÇÕES DE CONVERSÃO DE HORÁRIO
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

// 🔄 NOVO: LIMPAR CRON JOBS EXISTENTES
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

// 🕘 NOVO: CRIAR CRON JOBS DINAMICAMENTE
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

// 🔧 NOVO: ATUALIZAR HORÁRIOS DINAMICAMENTE
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

// 📱 FUNÇÃO OTIMIZADA COM CONTROLE DE LIMITE TWILIO
async function sendWhatsAppMessage(to, message) {
    // ✅ VERIFICAR SE JÁ ATINGIU LIMITE TWILIO
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
            
            // ✅ DETECTAR LIMITE TWILIO E MARCAR FLAG
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

// 📅 BUSCAR ANIVERSÁRIOS DO FIREBASE
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

// 🧮 CALCULAR IDADE SEGURA - SUPORTA AMBOS OS FORMATOS
function calculateAge(dateString) {
    try {
        if (!dateString || dateString.trim() === '') {
            console.log(`⚠️ Data vazia para cálculo de idade`);
            return 0;
        }
        
        let day, month, year;
        
        // ✅ DETECTAR FORMATO DA DATA
        if (dateString.includes('/')) {
            // Formato brasileiro: DD/MM/YYYY
            const dateParts = dateString.split('/');
            if (dateParts.length < 3) {
                console.log(`⚠️ Data brasileira incompleta: ${dateString}`);
                return 0;
            }
            [day, month, year] = dateParts;
        } else if (dateString.includes('-')) {
            // Formato americano: YYYY-MM-DD
            const dateParts = dateString.split('-');
            if (dateParts.length < 3) {
                console.log(`⚠️ Data americana incompleta: ${dateString}`);
                return 0;
            }
            [year, month, day] = dateParts;
        } else {
            console.log(`⚠️ Formato de data não reconhecido: ${dateString}`);
            return 0;
        }
        
        if (!day || !month || !year) {
            console.log(`⚠️ Partes da data vazias: ${dateString}`);
            return 0;
        }
        
        const birth = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        const today = new Date();
        
        // Verificar se a data é válida
        if (isNaN(birth.getTime())) {
            console.log(`⚠️ Data inválida após conversão: ${dateString}`);
            return 0;
        }
        
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

// 📅 VERIFICAR QUEM FAZ ANIVERSÁRIO AMANHÃ - SUPORTA AMBOS OS FORMATOS
function checkTomorrowBirthdays(birthdays) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const tomorrowDay = tomorrow.getDate().toString().padStart(2, '0');
    const tomorrowMonth = (tomorrow.getMonth() + 1).toString().padStart(2, '0');
    
    console.log(`🔍 Verificando aniversários para AMANHÃ: ${tomorrowDay}/${tomorrowMonth}`);
    
    const tomorrowBirthdays = birthdays.filter(birthday => {
        try {
            if (!birthday || !birthday.date || birthday.date.trim() === '') {
                console.log(`⚠️ Data vazia para: ${birthday?.name || 'Nome não informado'}`);
                return false;
            }
            
            let day, month;
            
            // ✅ DETECTAR E PROCESSAR FORMATO DA DATA
            if (birthday.date.includes('/')) {
                // Formato brasileiro: DD/MM/YYYY
                const dateParts = birthday.date.split('/');
                if (dateParts.length < 2) {
                    console.log(`⚠️ Data brasileira incompleta para ${birthday.name}: ${birthday.date}`);
                    return false;
                }
                day = dateParts[0];
                month = dateParts[1];
            } else if (birthday.date.includes('-')) {
                // Formato americano: YYYY-MM-DD
                const dateParts = birthday.date.split('-');
                if (dateParts.length < 3) {
                    console.log(`⚠️ Data americana incompleta para ${birthday.name}: ${birthday.date}`);
                    return false;
                }
                // YYYY-MM-DD -> extrair MM e DD
                month = dateParts[1]; // MM
                day = dateParts[2];   // DD
            } else {
                console.log(`⚠️ Formato de data não reconhecido para ${birthday.name}: ${birthday.date}`);
                return false;
            }
            
            if (!day || !month || day.trim() === '' || month.trim() === '') {
                console.log(`⚠️ Dia ou mês vazio para ${birthday.name}: ${birthday.date}`);
                return false;
            }
            
            const birthdayDay = day.toString().trim().padStart(2, '0');
            const birthdayMonth = month.toString().trim().padStart(2, '0');
            
            const match = birthdayDay === tomorrowDay && birthdayMonth === tomorrowMonth;
            
            if (match) {
                console.log(`🎂 ENCONTRADO: ${birthday.graduation || 'Sem graduação'} ${birthday.name || 'Sem nome'} - ${birthday.date} (${birthday.date.includes('/') ? 'BR' : 'US'} format)`);
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

// 💬 FUNÇÃO CRIAR MENSAGEM ÚNICA OTIMIZADA - ATUALIZADA PARA HORÁRIOS DINÂMICOS
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

// 🤖 EXECUÇÃO PRINCIPAL OTIMIZADA COM CONTROLE DE LIMITE
async function executeAutomaticCheck(periodo = 'padrão') {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🎖️ === EXECUÇÃO AUTOMÁTICA PM (${periodo.toUpperCase()}) === ${brasilTime}`);
    
    // ✅ VERIFICAR SE LIMITE TWILIO FOI ATINGIDO
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
            
            // ✅ REMOVER TESTE DE FIM DE SEMANA PARA ECONOMIZAR MENSAGENS
            console.log(`💡 Nenhuma mensagem enviada - Economizando limite Twilio`);
            return;
        }
        
        // ✅ ENVIAR MENSAGEM APENAS SE HOUVER ANIVERSÁRIOS
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
        
        // ✅ NÃO ENVIAR ALERTA DE ERRO SE LIMITE TWILIO ATINGIDO
        if (twilioLimitReached || error.message.includes('Limite Twilio atingido')) {
            console.log(`🚫 Alerta de erro não enviado - Limite Twilio atingido`);
            return;
        }
        
        // Tentar enviar erro apenas se ainda há limite
        try {
            if (dailyMessageCount < MAX_DAILY_MESSAGES) {
                const errorMessage = `❌ *ERRO SISTEMA PM* 🚨

⏰ *Horário:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
🔧 *Período:* ${periodo}
⚠️ *Erro:* ${error.message}

💡 *Verificar logs no Render para mais detalhes*

---
_Sistema PM - Alerta de Erro v2.4.1_ ⚠️`;

                await sendWhatsAppMessage(CONFIG.twilio.toNumber, errorMessage);
            }
        } catch (e) {
            console.error('❌ Erro ao enviar alerta de erro:', e);
        }
    }
}

// 🌐 ROTAS WEB
app.use(express.json());

// 🔧 NOVO: ENDPOINT ADMINISTRATIVO PARA ALTERAR HORÁRIOS
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
_Atualização via API - v2.4.1_ 🚀
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
            version: '2.4.1'
        });
        
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
            version: '2.4.1'
        });
    }
});

// 📊 NOVO: ENDPOINT PARA VER HORÁRIOS ATUAIS
app.get('/admin/current-schedules', (req, res) => {
    const scheduleInfo = getCurrentScheduleInfo();
    
    res.json({
        success: true,
        currentSchedules: scheduleInfo,
        activeCronJobs: activeCronJobs.length,
        lastUpdate: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        version: '2.4.1'
    });
});

// 🖥️ NOVO: INTERFACE WEB PARA ALTERAR HORÁRIOS
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
                    <p><strong>Senha Admin:</strong> ${CONFIG.schedules.adminPassword}</p>
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
                        <input type="password" id="password" name="password" placeholder="Digite: ${CONFIG.schedules.adminPassword}" required>
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

// Rota para keep-alive
app.get('/ping', (req, res) => {
    const scheduleInfo = getCurrentScheduleInfo();
    
    res.json({ 
        status: 'alive', 
        timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        utc: new Date().toISOString(),
        uptime: process.uptime(),
        keepAlive: CONFIG.keepAlive.enabled,
        memory: process.memoryUsage(),
        timezone: 'America/Sao_Paulo',
        renderTimezone: 'UTC',
        version: '2.4.1',
        optimization: 'Uma mensagem por horário + Controle Twilio + Horários Dinâmicos',
        dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
        twilioLimitReached: twilioLimitReached,
        schedules: {
            current: scheduleInfo,
            activeCronJobs: activeCronJobs.length
        }
    });
});

// Página principal MELHORADA VISUALMENTE - ATUALIZADA COM HORÁRIOS DINÂMICOS
app.get('/', async (req, res) => {
    const uptime = Math.floor(process.uptime());
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const scheduleInfo = getCurrentScheduleInfo();
    
    // Buscar dados do Firebase para mostrar na página
    let birthdayInfo = '';
    try {
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        
        if (tomorrowBirthdays.length > 0) {
            birthdayInfo = `
                <div class="birthday-alert">
                    <div class="alert-header">
                        <h3>🎂 ANIVERSÁRIOS AMANHÃ</h3>
                        <span class="badge">${tomorrowBirthdays.length}</span>
                    </div>
                    <div class="birthday-list">
                        ${tomorrowBirthdays.map(b => `
                            <div class="birthday-card">
                                <div class="birthday-main">
                                    <h4>🎖️ ${b.graduation || 'Sem graduação'} ${b.name || 'Sem nome'}</h4>
                                    <p class="age">🎈 Fará ${calculateAge(b.date) + 1} anos</p>
                                </div>
                                <div class="birthday-details">
                                    <span class="detail">📞 ${b.phone || 'Tel não informado'}</span>
                                    <span class="detail">🏢 ${b.unit || 'Unidade não informada'}</span>
                                    <span class="detail format-badge">${b.date.includes('/') ? 'BR' : 'US'}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            birthdayInfo = `
                <div class="no-birthday">
                    <div class="no-birthday-icon">📅</div>
                    <h3>Nenhum aniversário amanhã</h3>
                    <p>Sistema funcionando normalmente</p>
                    <div class="stats">
                        <div class="stat-item">
                            <span class="stat-number">${birthdays.length}</span>
                            <span class="stat-label">Total no banco</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-number">${birthdays.filter(b => b.date && b.date.includes('/')).length}</span>
                            <span class="stat-label">Formato BR</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-number">${birthdays.filter(b => b.date && b.date.includes('-')).length}</span>
                            <span class="stat-label">Formato US</span>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        birthdayInfo = `
            <div class="error-alert">
                <div class="error-icon">❌</div>
                <h3>Erro ao conectar Firebase</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
    
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Sistema PM 24/7 v2.4.1 - Dashboard</title>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    color: #333;
                    line-height: 1.6;
                }
                
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }
                
                .header {
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(10px);
                    border-radius: 20px;
                    padding: 30px;
                    text-align: center;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                    margin-bottom: 30px;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                
                .header h1 {
                    font-size: 2.5rem;
                    background: linear-gradient(45deg, #667eea, #764ba2);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 10px;
                }
                
                .header .subtitle {
                    font-size: 1.2rem;
                    color: #666;
                    margin-bottom: 15px;
                }
                
                .header .version {
                    display: inline-block;
                    background: linear-gradient(45deg, #28a745, #20c997);
                    color: white;
                    padding: 8px 20px;
                    border-radius: 25px;
                    font-weight: bold;
                    font-size: 0.9rem;
                }
                
                .dashboard-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 25px;
                    margin-bottom: 30px;
                }
                
                .card {
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(10px);
                    border-radius: 15px;
                    padding: 25px;
                    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                }
                
                .card:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
                }
                
                .card-header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #f0f0f0;
                }
                
                .card-icon {
                    font-size: 2rem;
                    margin-right: 15px;
                    width: 50px;
                    height: 50px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 12px;
                    background: linear-gradient(45deg, #667eea, #764ba2);
                    color: white;
                }
                
                .card-title {
                    font-size: 1.3rem;
                    font-weight: 600;
                    color: #333;
                }
                
                .status-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 0;
                    border-bottom: 1px solid #f5f5f5;
                }
                
                .status-item:last-child {
                    border-bottom: none;
                }
                
                .status-label {
                    font-weight: 500;
                    color: #666;
                }
                
                .status-value {
                    font-weight: 600;
                    color: #333;
                }
                
                .status-value.success {
                    color: #28a745;
                }
                
                .status-value.danger {
                    color: #dc3545;
                }
                
                .status-value.warning {
                    color: #ffc107;
                }
                
                .twilio-status {
                    background: ${twilioLimitReached ? 'linear-gradient(45deg, #dc3545, #c82333)' : 'linear-gradient(45deg, #28a745, #20c997)'};
                    color: white;
                    border-radius: 15px;
                    padding: 25px;
                }
                
                .twilio-status h3 {
                    margin-bottom: 20px;
                    font-size: 1.4rem;
                }
                
                .twilio-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                }
                
                .twilio-item {
                    background: rgba(255, 255, 255, 0.2);
                    padding: 15px;
                    border-radius: 10px;
                    backdrop-filter: blur(5px);
                }
                
                .twilio-item strong {
                    display: block;
                    margin-bottom: 5px;
                    font-size: 0.9rem;
                }
                
                .birthday-alert {
                    background: linear-gradient(45deg, #ffc107, #ff8c00);
                    color: white;
                    border-radius: 15px;
                    padding: 25px;
                    margin-bottom: 25px;
                }
                
                .alert-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                
                .alert-header h3 {
                    font-size: 1.5rem;
                    margin: 0;
                }
                
                .badge {
                    background: rgba(255, 255, 255, 0.3);
                    color: white;
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-weight: bold;
                    font-size: 1.1rem;
                }
                
                .birthday-list {
                    display: grid;
                    gap: 15px;
                }
                
                .birthday-card {
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 12px;
                    padding: 20px;
                    backdrop-filter: blur(5px);
                }
                
                .birthday-main h4 {
                    font-size: 1.2rem;
                    margin-bottom: 8px;
                }
                
                .birthday-main .age {
                    font-size: 1.1rem;
                    margin-bottom: 15px;
                    opacity: 0.9;
                }
                
                .birthday-details {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                
                .detail {
                    background: rgba(255, 255, 255, 0.3);
                    padding: 6px 12px;
                    border-radius: 15px;
                    font-size: 0.9rem;
                }
                
                .format-badge {
                    background: rgba(0, 0, 0, 0.2) !important;
                    font-weight: bold;
                }
                
                .no-birthday {
                    background: linear-gradient(45deg, #28a745, #20c997);
                    color: white;
                    text-align: center;
                    padding: 40px;
                    border-radius: 15px;
                    margin-bottom: 25px;
                }
                
                .no-birthday-icon {
                    font-size: 4rem;
                    margin-bottom: 20px;
                }
                
                .no-birthday h3 {
                    font-size: 1.8rem;
                    margin-bottom: 10px;
                }
                
                .no-birthday p {
                    font-size: 1.1rem;
                    margin-bottom: 25px;
                    opacity: 0.9;
                }
                
                .stats {
                    display: flex;
                    justify-content: center;
                    gap: 30px;
                    flex-wrap: wrap;
                }
                
                .stat-item {
                    text-align: center;
                }
                
                .stat-number {
                    display: block;
                    font-size: 2rem;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                
                .stat-label {
                    font-size: 0.9rem;
                    opacity: 0.8;
                }
                
                .error-alert {
                    background: linear-gradient(45deg, #dc3545, #c82333);
                    color: white;
                    text-align: center;
                    padding: 30px;
                    border-radius: 15px;
                    margin-bottom: 25px;
                }
                
                .error-icon {
                    font-size: 3rem;
                    margin-bottom: 15px;
                }
                
                .optimization-card {
                    background: linear-gradient(45deg, #17a2b8, #138496);
                    color: white;
                    border-radius: 15px;
                    padding: 25px;
                }
                
                .optimization-card h3 {
                    margin-bottom: 20px;
                    font-size: 1.4rem;
                }
                
                .optimization-list {
                    list-style: none;
                    padding: 0;
                }
                
                .optimization-list li {
                    padding: 8px 0;
                    padding-left: 25px;
                    position: relative;
                }
                
                .optimization-list li:before {
                    content: "✅";
                    position: absolute;
                    left: 0;
                    top: 8px;
                }
                
                .endpoints-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 15px;
                    margin-top: 25px;
                }
                
                .endpoint-card {
                    background: rgba(255, 255, 255, 0.95);
                    border-radius: 12px;
                    padding: 20px;
                    text-decoration: none;
                    color: #333;
                    transition: all 0.3s ease;
                    border: 2px solid transparent;
                }
                
                .endpoint-card:hover {
                    transform: translateY(-3px);
                    border-color: #667eea;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                    text-decoration: none;
                    color: #333;
                }
                
                .endpoint-icon {
                    font-size: 1.5rem;
                    margin-bottom: 10px;
                    display: block;
                }
                
                .endpoint-title {
                    font-weight: 600;
                    font-size: 1.1rem;
                    margin-bottom: 8px;
                }
                
                .endpoint-desc {
                    font-size: 0.9rem;
                    color: #666;
                    line-height: 1.4;
                }
                
                .footer {
                    background: rgba(255, 255, 255, 0.95);
                    border-radius: 15px;
                    padding: 25px;
                    text-align: center;
                    margin-top: 30px;
                    backdrop-filter: blur(10px);
                }
                
                .footer-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin-bottom: 20px;
                }
                
                .footer-item {
                    padding: 15px;
                    background: #f8f9fa;
                    border-radius: 10px;
                }
                
                .footer-item strong {
                    display: block;
                    margin-bottom: 5px;
                    color: #667eea;
                }
                
                @media (max-width: 768px) {
                    .container {
                        padding: 15px;
                    }
                    
                    .header h1 {
                        font-size: 2rem;
                    }
                    
                    .dashboard-grid {
                        grid-template-columns: 1fr;
                    }
                    
                    .stats {
                        gap: 20px;
                    }
                    
                    .twilio-grid {
                        grid-template-columns: 1fr;
                    }
                }
                
                .pulse {
                    animation: pulse 2s infinite;
                }
                
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.7; }
                    100% { opacity: 1; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1><i class="fas fa-shield-alt"></i> Sistema PM 24/7</h1>
                    <div class="subtitle">Sistema de Aniversários da Polícia Militar</div>
                    <div class="version">v2.4.1 - Horários Dinâmicos</div>
                </div>
                
                <div class="card twilio-status">
                    <h3>
                        <i class="fas fa-${twilioLimitReached ? 'exclamation-triangle' : 'check-circle'}"></i>
                        ${twilioLimitReached ? 'LIMITE TWILIO ATINGIDO' : 'TWILIO OPERACIONAL'}
                    </h3>
                    <div class="twilio-grid">
                        <div class="twilio-item">
                            <strong>Status:</strong>
                            ${twilioLimitReached ? 'BLOQUEADO até 00:00 UTC' : 'Funcionando normalmente'}
                        </div>
                        <div class="twilio-item">
                            <strong>Mensagens hoje:</strong>
                            ${dailyMessageCount}/${MAX_DAILY_MESSAGES}
                        </div>
                        <div class="twilio-item">
                            <strong>Limite interno:</strong>
                            ${MAX_DAILY_MESSAGES} mensagens/dia
                        </div>
                        <div class="twilio-item">
                            <strong>Reset automático:</strong>
                            00:00 UTC (21:00 Brasil)
                        </div>
                    </div>
                </div>
                
                ${birthdayInfo}
                
                <div class="dashboard-grid">
                    <div class="card">
                        <div class="card-header">
                            <div class="card-icon">
                                <i class="fas fa-info-circle"></i>
                            </div>
                            <div class="card-title">Status do Sistema</div>
                        </div>
                        <div class="status-item">
                            <span class="status-label"><i class="fas fa-clock"></i> Horário Brasil:</span>
                            <span class="status-value">${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label"><i class="fas fa-globe"></i> Horário UTC:</span>
                            <span class="status-value">${new Date().toISOString()}</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label"><i class="fas fa-hourglass-half"></i> Uptime:</span>
                            <span class="status-value">${hours}h ${minutes}m</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label"><i class="fas fa-database"></i> Firebase:</span>
                            <span class="status-value ${db ? 'success' : 'danger'}">${db ? 'Conectado ✅' : 'Desconectado ❌'}</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label"><i class="fab fa-whatsapp"></i> WhatsApp:</span>
                            <span class="status-value success">${CONFIG.twilio.toNumber}</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label"><i class="fas fa-sync-alt"></i> Keep-alive:</span>
                            <span class="status-value ${CONFIG.keepAlive.enabled ? 'success' : 'danger'}">${CONFIG.keepAlive.enabled ? 'Ativo ✅' : 'Desativo ❌'}</span>
                        </div>
                    </div>
                    
                    <div class="card">
                        <div class="card-header">
                            <div class="card-icon">
                                <i class="fas fa-clock"></i>
                            </div>
                            <div class="card-title">Horários de Execução (Dinâmicos)</div>
                        </div>
                        <div class="status-item">
                            <span class="status-label"><i class="fas fa-moon"></i> ${scheduleInfo.brasil.time1} Brasil:</span>
                            <span class="status-value">${scheduleInfo.utc.time1} UTC (Verificação 1)</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label"><i class="fas fa-sun"></i> ${scheduleInfo.brasil.time2} Brasil:</span>
                            <span class="status-value">${scheduleInfo.utc.time2} UTC (Verificação 2)</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label"><i class="fas fa-redo"></i> Reset diário:</span>
                            <span class="status-value">00:00 UTC = 21:00 Brasil</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label"><i class="fas fa-cogs"></i> Cron Jobs Ativos:</span>
                            <span class="status-value success">${activeCronJobs.length} ✅</span>
                        </div>
                    </div>
                </div>
                
                <div class="card optimization-card">
                    <h3><i class="fas fa-rocket"></i> Melhorias v2.4.1</h3>
                    <ul class="optimization-list">
                        <li><strong>Horários dinâmicos:</strong> Alterar via interface web ou API</li>
                        <li><strong>Suporte duplo formato:</strong> DD/MM/YYYY (BR) e YYYY-MM-DD (US)</li>
                        <li><strong>Controle rigoroso Twilio:</strong> Flag de bloqueio quando limite atingido</li>
                        <li><strong>Limite interno reduzido:</strong> 3 mensagens/dia (segurança extra)</li>
                        <li><strong>Economia máxima:</strong> 1 mensagem por horário (independente da quantidade)</li>
                        <li><strong>Reset automático:</strong> Contador e flags zerados às 00:00 UTC</li>
                        <li><strong>Detecção inteligente:</strong> Reconhece automaticamente formato da data</li>
                        <li><strong>Sem testes desnecessários:</strong> Só envia se houver aniversários</li>
                    </ul>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <div class="card-icon">
                            <i class="fas fa-cogs"></i>
                        </div>
                        <div class="card-title">Como Funciona a Otimização</div>
                    </div>
                    <div class="status-item">
                        <span class="status-label"><i class="fas fa-users"></i> Múltiplos aniversários:</span>
                        <span class="status-value">1 mensagem única com todos os nomes</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label"><i class="fas fa-piggy-bank"></i> Economia exemplo:</span>
                        <span class="status-value">5 aniversários = 1 mensagem (4 poupadas)</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label"><i class="fas fa-birthday-cake"></i> Formato da mensagem:</span>
                        <span class="status-value">Graduação + Nome + Idade + Telefone + Unidade</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label"><i class="fas fa-clock"></i> Dois horários:</span>
                        <span class="status-value">${scheduleInfo.brasil.time1} e ${scheduleInfo.brasil.time2} (máximo 2 mensagens/dia)</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label"><i class="fas fa-ban"></i> Sem aniversários:</span>
                        <span class="status-value">Nenhuma mensagem enviada (economia total)</span>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <div class="card-icon">
                            <i class="fas fa-link"></i>
                        </div>
                        <div class="card-title">Endpoints Disponíveis</div>
                    </div>
                    <div class="endpoints-grid">
                        <a href="/admin" class="endpoint-card">
                            <div class="endpoint-icon">🔧</div>
                            <div class="endpoint-title">/admin</div>
                            <div class="endpoint-desc">Interface para alterar horários dinamicamente</div>
                        </a>
                        <a href="/test" class="endpoint-card">
                            <div class="endpoint-icon">🧪</div>
                            <div class="endpoint-title">/test</div>
                            <div class="endpoint-desc">Teste geral com dados reais do Firebase</div>
                        </a>
                        <a href="/birthdays" class="endpoint-card">
                            <div class="endpoint-icon">📋</div>
                            <div class="endpoint-title">/birthdays</div>
                            <div class="endpoint-desc">Ver todos os aniversários cadastrados</div>
                        </a>
                        <a href="/check" class="endpoint-card">
                            <div class="endpoint-icon">🔍</div>
                            <div class="endpoint-title">/check</div>
                            <div class="endpoint-desc">Verificação manual do sistema</div>
                        </a>
                        <a href="/status" class="endpoint-card">
                            <div class="endpoint-icon">📊</div>
                            <div class="endpoint-title">/status</div>
                            <div class="endpoint-desc">Status JSON completo do sistema</div>
                        </a>
                        <a href="/ping" class="endpoint-card">
                            <div class="endpoint-icon">🔄</div>
                            <div class="endpoint-title">/ping</div>
                            <div class="endpoint-desc">Keep-alive + informações do sistema</div>
                        </a>
                        <a href="/debug" class="endpoint-card">
                            <div class="endpoint-icon">🔍</div>
                            <div class="endpoint-title">/debug</div>
                            <div class="endpoint-desc">Debug completo Firebase + formatos</div>
                        </a>
                        <a href="/admin/current-schedules" class="endpoint-card">
                            <div class="endpoint-icon">⏰</div>
                            <div class="endpoint-title">/admin/current-schedules</div>
                            <div class="endpoint-desc">Ver horários atuais em JSON</div>
                        </a>
                    </div>
                </div>
                
                <div class="footer">
                    <div class="footer-grid">
                        <div class="footer-item">
                            <strong>Sistema integrado:</strong>
                            Firebase + Twilio + Render FREE funcionando 24/7
                        </div>
                        <div class="footer-item">
                            <strong>Versão:</strong>
                            2.4.1 - Horários Dinâmicos
                        </div>
                        <div class="footer-item">
                            <strong>Economia:</strong>
                            Máxima eficiência + Controle rigoroso de limite
                        </div>
                        <div class="footer-item">
                            <strong>Horários atuais:</strong>
                            ${scheduleInfo.brasil.time1}h e ${scheduleInfo.brasil.time2}h Brasil
                        </div>
                    </div>
                    <p style="margin-top: 20px; color: #666; font-size: 0.9rem;">
                        <i class="fas fa-shield-alt"></i> Sistema PM v2.4.1 - Dashboard com Horários Dinâmicos
                    </p>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Resto do código permanece exatamente igual...
// [Continua com todas as outras rotas e funções sem alteração]

// Endpoint para teste geral OTIMIZADO
app.get('/test', async (req, res) => {
    try {
        // ✅ VERIFICAR LIMITE TWILIO ANTES DO TESTE
        if (twilioLimitReached) {
            return res.status(429).json({
                success: false,
                error: 'Limite Twilio atingido - Teste bloqueado até reset (00:00 UTC)',
                twilioStatus: 'BLOCKED',
                resetTime: '00:00 UTC (21:00 Brasil)',
                dailyCount: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
                version: '2.4.1'
            });
        }

        // Buscar dados do Firebase para incluir no teste
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        const scheduleInfo = getCurrentScheduleInfo();
        
        // Contar formatos de data
        const brFormats = birthdays.filter(b => b.date && b.date.includes('/')).length;
        const usFormats = birthdays.filter(b => b.date && b.date.includes('-')).length;
        
        let testMessage;
        
        if (tomorrowBirthdays.length > 0) {
            // Se há aniversários amanhã, mostrar o formato real
            testMessage = createCombinedBirthdayMessage(tomorrowBirthdays, 'TESTE');
        } else {
            // Se não há aniversários, mostrar teste de funcionamento
            testMessage = `🧪 *TESTE SISTEMA PM v2.4.1* 🎖️

⏰ *Horário Brasil:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
🕐 *UTC (Render):* ${new Date().toISOString()}
🆓 *Plataforma:* Render FREE
🔥 *Firebase:* ${db ? 'Conectado ✅' : 'Desconectado ❌'}
📱 *WhatsApp:* Conectado via Twilio

📊 *Dados Atuais:*
• 📋 Total no banco: ${birthdays.length} aniversários
• 🎂 Amanhã (${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}): ${tomorrowBirthdays.length} aniversário(s)
• 📅 Formato BR (DD/MM/YYYY): ${brFormats}
• 📅 Formato US (YYYY-MM-DD): ${usFormats}

⏰ *Execuções Automáticas (DINÂMICAS):*
• 🌙 ${scheduleInfo.brasil.time1} Brasil (${scheduleInfo.utc.time1} UTC) - Verificação 1
• 🌅 ${scheduleInfo.brasil.time2} Brasil (${scheduleInfo.utc.time2} UTC) - Verificação 2

💰 *OTIMIZAÇÃO v2.4.1:*
• ✅ Horários dinâmicos configuráveis
• ✅ Suporte duplo formato de data
• ✅ 1 mensagem por horário (economia máxima)
• ✅ Controle rigoroso limite Twilio
• ✅ Bloqueio automático se limite atingido

📊 *Status Twilio:*
• Mensagens hoje: ${dailyMessageCount}/${MAX_DAILY_MESSAGES}
• Status: ${twilioLimitReached ? 'BLOQUEADO' : 'OPERACIONAL'}
• Reset: 00:00 UTC (21:00 Brasil)

🔧 *Controle Administrativo:*
• Interface: /admin
• Senha: ${CONFIG.schedules.adminPassword}

✅ *Sistema PM v2.4.1 funcionando perfeitamente!*

---
_Teste manual com dados reais e horários dinâmicos_ 🚀`;
        }

        const result = await sendWhatsAppMessage(CONFIG.twilio.toNumber, testMessage);
        res.json({ 
            success: true, 
            message: 'Teste enviado com formato otimizado v2.4.1!', 
            sid: result.sid,
            firebase: {
                connected: db !== null,
                totalBirthdays: birthdays.length,
                tomorrowBirthdays: tomorrowBirthdays.length,
                formatsBR: brFormats,
                formatsUS: usFormats
            },
            optimization: {
                messagesWouldSend: tomorrowBirthdays.length || 1,
                messagesActuallySent: 1,
                messagesSaved: Math.max(0, tomorrowBirthdays.length - 1)
            },
            schedules: scheduleInfo,
            twilio: {
                dailyCount: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
                limitReached: twilioLimitReached,
                status: twilioLimitReached ? 'BLOCKED' : 'OPERATIONAL'
            },
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            version: '2.4.1 - Horários Dinâmicos'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            twilioLimitReached: twilioLimitReached,
            dailyCount: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
            version: '2.4.1'
        });
    }
});

// Teste específico para horário dinâmico 1
app.get('/test-time1', async (req, res) => {
    try {
        if (twilioLimitReached) {
            return res.status(429).json({
                success: false,
                error: 'Limite Twilio atingido - Teste horário 1 bloqueado',
                twilioStatus: 'BLOCKED',
                resetTime: '00:00 UTC (21:00 Brasil)',
                version: '2.4.1'
            });
        }

        console.log(`🧪 TESTE MANUAL HORÁRIO 1 (${CONFIG.schedules.time1}) INICIADO...`);
        await executeAutomaticCheck(CONFIG.schedules.time1);
        
        const scheduleInfo = getCurrentScheduleInfo();
        
        res.json({ 
            success: true, 
            message: `Teste ${CONFIG.schedules.time1} Brasil (${scheduleInfo.utc.time1} UTC) executado com controle Twilio!`,
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            utc: new Date().toISOString(),
            timezone: 'America/Sao_Paulo → UTC',
            renderTime: `${scheduleInfo.utc.time1} UTC`,
            schedules: scheduleInfo,
            twilio: {
                dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
                limitReached: twilioLimitReached,
                status: twilioLimitReached ? 'BLOCKED' : 'OPERATIONAL'
            },
            version: '2.4.1'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            twilioLimitReached: twilioLimitReached,
            dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
            version: '2.4.1'
        });
    }
});

// Teste específico para horário dinâmico 2
app.get('/test-time2', async (req, res) => {
    try {
        if (twilioLimitReached) {
            return res.status(429).json({
                success: false,
                error: 'Limite Twilio atingido - Teste horário 2 bloqueado',
                twilioStatus: 'BLOCKED',
                resetTime: '00:00 UTC (21:00 Brasil)',
                version: '2.4.1'
            });
        }

        console.log(`🧪 TESTE MANUAL HORÁRIO 2 (${CONFIG.schedules.time2}) INICIADO...`);
        await executeAutomaticCheck(CONFIG.schedules.time2);
        
        const scheduleInfo = getCurrentScheduleInfo();
        
        res.json({ 
            success: true, 
            message: `Teste ${CONFIG.schedules.time2} Brasil (${scheduleInfo.utc.time2} UTC) executado com controle Twilio!`,
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            utc: new Date().toISOString(),
            timezone: 'America/Sao_Paulo → UTC',
            renderTime: `${scheduleInfo.utc.time2} UTC`,
            schedules: scheduleInfo,
            twilio: {
                dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
                limitReached: twilioLimitReached,
                status: twilioLimitReached ? 'BLOCKED' : 'OPERATIONAL'
            },
            version: '2.4.1'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            twilioLimitReached: twilioLimitReached,
            dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
            version: '2.4.1'
        });
    }
});

// Endpoint para verificar aniversários manualmente
app.get('/check', async (req, res) => {
    try {
        if (twilioLimitReached) {
            return res.status(429).json({
                success: false,
                error: 'Limite Twilio atingido - Verificação manual bloqueada',
                twilioStatus: 'BLOCKED',
                resetTime: '00:00 UTC (21:00 Brasil)',
                version: '2.4.1'
            });
        }

        console.log('🔍 VERIFICAÇÃO MANUAL INICIADA...');
        await executeAutomaticCheck('manual');
        res.json({ 
            success: true, 
            message: 'Verificação manual executada com formato otimizado v2.4.1!',
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            utc: new Date().toISOString(),
            schedules: getCurrentScheduleInfo(),
            twilio: {
                dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
                limitReached: twilioLimitReached,
                status: twilioLimitReached ? 'BLOCKED' : 'OPERATIONAL'
            },
            version: '2.4.1'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            twilioLimitReached: twilioLimitReached,
            dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
            version: '2.4.1'
        });
    }
});

// Endpoint para listar todos os aniversários
app.get('/birthdays', async (req, res) => {
    try {
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        const scheduleInfo = getCurrentScheduleInfo();
        
        // Contar formatos
        const brFormats = birthdays.filter(b => b.date && b.date.includes('/')).length;
        const usFormats = birthdays.filter(b => b.date && b.date.includes('-')).length;
        const invalidFormats = birthdays.filter(b => !b.date || (!b.date.includes('/') && !b.date.includes('-'))).length;
        
        res.json({
            success: true,
            total: birthdays.length,
            tomorrowCount: tomorrowBirthdays.length,
            formats: {
                brazilian: brFormats,
                american: usFormats,
                invalid: invalidFormats
            },
            schedules: scheduleInfo,
            tomorrow: tomorrowBirthdays.map(b => ({
                name: b.name || 'Sem nome',
                graduation: b.graduation || 'Sem graduação',
                date: b.date || 'Data não informada',
                dateFormat: b.date ? (b.date.includes('/') ? 'BR (DD/MM/YYYY)' : 'US (YYYY-MM-DD)') : 'Invalid',
                age: calculateAge(b.date) + 1,
                phone: b.phone || 'Tel não informado',
                relationship: b.relationship || 'Relacionamento não informado',
                unit: b.unit || 'Unidade não informada'
            })),
            allBirthdays: birthdays.map(b => ({
                name: b.name || 'Sem nome',
                graduation: b.graduation || 'Sem graduação',
                date: b.date || 'Data não informada',
                dateFormat: b.date ? (b.date.includes('/') ? 'BR (DD/MM/YYYY)' : b.date.includes('-') ? 'US (YYYY-MM-DD)' : 'Invalid') : 'Invalid',
                currentAge: calculateAge(b.date),
                phone: b.phone || 'Tel não informado',
                relationship: b.relationship || 'Relacionamento não informado',
                unit: b.unit || 'Unidade não informada'
            })),
            optimization: {
                messagesPerExecution: 1,
                maxDailyMessages: MAX_DAILY_MESSAGES,
                currentDailyCount: dailyMessageCount,
                twilioLimitReached: twilioLimitReached
            },
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            checkingFor: new Date(Date.now() + 86400000).toLocaleDateString('pt-BR'),
            version: '2.4.1'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            version: '2.4.1'
        });
    }
});

// Rota de debug ATUALIZADA - Ver todos os dados com detecção de formato
app.get('/debug', async (req, res) => {
    try {
        const birthdays = await getBirthdaysFromFirebase();
        const scheduleInfo = getCurrentScheduleInfo();
        
        res.json({
            system: {
                version: '2.4.1',
                optimization: 'Uma mensagem por horário + Controle Twilio + Horários Dinâmicos',
                dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
                twilioLimitReached: twilioLimitReached,
                resetTime: '00:00 UTC (21:00 Brasil)',
                schedules: scheduleInfo,
                activeCronJobs: activeCronJobs.length
            },
            firebase: {
                connected: db !== null,
                totalRegistros: birthdays.length
            },
            formatAnalysis: {
                brazilian: birthdays.filter(b => b.date && b.date.includes('/')).length,
                american: birthdays.filter(b => b.date && b.date.includes('-')).length,
                invalid: birthdays.filter(b => !b.date || (!b.date.includes('/') && !b.date.includes('-'))).length
            },
            registros: birthdays.map((b, index) => ({
                indice: index + 1,
                nome: b.name || 'VAZIO',
                graduacao: b.graduation || 'VAZIO',
                data: b.date || 'VAZIO',
                formato_detectado: b.date ? (b.date.includes('/') ? 'BR (DD/MM/YYYY)' : b.date.includes('-') ? 'US (YYYY-MM-DD)' : 'INVÁLIDO') : 'VAZIO',
                telefone: b.phone || 'VAZIO',
                relacionamento: b.relationship || 'VAZIO',
                unidade: b.unit || 'VAZIO',
                data_valida: b.date && (b.date.includes('/') || b.date.includes('-')),
                partes_data: b.date ? b.date.split(b.date.includes('/') ? '/' : '-') : [],
                idade_atual: calculateAge(b.date),
                processamento_ok: true
            })),
            tomorrowCheck: {
                date: new Date(Date.now() + 86400000).toLocaleDateString('pt-BR'),
                birthdays: checkTomorrowBirthdays(birthdays).map(b => ({
                    name: b.name,
                    date: b.date,
                    format: b.date.includes('/') ? 'BR' : 'US',
                    age: calculateAge(b.date) + 1
                }))
            },
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        });
    } catch (error) {
        res.status(500).json({
            erro: error.message,
            version: '2.4.1',
            twilioLimitReached: twilioLimitReached
        });
    }
});

// Status completo do sistema ATUALIZADO v2.4.1
app.get('/status', async (req, res) => {
    try {
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        const scheduleInfo = getCurrentScheduleInfo();
        const uptime = process.uptime();
        const memory = process.memoryUsage();
        
        // Análise de formatos
        const brFormats = birthdays.filter(b => b.date && b.date.includes('/')).length;
        const usFormats = birthdays.filter(b => b.date && b.date.includes('-')).length;
        const invalidFormats = birthdays.filter(b => !b.date || (!b.date.includes('/') && !b.date.includes('-'))).length;
        
        res.json({
            system: {
                status: 'online',
                version: '2.4.1',
                optimization: 'Uma mensagem por horário + Controle Twilio + Horários Dinâmicos',
                platform: 'Render FREE',
                uptime: {
                    seconds: Math.floor(uptime),
                    formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
                },
                memory: {
                    used: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
                    total: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
                    external: `${Math.round(memory.external / 1024 / 1024)}MB`
                }
            },
            timezone: {
                brasil: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
                utc: new Date().toISOString(),
                renderTimezone: 'UTC',
                conversion: {
                    [`${scheduleInfo.brasil.time1}_Brasil`]: `${scheduleInfo.utc.time1}_UTC`,
                    [`${scheduleInfo.brasil.time2}_Brasil`]: `${scheduleInfo.utc.time2}_UTC`
                }
            },
            firebase: {
                connected: db !== null,
                totalBirthdays: birthdays.length,
                tomorrowBirthdays: tomorrowBirthdays.length,
                dateFormats: {
                    brazilian: brFormats,
                    american: usFormats,
                    invalid: invalidFormats,
                    supportedFormats: ['DD/MM/YYYY', 'YYYY-MM-DD']
                }
            },
            twilio: {
                configured: !!CONFIG.twilio.accountSid,
                fromNumber: CONFIG.twilio.fromNumber,
                toNumber: CONFIG.twilio.toNumber,
                dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
                limitReached: twilioLimitReached,
                status: twilioLimitReached ? 'BLOCKED' : 'OPERATIONAL',
                resetTime: '00:00 UTC (21:00 Brasil)',
                optimization: 'Controle rigoroso ativo'
            },
            schedules: {
                dynamic: true,
                current: scheduleInfo,
                activeCronJobs: activeCronJobs.length,
                adminPassword: CONFIG.schedules.adminPassword,
                adminInterface: '/admin',
                adminAPI: '/admin/update-schedules'
            },
            cronJobs: {
                [`${scheduleInfo.utc.time1}_UTC`]: `${scheduleInfo.brasil.time1} Brasil - Verificação 1`,
                [`${scheduleInfo.utc.time2}_UTC`]: `${scheduleInfo.brasil.time2} Brasil - Verificação 2`,
                '00:00_UTC': 'Reset contador diário + flag Twilio'
            },
            keepAlive: {
                enabled: CONFIG.keepAlive.enabled,
                interval: `${CONFIG.keepAlive.interval / 1000 / 60} minutos`
            },
            nextCheck: {
                date: new Date(Date.now() + 86400000).toLocaleDateString('pt-BR'),
                birthdays: tomorrowBirthdays.map(b => `${b.graduation || 'Sem graduação'} ${b.name || 'Sem nome'} (${b.date.includes('/') ? 'BR' : 'US'} format)`)
            },
            optimization: {
                messagesPerExecution: 1,
                maxSavingsPerExecution: 'Ilimitado',
                economyActive: true,
                dualFormatSupport: true,
                twilioControlActive: true,
                dynamicSchedules: true
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            timestamp: new Date().toISOString(),
            version: '2.4.1',
            twilioLimitReached: twilioLimitReached
        });
    }
});

// Endpoint para receber webhooks do Twilio (opcional)
app.post('/webhook', (req, res) => {
    console.log('📨 Webhook recebido:', req.body);
    res.status(200).send('OK');
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
    const scheduleInfo = getCurrentScheduleInfo();
    
    res.status(404).json({
        error: 'Endpoint não encontrado',
        availableEndpoints: [
            'GET /',
            'GET /admin',
            'GET /test',
            'GET /test-time1',
            'GET /test-time2',
            'GET /check',
            'GET /birthdays',
            'GET /status',
            'GET /ping',
            'GET /debug',
            'GET /admin/current-schedules',
            'POST /admin/update-schedules',
            'POST /webhook'
        ],
        version: '2.4.1',
        optimization: 'Uma mensagem por horário + Controle Twilio + Horários Dinâmicos',
        schedules: scheduleInfo,
        twilioStatus: twilioLimitReached ? 'BLOCKED' : 'OPERATIONAL',
        timestamp: new Date().toISOString()
    });
});

// 🚀 INICIALIZAR SERVIDOR
async function startServer() {
    try {
        console.log('🎖️ === INICIANDO SISTEMA PM 24/7 v2.4.1 HORÁRIOS DINÂMICOS ===');
        console.log(`💰 OTIMIZAÇÃO: Uma mensagem por horário + Controle Twilio + Horários Dinâmicos`);
        console.log(`📅 FORMATOS: DD/MM/YYYY (Brasil) + YYYY-MM-DD (Americano)`);
        console.log(`🌍 Timezone: America/Sao_Paulo (Brasil)`);
        console.log(`🖥️ Platform: Render FREE (UTC)`);
        console.log(`📅 Data/Hora Brasil: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
        console.log(`🕐 Data/Hora UTC: ${new Date().toISOString()}`);
        
        // Inicializar Firebase
        console.log('🔥 Conectando ao Firebase...');
        const firebaseConnected = await initializeFirebase();
        
        if (!firebaseConnected) {
            console.log('⚠️ Firebase não conectado, mas servidor continuará funcionando');
        }
        
        // Configurar cron jobs dinâmicos
        const scheduleInfo = setupDynamicCronJobs();
        
        // Iniciar keep-alive
        startKeepAlive();
        
        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`\n🚀 === SERVIDOR ONLINE v2.4.1 ===`);
            console.log(`🌐 URL: https://seu-app.onrender.com`);
            console.log(`🔌 Porta: ${PORT}`);
            console.log(`🔥 Firebase: ${firebaseConnected ? 'Conectado ✅' : 'Desconectado ❌'}`);
            console.log(`📱 WhatsApp: ${CONFIG.twilio.toNumber}`);
            console.log(`💰 Otimização: 1 mensagem por horário ✅`);
            console.log(`📊 Limite diário: ${MAX_DAILY_MESSAGES} mensagens`);
            console.log(`🚫 Controle Twilio: ${twilioLimitReached ? 'BLOQUEADO' : 'ATIVO'} ✅`);
            console.log(`📅 Formatos suportados: DD/MM/YYYY + YYYY-MM-DD ✅`);
            console.log(`\n⏰ HORÁRIOS DINÂMICOS ATIVOS:`);
            console.log(`   🌙 ${scheduleInfo.brasil.time1} Brasil = ${scheduleInfo.utc.time1} UTC`);
            console.log(`   🌅 ${scheduleInfo.brasil.time2} Brasil = ${scheduleInfo.utc.time2} UTC`);
            console.log(`   🔄 00:00 UTC = Reset contador + flag Twilio`);
            console.log(`\n🔧 CONTROLES ADMINISTRATIVOS:`);
            console.log(`   📱 Interface: /admin`);
            console.log(`   🔧 API: POST /admin/update-schedules`);
            console.log(`   📊 Status: GET /admin/current-schedules`);
            console.log(`   🔑 Senha atual: ${CONFIG.schedules.adminPassword}`);
            console.log(`   🎯 Cron Jobs Ativos: ${activeCronJobs.length}`);
            console.log(`\n✅ Sistema com horários dinâmicos funcionando!`);
            console.log(`🎖️ Sistema PM v2.4.1 pronto para funcionar 24/7!`);
            console.log(`📋 Próxima verificação: ${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}`);
            console.log(`💡 DUAL FORMAT: Reconhece automaticamente formato da data`);
            console.log(`🛡️ CONTROLE TWILIO: Bloqueio automático se limite atingido`);
            console.log(`🕘 HORÁRIOS DINÂMICOS: Altere via /admin quando necessário`);
            console.log(`\n=== SISTEMA OPERACIONAL v2.4.1 ===\n`);
        });
        
        // Teste inicial (opcional)
        setTimeout(async () => {
            try {
                console.log('🧪 Executando teste inicial...');
                const birthdays = await getBirthdaysFromFirebase();
                const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
                
                console.log(`✅ Teste inicial concluído com sucesso!`);
                console.log(`📊 Total de aniversários AMANHÃ: ${tomorrowBirthdays.length}`);
                
                // Contar formatos detectados
                const brFormats = birthdays.filter(b => b.date && b.date.includes('/')).length;
                const usFormats = birthdays.filter(b => b.date && b.date.includes('-')).length;
                
                console.log(`📅 Formatos detectados: ${brFormats} BR (DD/MM/YYYY) + ${usFormats} US (YYYY-MM-DD)`);
                console.log(`⏰ Horários atuais: ${scheduleInfo.brasil.time1} e ${scheduleInfo.brasil.time2} Brasil`);
                
                if (tomorrowBirthdays.length > 0) {
                    console.log(`🎂 Aniversariantes de amanhã:`);
                    tomorrowBirthdays.forEach((b, i) => {
                        console.log(`   ${i + 1}. ${b.graduation || 'Sem graduação'} ${b.name || 'Sem nome'} - ${b.date} (${b.date.includes('/') ? 'BR' : 'US'} format)`);
                    });
                }
                
            } catch (error) {
                console.error('❌ Erro no teste inicial:', error.message);
            }
        }, 3000);
        
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
    console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rejeitada:', reason);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🔄 Recebido SIGTERM, encerrando servidor...');
    clearExistingCronJobs();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🔄 Recebido SIGINT, encerrando servidor...');
    clearExistingCronJobs();
    process.exit(0);
});

// 🚀 INICIAR O SISTEMA
startServer();

// Exportar para testes (opcional)
module.exports = app;
