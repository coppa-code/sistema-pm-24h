// server.js - Sistema PM OTIMIZADO - UMA MENSAGEM POR HORÁRIO - v2.3.0
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
        sendTime: process.env.NOTIFICATION_TIME || '09:35-09:40'
    },
    keepAlive: {
        enabled: process.env.KEEP_ALIVE_ENABLED !== 'false',
        interval: 10 * 60 * 1000 // 10 minutos
    }
};

// 🛡️ CONTROLE DE LIMITE DIÁRIO
let dailyMessageCount = 0;
const MAX_DAILY_MESSAGES = 8;

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

// 📱 FUNÇÃO OTIMIZADA para enviar WhatsApp com controle
async function sendWhatsAppMessage(to, message) {
    if (dailyMessageCount >= MAX_DAILY_MESSAGES) {
        console.log(`⚠️ LIMITE DIÁRIO ATINGIDO: ${dailyMessageCount}/${MAX_DAILY_MESSAGES}`);
        throw new Error(`Limite diário de mensagens atingido (${dailyMessageCount}/${MAX_DAILY_MESSAGES})`);
    }

    try {
        // Usar fetch nativo do Node.js 18+ ou importar node-fetch v2
        let fetch;
        
        try {
            // Tentar usar fetch nativo (Node.js 18+)
            fetch = globalThis.fetch;
            if (!fetch) {
                // Fallback para node-fetch v2
                const nodeFetch = await import('node-fetch');
                fetch = nodeFetch.default || nodeFetch;
            }
        } catch (error) {
            console.error('❌ Erro ao importar fetch:', error);
            throw new Error('Fetch não disponível');
        }

        const url = `https://api.twilio.com/2010-04-01/Accounts/${CONFIG.twilio.accountSid}/Messages.json`;
        
        // Garantir formato correto do número
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
        
        if (error.message.includes('63038')) {
            console.error('❌ LIMITE TWILIO EXCEDIDO - Upgrade necessário');
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

// 🧮 CALCULAR IDADE SEGURA
function calculateAge(dateString) {
    try {
        if (!dateString || !dateString.includes('/')) {
            console.log(`⚠️ Data inválida para cálculo de idade: ${dateString}`);
            return 0;
        }
        
        const dateParts = dateString.split('/');
        if (dateParts.length < 3) {
            console.log(`⚠️ Data incompleta para cálculo de idade: ${dateString}`);
            return 0;
        }
        
        const [day, month, year] = dateParts;
        
        if (!day || !month || !year) {
            console.log(`⚠️ Partes da data vazias: ${dateString}`);
            return 0;
        }
        
        const birth = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        const today = new Date();
        
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        
        return age > 0 ? age : 0;
    } catch (error) {
        console.error('❌ Erro ao calcular idade:', error.message);
        return 0;
    }
}

// 📅 VERIFICAR QUEM FAZ ANIVERSÁRIO AMANHÃ - VERSÃO SEGURA
function checkTomorrowBirthdays(birthdays) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const tomorrowDay = tomorrow.getDate().toString().padStart(2, '0');
    const tomorrowMonth = (tomorrow.getMonth() + 1).toString().padStart(2, '0');
    
    console.log(`🔍 Verificando aniversários para AMANHÃ: ${tomorrowDay}/${tomorrowMonth}`);
    
    const tomorrowBirthdays = birthdays.filter(birthday => {
        try {
            // ✅ VERIFICAÇÕES DE SEGURANÇA
            if (!birthday) {
                console.log('⚠️ Aniversário é null/undefined');
                return false;
            }
            
            if (!birthday.date || birthday.date === '') {
                console.log(`⚠️ Data vazia para: ${birthday.name || 'Nome não informado'}`);
                return false;
            }
            
            // ✅ VERIFICAR SE A DATA CONTÉM BARRA
            if (!birthday.date.includes('/')) {
                console.log(`⚠️ Formato de data inválido para ${birthday.name}: ${birthday.date}`);
                return false;
            }
            
            const dateParts = birthday.date.split('/');
            
            // ✅ VERIFICAR SE TEM PELO MENOS DIA E MÊS
            if (dateParts.length < 2) {
                console.log(`⚠️ Data incompleta para ${birthday.name}: ${birthday.date}`);
                return false;
            }
            
            const day = dateParts[0];
            const month = dateParts[1];
            
            // ✅ VERIFICAR SE DIA E MÊS NÃO SÃO VAZIOS
            if (!day || !month || day.trim() === '' || month.trim() === '') {
                console.log(`⚠️ Dia ou mês vazio para ${birthday.name}: ${birthday.date}`);
                return false;
            }
            
            // ✅ APLICAR padStart COM SEGURANÇA
            const birthdayDay = day.toString().trim().padStart(2, '0');
            const birthdayMonth = month.toString().trim().padStart(2, '0');
            
            const match = birthdayDay === tomorrowDay && birthdayMonth === tomorrowMonth;
            
            if (match) {
                console.log(`🎂 ENCONTRADO: ${birthday.graduation || 'Sem graduação'} ${birthday.name || 'Sem nome'} - ${birthday.date}`);
            }
            
            return match;
            
        } catch (error) {
            console.error(`❌ Erro ao processar aniversário de ${birthday.name || 'Nome desconhecido'}:`, error.message);
            console.error(`   Data problemática: "${birthday.date}"`);
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
    
    const periodoEmoji = periodo === '09:35' ? '🌙' : 
                        periodo === '09:40' ? '🌅' : '🎂';
    
    const periodoTexto = periodo === '09:35' ? '(Lembrete 09:35h)' : 
                        periodo === '09:40' ? '(Lembrete 09:40h)' : 
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

// 🤖 EXECUÇÃO PRINCIPAL - UMA MENSAGEM POR HORÁRIO (OTIMIZADA)
async function executeAutomaticCheck(periodo = 'padrão') {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🎖️ === EXECUÇÃO AUTOMÁTICA PM (${periodo.toUpperCase()}) === ${brasilTime}`);
    
    try {
        // Buscar todos os aniversários do Firebase
        const allBirthdays = await getBirthdaysFromFirebase();
        
        if (allBirthdays.length === 0) {
            console.log('📋 Nenhum aniversário encontrado no Firebase');
            return;
        }
        
        // Verificar quem faz aniversário AMANHÃ
        const tomorrowBirthdays = checkTomorrowBirthdays(allBirthdays);
        
        if (tomorrowBirthdays.length === 0) {
            console.log(`ℹ️ Nenhum aniversário AMANHÃ (${periodo})`);
            
            // Teste de fim de semana (manter para verificar funcionamento)
            const today = new Date();
            const isWeekend = today.getDay() === 6 || today.getDay() === 0;
            
            if (isWeekend) {
                console.log(`🧪 Enviando teste de fim de semana (${periodo}) - Sistema funcionando!`);
                
                const testMessage = `🧪 *TESTE SISTEMA PM ${periodo.toUpperCase()}* 🎖️

⏰ *Execução:* ${periodo === '09:35' ? '09:35 Brasil (12:20 UTC)' : periodo === '09:40' ? '09:40 Brasil (12:25 UTC)' : 'Automático'}
📋 *Aniversários no banco:* ${allBirthdays.length}
🔍 *Verificado para amanhã:* 0 aniversários
🗓️ *Data verificada:* ${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}

✅ *Sistema funcionando! Conectado ao Firebase!*
🌍 *Timezone:* America/Sao_Paulo
🖥️ *Platform:* Render FREE (UTC)
💰 *Otimização:* 1 mensagem por horário

---
_Sistema PM 24/7 operacional v2.3.0_ 🚀`;

                await sendWhatsAppMessage(CONFIG.twilio.toNumber, testMessage);
                console.log(`✅ Teste de funcionamento (${periodo}) enviado!`);
            }
            
            return;
        }
        
        // ✅ ENVIAR UMA MENSAGEM ÚNICA COM TODOS
        console.log(`🎂 ENVIANDO 1 MENSAGEM ÚNICA com ${tomorrowBirthdays.length} aniversariante(s)...`);
        
        const combinedMessage = createCombinedBirthdayMessage(tomorrowBirthdays, periodo);
        const result = await sendWhatsAppMessage(CONFIG.twilio.toNumber, combinedMessage);
        
        console.log(`✅ MENSAGEM ÚNICA ENVIADA - SID: ${result.sid}`);
        console.log(`🎂 Aniversariantes: ${tomorrowBirthdays.map(b => `${b.graduation || 'Sem graduação'} ${b.name || 'Sem nome'}`).join(', ')}`);
        
        // 📊 Relatório final
        console.log(`📊 RELATÓRIO FINAL (${periodo}):`);
        console.log(`   ✅ Mensagem enviada: 1`);
        console.log(`   🎂 Aniversariantes: ${tomorrowBirthdays.length}`);
        console.log(`   💰 Economia: ${tomorrowBirthdays.length - 1} mensagens poupadas`);
        console.log(`   📊 Mensagens hoje: ${dailyMessageCount}/${MAX_DAILY_MESSAGES}`);
        
    } catch (error) {
        console.error(`❌ Erro na execução automática (${periodo}):`, error.message);
        
        // Enviar erro para você saber
        try {
            const errorMessage = `❌ *ERRO SISTEMA PM* 🚨

⏰ *Horário:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
🔧 *Período:* ${periodo}
⚠️ *Erro:* ${error.message}

💡 *Verificar logs no Render para mais detalhes*

---
_Sistema PM - Alerta de Erro v2.3.0_ ⚠️`;

            await sendWhatsAppMessage(CONFIG.twilio.toNumber, errorMessage);
        } catch (e) {
            console.error('❌ Erro ao enviar alerta de erro:', e);
        }
    }
}

// 🕘 CONFIGURAR CRON JOBS (09:35 e 09:40 Brasil no Render UTC)
console.log('⏰ Configurando cron jobs para 09:35 e 09:40 Brasil...');

// 09:35 Brasil = 12:20 UTC - Verificação 1
cron.schedule('35 12 * * *', () => {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🌙 EXECUÇÃO 09:35 BRASIL (12:20 UTC) - ${brasilTime}`);
    executeAutomaticCheck('09:35');
}, {
    timezone: "UTC"  // Render usa UTC
});

// 09:40 Brasil = 12:25 UTC - Verificação 2
cron.schedule('40 12 * * *', () => {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🌅 EXECUÇÃO 09:40 BRASIL (12:25 UTC) - ${brasilTime}`);
    executeAutomaticCheck('09:40');
}, {
    timezone: "UTC"  // Render usa UTC
});

// Reset contador diário às 00:00 UTC
cron.schedule('0 0 * * *', () => {
    dailyMessageCount = 0;
    console.log('🔄 Contador de mensagens resetado para novo dia');
}, {
    timezone: "UTC"
});

console.log(`⏰ Cron jobs configurados para Render (UTC):`);
console.log(`   🌙 12:20 UTC = 09:35 Brasil (Verificação 1)`);
console.log(`   🌅 12:25 UTC = 09:40 Brasil (Verificação 2)`);
console.log(`   🔄 00:00 UTC = Reset contador diário`);

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
        version: '2.3.0',
        optimization: 'Uma mensagem por horário',
        dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`
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
                    `).join('')}
                </div>
            `;
        } else {
            birthdayInfo = `
                <div style="background: #d4edda; padding: 15px; margin: 20px 0; border-radius: 5px;">
                    <p>📅 <strong>Nenhum aniversário amanhã</strong> - Sistema funcionando normalmente</p>
                    <p>📋 Total no banco: ${birthdays.length} aniversários</p>
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
            <title>Sistema PM 24/7 v2.3.0 - OTIMIZADO</title>
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
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🎖️ Sistema PM 24/7 v2.3.0 - OTIMIZADO!</h1>
                <p>Sistema de Aniversários da Polícia Militar</p>
                <p><strong>💰 UMA MENSAGEM POR HORÁRIO</strong></p>
            </div>
            
            <div class="optimization">
                <h3>💰 OTIMIZAÇÃO ATIVA:</h3>
                <ul>
                    <li>✅ <strong>1 mensagem por horário</strong> (máximo 2 por dia)</li>
                    <li>✅ <strong>Todos os aniversariantes</strong> em uma única mensagem</li>
                    <li>✅ <strong>Graduação + Nome + Idade + Unidade</strong></li>
                    <li>✅ <strong>Economia massiva</strong> no Twilio</li>
                </ul>
                <p><strong>📊 Mensagens hoje:</strong> ${dailyMessageCount}/${MAX_DAILY_MESSAGES}</p>
            </div>
            
            <div class="status">
                <p><strong>Status:</strong> ✅ Online (Render FREE + Firebase)</p>
                <p><strong>Horário Brasil:</strong> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                <p><strong>UTC (Render):</strong> ${new Date().toISOString()}</p>
                <p><strong>Uptime:</strong> ${hours}h ${minutes}m</p>
                <p><strong>Keep-alive:</strong> ${CONFIG.keepAlive.enabled ? '✅ Ativo' : '❌ Desabilitado'}</p>
                <p><strong>Firebase:</strong> ${db ? '✅ Conectado' : '❌ Desconectado'}</p>
                <p><strong>Destinatário:</strong> ${CONFIG.twilio.toNumber}</p>
                <p><strong>Versão:</strong> v2.3.0 - Otimizada</p>
            </div>
            
            <div class="timezone">
                <h4>🌍 Conversão de Timezone (Brasil → UTC):</h4>
                <p>• <strong>09:35 Brasil</strong> = <strong>12:20 UTC</strong></p>
                <p>• <strong>09:40 Brasil</strong> = <strong>12:25 UTC</strong></p>
                <p><small>Brasil UTC-3 | Render usa UTC</small></p>
            </div>
            
            ${birthdayInfo}
            
            <div class="executions">
                <h3>⏰ Execuções Automáticas:</h3>
                <ul>
                    <li>🌙 <strong>09:35 Brasil (12:20 UTC)</strong> - Primeira verificação</li>
                    <li>🌅 <strong>09:40 Brasil (12:25 UTC)</strong> - Segunda verificação</li>
                </ul>
                <p><small>📅 <strong>Verificando para amanhã:</strong> ${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}</small></p>
            </div>
            
            <h3>🔧 Endpoints Disponíveis:</h3>
            <div class="endpoint"><a href="/test">🧪 /test</a> - Testar WhatsApp otimizado</div>
            <div class="endpoint"><a href="/test-0920">🌙 /test-0920</a> - Testar execução 09:35</div>
                        <div class="endpoint"><a href="/test-0925">🌅 /test-0925</a> - Testar execução 09:40</div>
            <div class="endpoint"><a href="/birthdays">📋 /birthdays</a> - Ver todos os aniversários</div>
            <div class="endpoint"><a href="/check">🔍 /check</a> - Verificar agora (manual)</div>
            <div class="endpoint"><a href="/status">📊 /status</a> - Status JSON completo</div>
            <div class="endpoint"><a href="/ping">🔄 /ping</a> - Keep-alive</div>
            <div class="endpoint"><a href="/debug">🔍 /debug</a> - Debug dados Firebase</div>
            
            <hr>
            <p><small>💡 <strong>Sistema integrado:</strong> Firebase + Twilio + Render FREE funcionando 24/7</small></p>
            <p><small>🔧 <strong>Versão:</strong> 2.3.0 - Otimizada (1 mensagem por horário)</small></p>
            <p><small>💰 <strong>Economia:</strong> Máxima eficiência no Twilio</small></p>
        </body>
        </html>
    `);
});

// Endpoint para teste geral OTIMIZADO
app.get('/test', async (req, res) => {
    try {
        // Buscar dados do Firebase para incluir no teste
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        
        let testMessage;
        
        if (tomorrowBirthdays.length > 0) {
            // Se há aniversários amanhã, mostrar o formato real
            testMessage = createCombinedBirthdayMessage(tomorrowBirthdays, 'TESTE');
        } else {
            // Se não há aniversários, mostrar teste de funcionamento
            testMessage = `🧪 *TESTE SISTEMA PM + FIREBASE* 🎖️

⏰ *Horário Brasil:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
🕐 *UTC (Render):* ${new Date().toISOString()}
🆓 *Plataforma:* Render FREE
🔥 *Firebase:* ${db ? 'Conectado ✅' : 'Desconectado ❌'}
📱 *WhatsApp:* Conectado via Twilio

📊 *Dados Atuais:*
• 📋 Total no banco: ${birthdays.length} aniversários
• 🎂 Amanhã (${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}): ${tomorrowBirthdays.length} aniversário(s)

⏰ *Execuções Automáticas:*
• 🌙 09:35 Brasil (12:20 UTC) - Verificação 1
• 🌅 09:40 Brasil (12:25 UTC) - Verificação 2

💰 *OTIMIZAÇÃO:* 1 mensagem por horário (economia máxima!)
📊 *Mensagens hoje:* ${dailyMessageCount}/${MAX_DAILY_MESSAGES}

✅ *Sistema PM integrado funcionando perfeitamente!*

---
_Teste manual com dados reais - v2.3.0_ 🚀`;
        }

        const result = await sendWhatsAppMessage(CONFIG.twilio.toNumber, testMessage);
        res.json({ 
            success: true, 
            message: 'Teste enviado com formato otimizado!', 
            sid: result.sid,
            firebase: {
                connected: db !== null,
                totalBirthdays: birthdays.length,
                tomorrowBirthdays: tomorrowBirthdays.length
            },
            optimization: {
                messagesWouldSend: tomorrowBirthdays.length || 1,
                messagesActuallySent: 1,
                messagesSaved: Math.max(0, tomorrowBirthdays.length - 1)
            },
            dailyCount: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            version: '2.3.0 - Otimizado'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Teste específico para 09:35
app.get('/test-0920', async (req, res) => {
    try {
        console.log('🧪 TESTE MANUAL 09:35 INICIADO...');
        await executeAutomaticCheck('09:35');
        res.json({ 
            success: true, 
            message: 'Teste 09:35 Brasil (12:20 UTC) executado!',
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            utc: new Date().toISOString(),
            timezone: 'America/Sao_Paulo → UTC',
            renderTime: '12:20 UTC',
            dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
            version: '2.3.0'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`
        });
    }
});

// Teste específico para 09:40
app.get('/test-0925', async (req, res) => {
    try {
        console.log('🧪 TESTE MANUAL 09:40 INICIADO...');
        await executeAutomaticCheck('09:40');
        res.json({ 
            success: true, 
            message: 'Teste 09:40 Brasil (12:25 UTC) executado!',
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            utc: new Date().toISOString(),
            timezone: 'America/Sao_Paulo → UTC',
            renderTime: '12:25 UTC',
            dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
            version: '2.3.0'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`
        });
    }
});

// Endpoint para verificar aniversários manualmente
app.get('/check', async (req, res) => {
    try {
        console.log('🔍 VERIFICAÇÃO MANUAL INICIADA...');
        await executeAutomaticCheck('manual');
        res.json({ 
            success: true, 
            message: 'Verificação manual executada com formato otimizado!',
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            utc: new Date().toISOString(),
            dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
            version: '2.3.0'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`
        });
    }
});

// Endpoint para listar todos os aniversários
app.get('/birthdays', async (req, res) => {
    try {
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        
        res.json({
            success: true,
            total: birthdays.length,
            tomorrowCount: tomorrowBirthdays.length,
            tomorrow: tomorrowBirthdays.map(b => ({
                name: b.name || 'Sem nome',
                graduation: b.graduation || 'Sem graduação',
                date: b.date || 'Data não informada',
                age: calculateAge(b.date) + 1,
                phone: b.phone || 'Tel não informado',
                relationship: b.relationship || 'Relacionamento não informado',
                unit: b.unit || 'Unidade não informada'
            })),
            allBirthdays: birthdays.map(b => ({
                name: b.name || 'Sem nome',
                graduation: b.graduation || 'Sem graduação',
                date: b.date || 'Data não informada',
                currentAge: calculateAge(b.date),
                phone: b.phone || 'Tel não informado',
                relationship: b.relationship || 'Relacionamento não informado',
                unit: b.unit || 'Unidade não informada'
            })),
            optimization: {
                messagesPerExecution: 1,
                maxDailyMessages: MAX_DAILY_MESSAGES,
                currentDailyCount: dailyMessageCount
            },
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            checkingFor: new Date(Date.now() + 86400000).toLocaleDateString('pt-BR'),
            version: '2.3.0'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            version: '2.3.0'
        });
    }
});

// Rota de debug - Ver todos os dados
app.get('/debug', async (req, res) => {
    try {
        const birthdays = await getBirthdaysFromFirebase();
        
        res.json({
            system: {
                version: '2.3.0',
                optimization: 'Uma mensagem por horário',
                dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`
            },
            firebase: {
                connected: db !== null,
                totalRegistros: birthdays.length
            },
            registros: birthdays.map((b, index) => ({
                indice: index + 1,
                nome: b.name || 'VAZIO',
                graduacao: b.graduation || 'VAZIO',
                data: b.date || 'VAZIO',
                telefone: b.phone || 'VAZIO',
                relacionamento: b.relationship || 'VAZIO',
                unidade: b.unit || 'VAZIO',
                data_valida: b.date && b.date.includes('/'),
                partes_data: b.date ? b.date.split('/') : [],
                idade_atual: calculateAge(b.date)
            })),
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        });
    } catch (error) {
        res.status(500).json({
            erro: error.message,
            version: '2.3.0'
        });
    }
});

// Status completo do sistema ATUALIZADO
app.get('/status', async (req, res) => {
    try {
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        const uptime = process.uptime();
        const memory = process.memoryUsage();
        
        res.json({
            system: {
                status: 'online',
                version: '2.3.0',
                optimization: 'Uma mensagem por horário',
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
                    '09:35_Brasil': '12:20_UTC',
                    '09:40_Brasil': '12:25_UTC'
                }
            },
            firebase: {
                connected: db !== null,
                totalBirthdays: birthdays.length,
                tomorrowBirthdays: tomorrowBirthdays.length
            },
            twilio: {
                configured: !!CONFIG.twilio.accountSid,
                fromNumber: CONFIG.twilio.fromNumber,
                toNumber: CONFIG.twilio.toNumber,
                dailyMessages: `${dailyMessageCount}/${MAX_DAILY_MESSAGES}`,
                optimization: 'Máxima economia ativa'
            },
            cronJobs: {
                '12:20_UTC': '09:35 Brasil - Verificação 1',
                '12:25_UTC': '09:40 Brasil - Verificação 2',
                '00:00_UTC': 'Reset contador diário'
            },
            keepAlive: {
                enabled: CONFIG.keepAlive.enabled,
                interval: `${CONFIG.keepAlive.interval / 1000 / 60} minutos`
            },
            nextCheck: {
                date: new Date(Date.now() + 86400000).toLocaleDateString('pt-BR'),
                birthdays: tomorrowBirthdays.map(b => `${b.graduation || 'Sem graduação'} ${b.name || 'Sem nome'}`)
            },
            optimization: {
                messagesPerExecution: 1,
                maxSavingsPerExecution: 'Ilimitado',
                economyActive: true
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            timestamp: new Date().toISOString(),
            version: '2.3.0'
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
        version: '2.3.0',
        optimization: 'Uma mensagem por horário',
        timestamp: new Date().toISOString()
    });
});

// 🚀 INICIALIZAR SERVIDOR
async function startServer() {
    try {
        console.log('🎖️ === INICIANDO SISTEMA PM 24/7 v2.3.0 OTIMIZADO ===');
        console.log(`💰 OTIMIZAÇÃO: Uma mensagem por horário`);
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
            console.log(`\n🚀 === SERVIDOR ONLINE ===`);
            console.log(`🌐 URL: https://seu-app.onrender.com`);
            console.log(`🔌 Porta: ${PORT}`);
            console.log(`🔥 Firebase: ${firebaseConnected ? 'Conectado ✅' : 'Desconectado ❌'}`);
            console.log(`📱 WhatsApp: ${CONFIG.twilio.toNumber}`);
            console.log(`💰 Otimização: 1 mensagem por horário ✅`);
            console.log(`📊 Limite diário: ${MAX_DAILY_MESSAGES} mensagens`);
            console.log(`\n⏰ CRON JOBS ATIVOS:`);
            console.log(`   🌙 12:35 UTC = 09:35 Brasil (Verificação 1)`);
            console.log(`   🌅 12:40 UTC = 09:40 Brasil (Verificação 2)`);
            console.log(`   🔄 00:00 UTC = Reset contador diário`);
            console.log(`\n🎖️ Sistema PM pronto para funcionar 24/7!`);
            console.log(`📋 Próxima verificação: ${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}`);
            console.log(`💡 ECONOMIA ATIVA: Máxima eficiência no Twilio`);
            console.log(`\n=== SISTEMA OPERACIONAL v2.3.0 ===\n`);
        });
        
        // Teste inicial (opcional)
        setTimeout(async () => {
            try {
                console.log('🧪 Executando teste inicial do sistema...');
                const birthdays = await getBirthdaysFromFirebase();
                console.log(`📋 ${birthdays.length} aniversários carregados do Firebase`);
                
                const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
                if (tomorrowBirthdays.length > 0) {
                    console.log(`🎂 ${tomorrowBirthdays.length} aniversário(s) amanhã: ${tomorrowBirthdays.map(b => `${b.graduation || 'Sem graduação'} ${b.name || 'Sem nome'}`).join(', ')}`);
                    console.log(`💰 Economia: ${tomorrowBirthdays.length - 1} mensagens poupadas por execução`);
                }
                
                console.log('✅ Teste inicial concluído com sucesso!');
            } catch (error) {
                console.log(`⚠️ Erro no teste inicial: ${error.message}`);
            }
        }, 5000);
        
    } catch (error) {
        console.error('❌ Erro crítico ao iniciar servidor:', error);
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
    console.log('🔄 Recebido SIGTERM, encerrando graciosamente...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🔄 Recebido SIGINT, encerrando graciosamente...');
    process.exit(0);
});

// 🚀 INICIAR TUDO
startServer();

