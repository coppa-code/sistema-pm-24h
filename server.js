// server.js - Sistema PM OTIMIZADO - SUPORTE DUPLO FORMATO + LIMITE TWILIO - v2.4.0
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
        sendTime: process.env.NOTIFICATION_TIME || '10:50-10:55'
    },
    keepAlive: {
        enabled: process.env.KEEP_ALIVE_ENABLED !== 'false',
        interval: 10 * 60 * 1000 // 10 minutos
    }
};

// 🛡️ CONTROLE DE LIMITE DIÁRIO E TWILIO
let dailyMessageCount = 0;
const MAX_DAILY_MESSAGES = 3; // ⚠️ REDUZIDO PARA EVITAR LIMITE TWILIO
let twilioLimitReached = false;

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

// 💬 FUNÇÃO CRIAR MENSAGEM ÚNICA OTIMIZADA
function createCombinedBirthdayMessage(birthdays, periodo = 'padrão') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const periodoEmoji = periodo === '10:50' ? '🌙' : 
                        periodo === '10:55' ? '🌅' : '🎂';
    
    const periodoTexto = periodo === '10:50' ? '(Lembrete 10:50h)' : 
                        periodo === '10:55' ? '(Lembrete 10:55h)' : 
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
_Sistema PM - Alerta de Erro v2.4.0_ ⚠️`;

                await sendWhatsAppMessage(CONFIG.twilio.toNumber, errorMessage);
            }
        } catch (e) {
            console.error('❌ Erro ao enviar alerta de erro:', e);
        }
    }
}

// 🕘 CONFIGURAR CRON JOBS (10:50 e 10:55 Brasil no Render UTC)
console.log('⏰ Configurando cron jobs para 10:50 e 10:55 Brasil...');

// 10:50 Brasil = 12:20 UTC - Verificação 1
cron.schedule('50 13 * * *', () => {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🌙 EXECUÇÃO 10:50 BRASIL (12:20 UTC) - ${brasilTime}`);
    executeAutomaticCheck('10:50');
}, {
    timezone: "UTC"
});

// 10:55 Brasil = 12:25 UTC - Verificação 2
cron.schedule('55 13 * * *', () => {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🌅 EXECUÇÃO 10:55 BRASIL (12:25 UTC) - ${brasilTime}`);
    executeAutomaticCheck('10:55');
}, {
    timezone: "UTC"
});

// Reset contador diário e flag Twilio às 00:00 UTC
cron.schedule('0 0 * * *', () => {
    dailyMessageCount = 0;
    twilioLimitReached = false; // ✅ RESETAR FLAG TWILIO
    console.log('🔄 Contador de mensagens e flag Twilio resetados para novo dia');
}, {
    timezone: "UTC"
});

console.log(`⏰ Cron jobs configurados para Render (UTC):`);
console.log(`   🌙 12:20 UTC = 10:50 Brasil (Verificação 1)`);
console.log(`   🌅 12:25 UTC = 10:55 Brasil (Verificação 2)`);
console.log(`   🔄 00:00 UTC = Reset contador diário + flag Twilio`);

// 🌐 ROTAS WEB
app.use(express.json());

// Rota para keep-alive
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'alive', 
        timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        utc: new Date().toISOString(),
        uptime: process.uptime(),
        keepAlive: CONFIG.keepAlive.enabled,
        memory: process.memoryUsage(),
        timezone: 'America/Sao_Paulo',
        renderTimezone: 'UTC',
        version: '2.4.0',
        optimization: 'Uma mensagem por horário + Controle Twilio',
        dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
        twilioLimitReached: twilioLimitReached
    });
});

// Página principal ATUALIZADA
app.get('/', async (req, res) => {
    const uptime = Math.floor(process.uptime());
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    // Buscar dados do Firebase para mostrar na página
    let birthdayInfo = '';
    try {
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        
        if (tomorrowBirthdays.length > 0) {
            birthdayInfo = `
                <div style="background: #fff3cd; border: 2px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px;">
                    <h3>🎂 ANIVERSÁRIOS AMANHÃ (${tomorrowBirthdays.length})</h3>
                    ${tomorrowBirthdays.map(b => `
                        <p>🎖️ <strong>${b.graduation || 'Sem graduação'} ${b.name || 'Sem nome'}</strong> - ${calculateAge(b.date) + 1} anos</p>
                        <p style="margin-left: 20px; color: #666;">📞 ${b.phone || 'Tel não informado'} | 🏢 ${b.unit || 'Unidade não informada'}</p>
                        <p style="margin-left: 20px; color: #888; font-size: 12px;">📅 Data: ${b.date} (${b.date.includes('/') ? 'Formato BR' : 'Formato US'})</p>
                    `).join('')}
                </div>
            `;
        } else {
            birthdayInfo = `
                <div style="background: #d4edda; padding: 15px; margin: 20px 0; border-radius: 5px;">
                    <p>📅 <strong>Nenhum aniversário amanhã</strong> - Sistema funcionando normalmente</p>
                    <p>📋 Total no banco: ${birthdays.length} aniversários</p>
                    <p>📊 Formatos detectados: ${birthdays.filter(b => b.date && b.date.includes('/')).length} BR (DD/MM/YYYY) | ${birthdays.filter(b => b.date && b.date.includes('-')).length} US (YYYY-MM-DD)</p>
                </div>
            `;
        }
    } catch (error) {
        birthdayInfo = `
            <div style="background: #f8d7da; padding: 15px; margin: 20px 0; border-radius: 5px;">
                <p>❌ <strong>Erro ao conectar Firebase:</strong> ${error.message}</p>
            </div>
        `;
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Sistema PM 24/7 v2.4.0 - DUAL FORMAT + TWILIO CONTROL</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; max-width: 900px; margin: 50px auto; padding: 20px; }
                .header { text-align: center; background: #007bff; color: white; padding: 20px; border-radius: 10px; }
                .status { background: #d4edda; padding: 15px; margin: 20px 0; border-radius: 5px; }
                .endpoint { background: #f8f9fa; padding: 10px; margin: 10px 0; border-radius: 5px; }
                a { color: #007bff; text-decoration: none; }
                a:hover { text-decoration: underline; }
                .executions { background: #e7f3ff; padding: 15px; margin: 15px 0; border-radius: 5px; }
                .timezone { background: #fff3cd; padding: 10px; margin: 10px 0; border-radius: 5px; }
                .optimization { background: #d1ecf1; padding: 15px; margin: 15px 0; border-radius: 5px; border: 2px solid #bee5eb; }
                .twilio-alert { background: ${twilioLimitReached ? '#f8d7da' : '#d4edda'}; padding: 15px; margin: 15px 0; border-radius: 5px; border: 2px solid ${twilioLimitReached ? '#dc3545' : '#28a745'}; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🎖️ Sistema PM 24/7 v2.4.0 - DUAL FORMAT!</h1>
                <p>Sistema de Aniversários da Polícia Militar</p>
                <p><strong>💰 UMA MENSAGEM POR HORÁRIO + CONTROLE TWILIO</strong></p>
            </div>
            
            <div class="twilio-alert">
                <h3>${twilioLimitReached ? '🚫 LIMITE TWILIO ATINGIDO' : '✅ TWILIO FUNCIONANDO'}:</h3>
                <ul>
                    <li><strong>Status:</strong> ${twilioLimitReached ? 'BLOQUEADO até 00:00 UTC' : 'Operacional'}</li>
                    <li><strong>Mensagens hoje:</strong> ${dailyMessageCount}/${MAX_DAILY_MESSAGES}</li>
                    <li><strong>Limite interno:</strong> ${MAX_DAILY_MESSAGES} mensagens/dia</li>
                    <li><strong>Reset automático:</strong> 00:00 UTC (21:00 Brasil)</li>
                </ul>
            </div>
            
            <div class="optimization">
                <h3>🔄 MELHORIAS v2.4.0:</h3>
                <ul>
                    <li>✅ <strong>Suporte duplo formato:</strong> DD/MM/YYYY (BR) e YYYY-MM-DD (US)</li>
                    <li>✅ <strong>Controle rigoroso Twilio:
                                        <li>✅ <strong>Controle rigoroso Twilio:</strong> Flag de bloqueio quando limite atingido</li>
                    <li>✅ <strong>Limite interno reduzido:</strong> 3 mensagens/dia (segurança extra)</li>
                    <li>✅ <strong>Economia máxima:</strong> 1 mensagem por horário (independente da quantidade)</li>
                    <li>✅ <strong>Reset automático:</strong> Contador e flags zerados às 00:00 UTC</li>
                    <li>✅ <strong>Detecção inteligente:</strong> Reconhece automaticamente formato da data</li>
                    <li>✅ <strong>Sem testes desnecessários:</strong> Só envia se houver aniversários</li>
                </ul>
            </div>
            
            <div class="status">
                <h3>📊 STATUS ATUAL:</h3>
                <ul>
                    <li><strong>🕐 Horário Brasil:</strong> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</li>
                    <li><strong>🌍 Horário UTC:</strong> ${new Date().toISOString()}</li>
                    <li><strong>⏱️ Uptime:</strong> ${hours}h ${minutes}m</li>
                    <li><strong>🔥 Firebase:</strong> ${db ? 'Conectado ✅' : 'Desconectado ❌'}</li>
                    <li><strong>📱 WhatsApp:</strong> ${CONFIG.twilio.toNumber}</li>
                    <li><strong>🔄 Keep-alive:</strong> ${CONFIG.keepAlive.enabled ? 'Ativo ✅' : 'Desativo ❌'}</li>
                </ul>
            </div>
            
            ${birthdayInfo}
            
            <div class="timezone">
                <h3>⏰ HORÁRIOS DE EXECUÇÃO:</h3>
                <ul>
                    <li><strong>🌙 10:50 Brasil</strong> = 12:20 UTC (Verificação 1)</li>
                    <li><strong>🌅 10:55 Brasil</strong> = 12:25 UTC (Verificação 2)</li>
                    <li><strong>🔄 Reset diário</strong> = 00:00 UTC = 21:00 Brasil</li>
                </ul>
            </div>
            
            <div class="executions">
                <h3>🎯 COMO FUNCIONA A OTIMIZAÇÃO:</h3>
                <ul>
                    <li><strong>📊 Múltiplos aniversários:</strong> 1 mensagem única com todos os nomes</li>
                    <li><strong>💰 Economia exemplo:</strong> 5 aniversários = 1 mensagem (4 poupadas)</li>
                    <li><strong>🎂 Formato da mensagem:</strong> Graduação + Nome + Idade + Telefone + Unidade</li>
                    <li><strong>⏰ Dois horários:</strong> 10:50 e 10:55 (máximo 2 mensagens/dia)</li>
                    <li><strong>🚫 Sem aniversários:</strong> Nenhuma mensagem enviada (economia total)</li>
                </ul>
            </div>
            
            <h3>🔗 ENDPOINTS DISPONÍVEIS:</h3>
            <div class="endpoint"><a href="/test">🧪 /test</a> - Teste geral com dados reais</div>
            <div class="endpoint"><a href="/test-0920">🌙 /test-0920</a> - Testar execução 10:50</div>
            <div class="endpoint"><a href="/test-0925">🌅 /test-0925</a> - Testar execução 10:55</div>
            <div class="endpoint"><a href="/birthdays">📋 /birthdays</a> - Ver todos os aniversários</div>
            <div class="endpoint"><a href="/check">🔍 /check</a> - Verificação manual</div>
            <div class="endpoint"><a href="/status">📊 /status</a> - Status JSON completo</div>
            <div class="endpoint"><a href="/ping">🔄 /ping</a> - Keep-alive + info sistema</div>
            <div class="endpoint"><a href="/debug">🔍 /debug</a> - Debug completo Firebase + formatos</div>
            
            <hr>
            <p><small>💡 <strong>Sistema integrado:</strong> Firebase + Twilio + Render FREE funcionando 24/7</small></p>
            <p><small>🔧 <strong>Versão:</strong> 2.4.0 - Dual Format + Twilio Control</small></p>
            <p><small>💰 <strong>Economia:</strong> Máxima eficiência + Controle rigoroso de limite</small></p>
            <p><small>📅 <strong>Formatos suportados:</strong> DD/MM/YYYY (Brasil) e YYYY-MM-DD (Americano)</small></p>
        </body>
        </html>
    `);
});

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
                version: '2.4.0'
            });
        }

        // Buscar dados do Firebase para incluir no teste
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        
        // Contar formatos de data
        const brFormats = birthdays.filter(b => b.date && b.date.includes('/')).length;
        const usFormats = birthdays.filter(b => b.date && b.date.includes('-')).length;
        
        let testMessage;
        
        if (tomorrowBirthdays.length > 0) {
            // Se há aniversários amanhã, mostrar o formato real
            testMessage = createCombinedBirthdayMessage(tomorrowBirthdays, 'TESTE');
        } else {
            // Se não há aniversários, mostrar teste de funcionamento
            testMessage = `🧪 *TESTE SISTEMA PM v2.4.0* 🎖️

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

⏰ *Execuções Automáticas:*
• 🌙 10:50 Brasil (12:20 UTC) - Verificação 1
• 🌅 10:55 Brasil (12:25 UTC) - Verificação 2

💰 *OTIMIZAÇÃO v2.4.0:*
• ✅ Suporte duplo formato de data
• ✅ 1 mensagem por horário (economia máxima)
• ✅ Controle rigoroso limite Twilio
• ✅ Bloqueio automático se limite atingido

📊 *Status Twilio:*
• Mensagens hoje: ${dailyMessageCount}/${MAX_DAILY_MESSAGES}
• Status: ${twilioLimitReached ? 'BLOQUEADO' : 'OPERACIONAL'}
• Reset: 00:00 UTC (21:00 Brasil)

✅ *Sistema PM v2.4.0 funcionando perfeitamente!*

---
_Teste manual com dados reais e controle Twilio_ 🚀`;
        }

        const result = await sendWhatsAppMessage(CONFIG.twilio.toNumber, testMessage);
        res.json({ 
            success: true, 
            message: 'Teste enviado com formato otimizado v2.4.0!', 
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
            twilio: {
                dailyCount: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
                limitReached: twilioLimitReached,
                status: twilioLimitReached ? 'BLOCKED' : 'OPERATIONAL'
            },
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            version: '2.4.0 - Dual Format + Twilio Control'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            twilioLimitReached: twilioLimitReached,
            dailyCount: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
            version: '2.4.0'
        });
    }
});

// Teste específico para 10:50
app.get('/test-0920', async (req, res) => {
    try {
        if (twilioLimitReached) {
            return res.status(429).json({
                success: false,
                error: 'Limite Twilio atingido - Teste 10:50 bloqueado',
                twilioStatus: 'BLOCKED',
                resetTime: '00:00 UTC (21:00 Brasil)',
                version: '2.4.0'
            });
        }

        console.log('🧪 TESTE MANUAL 10:50 INICIADO...');
        await executeAutomaticCheck('10:50');
        res.json({ 
            success: true, 
            message: 'Teste 10:50 Brasil (12:20 UTC) executado com controle Twilio!',
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            utc: new Date().toISOString(),
            timezone: 'America/Sao_Paulo → UTC',
            renderTime: '12:20 UTC',
            twilio: {
                dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
                limitReached: twilioLimitReached,
                status: twilioLimitReached ? 'BLOCKED' : 'OPERATIONAL'
            },
            version: '2.4.0'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            twilioLimitReached: twilioLimitReached,
            dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
            version: '2.4.0'
        });
    }
});

// Teste específico para 10:55
app.get('/test-0925', async (req, res) => {
    try {
        if (twilioLimitReached) {
            return res.status(429).json({
                success: false,
                error: 'Limite Twilio atingido - Teste 10:55 bloqueado',
                twilioStatus: 'BLOCKED',
                resetTime: '00:00 UTC (21:00 Brasil)',
                version: '2.4.0'
            });
        }

        console.log('🧪 TESTE MANUAL 10:55 INICIADO...');
        await executeAutomaticCheck('10:55');
        res.json({ 
            success: true, 
            message: 'Teste 10:55 Brasil (12:25 UTC) executado com controle Twilio!',
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            utc: new Date().toISOString(),
            timezone: 'America/Sao_Paulo → UTC',
            renderTime: '12:25 UTC',
            twilio: {
                dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
                limitReached: twilioLimitReached,
                status: twilioLimitReached ? 'BLOCKED' : 'OPERATIONAL'
            },
            version: '2.4.0'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            twilioLimitReached: twilioLimitReached,
            dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
            version: '2.4.0'
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
                version: '2.4.0'
            });
        }

        console.log('🔍 VERIFICAÇÃO MANUAL INICIADA...');
        await executeAutomaticCheck('manual');
        res.json({ 
            success: true, 
            message: 'Verificação manual executada com formato otimizado v2.4.0!',
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            utc: new Date().toISOString(),
            twilio: {
                dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
                limitReached: twilioLimitReached,
                status: twilioLimitReached ? 'BLOCKED' : 'OPERATIONAL'
            },
            version: '2.4.0'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            twilioLimitReached: twilioLimitReached,
            dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
            version: '2.4.0'
        });
    }
});

// Endpoint para listar todos os aniversários
app.get('/birthdays', async (req, res) => {
    try {
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        
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
            version: '2.4.0'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            version: '2.4.0'
        });
    }
});

// Rota de debug ATUALIZADA - Ver todos os dados com detecção de formato
app.get('/debug', async (req, res) => {
    try {
        const birthdays = await getBirthdaysFromFirebase();
        
        res.json({
            system: {
                version: '2.4.0',
                optimization: 'Uma mensagem por horário + Controle Twilio',
                dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
                twilioLimitReached: twilioLimitReached,
                resetTime: '00:00 UTC (21:00 Brasil)'
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
            version: '2.4.0',
            twilioLimitReached: twilioLimitReached
        });
    }
});

// Status completo do sistema ATUALIZADO v2.4.0
app.get('/status', async (req, res) => {
    try {
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        const uptime = process.uptime();
        const memory = process.memoryUsage();
        
        // Análise de formatos
        const brFormats = birthdays.filter(b => b.date && b.date.includes('/')).length;
        const usFormats = birthdays.filter(b => b.date && b.date.includes('-')).length;
        const invalidFormats = birthdays.filter(b => !b.date || (!b.date.includes('/') && !b.date.includes('-'))).length;
        
        res.json({
            system: {
                status: 'online',
                version: '2.4.0',
                optimization: 'Uma mensagem por horário + Controle Twilio',
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
                    '10:50_Brasil': '12:20_UTC',
                    '10:55_Brasil': '12:25_UTC'
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
            cronJobs: {
                '12:20_UTC': '10:50 Brasil - Verificação 1',
                '12:25_UTC': '10:55 Brasil - Verificação 2',
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
                twilioControlActive: true
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            timestamp: new Date().toISOString(),
            version: '2.4.0',
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
    res.status(404).json({
        error: 'Endpoint não encontrado',
        availableEndpoints: [
            'GET /',
            'GET /test',
            'GET /test-0920',
            'GET /test-0925',
            'GET /check',
            'GET /birthdays',
            'GET /status',
            'GET /ping',
            'GET /debug',
            'POST /webhook'
        ],
        version: '2.4.0',
        optimization: 'Uma mensagem por horário + Controle Twilio',
        twilioStatus: twilioLimitReached ? 'BLOCKED' : 'OPERATIONAL',
        timestamp: new Date().toISOString()
    });
});

// 🚀 INICIALIZAR SERVIDOR
async function startServer() {
    try {
        console.log('🎖️ === INICIANDO SISTEMA PM 24/7 v2.4.0 DUAL FORMAT ===');
        console.log(`💰 OTIMIZAÇÃO: Uma mensagem por horário + Controle Twilio`);
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
        
        // Iniciar keep-alive
        startKeepAlive();
        
        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`\n🚀 === SERVIDOR ONLINE v2.4.0 ===`);
            console.log(`🌐 URL: https://seu-app.onrender.com`);
            console.log(`🔌 Porta: ${PORT}`);
            console.log(`🔥 Firebase: ${firebaseConnected ? 'Conectado ✅' : 'Desconectado ❌'}`);
            console.log(`📱 WhatsApp: ${CONFIG.twilio.toNumber}`);
            console.log(`💰 Otimização: 1 mensagem por horário ✅`);
            console.log(`📊 Limite diário: ${MAX_DAILY_MESSAGES} mensagens`);
            console.log(`🚫 Controle Twilio: ${twilioLimitReached ? 'BLOQUEADO' : 'ATIVO'} ✅`);
            console.log(`📅 Formatos suportados: DD/MM/YYYY + YYYY-MM-DD ✅`);
            console.log(`\n⏰ CRON JOBS ATIVOS:`);
            console.log(`   🌙 12:20 UTC = 10:50 Brasil (Verificação 1)`);
            console.log(`   🌅 12:25 UTC = 10:55 Brasil (Verificação 2)`);
            console.log(`   🔄 00:00 UTC = Reset contador + flag Twilio`);
            console.log(`\n🎖️ Sistema PM v2.4.0 pronto para funcionar 24/7!`);
            console.log(`📋 Próxima verificação: ${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}`);
            console.log(`💡 DUAL FORMAT: Reconhece automaticamente formato da data`);
            console.log(`🛡️ CONTROLE TWILIO: Bloqueio automático se limite atingido`);
            console.log(`\n=== SISTEMA OPERACIONAL v2.4.0 ===\n`);
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
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🔄 Recebido SIGINT, encerrando servidor...');
    process.exit(0);
});

// 🚀 INICIAR O SISTEMA
startServer();

// Exportar para testes (opcional)
module.exports = app;


