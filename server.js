// server.js - Sistema PM CORRIGIDO para 09:20 e 09:25 Brasil (Render UTC)
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
        sendTime: process.env.NOTIFICATION_TIME || '09:20-09:25'
    },
    keepAlive: {
        enabled: process.env.KEEP_ALIVE_ENABLED !== 'false',
        interval: 10 * 60 * 1000 // 10 minutos
    }
};

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

// 📱 FUNÇÃO CORRIGIDA para enviar WhatsApp
async function sendWhatsAppMessage(to, message) {
    try {
        // Usar fetch nativo do Node.js 18+ ou importar node-fetch v2 [[0]](#__0)
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
        console.log('✅ WhatsApp enviado:', result.sid);
        return result;
        
    } catch (error) {
        console.error('❌ Erro detalhado no envio WhatsApp:', error);
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
            birthdays.push({
                id: doc.id,
                ...doc.data()
            });
        });

        console.log(`📋 ${birthdays.length} aniversários carregados do Firebase`);
        return birthdays;
    } catch (error) {
        console.error('❌ Erro ao buscar aniversários:', error);
        return [];
    }
}

// 🧮 CALCULAR IDADE
function calculateAge(dateString) {
    const today = new Date();
    const birthDate = new Date(dateString + 'T00:00:00');
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age > 0 ? age : 0;
}

// 📅 VERIFICAR QUEM FAZ ANIVERSÁRIO AMANHÃ (com timezone correto)
function checkTomorrowBirthdays(birthdays) {
    // Usar timezone do Brasil [[1]](#__1)
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    // Ajustar para timezone do Brasil
    const brasilTime = new Date(tomorrow.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
    
    const tomorrowDay = brasilTime.getDate();
    const tomorrowMonth = brasilTime.getMonth() + 1;
    
    console.log(`🔍 Procurando aniversários para: ${tomorrowDay}/${tomorrowMonth.toString().padStart(2, '0')} (amanhã - Brasil)`);
    
    const tomorrowBirthdays = birthdays.filter(birthday => {
        const birthDate = new Date(birthday.date + 'T00:00:00');
        const birthDay = birthDate.getDate();
        const birthMonth = birthDate.getMonth() + 1;
        
        const match = birthDay === tomorrowDay && birthMonth === tomorrowMonth;
        
        if (match) {
            console.log(`🎂 ENCONTRADO: ${birthday.graduation} ${birthday.name} - ${birthday.date}`);
        }
        
        return match;
    });
    
    console.log(`🎯 Total de aniversariantes amanhã: ${tomorrowBirthdays.length}`);
    return tomorrowBirthdays;
}

// 💬 CRIAR MENSAGEM PERSONALIZADA PARA ANIVERSÁRIO (ATUALIZADA)
function createBirthdayMessage(birthday, periodo = 'padrão') {
    const age = calculateAge(birthday.date);
    const nextAge = age + 1;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Ajustar descrição do período para novos horários
    const periodoEmoji = periodo === '09:20' ? '🌙' : 
                        periodo === '09:25' ? '🌅' : '🎂';
    
    const periodoTexto = periodo === '09:20' ? '(Lembrete 09:20)' : 
                        periodo === '09:25' ? '(Lembrete 09:25)' : 
                        '(Lembrete Automático)';
    
    return `${periodoEmoji} *LEMBRETE DE ANIVERSÁRIO PM* 🎖️
${periodoTexto}

📅 *AMANHÃ* - ${tomorrow.toLocaleDateString('pt-BR')}
🎖️ *Graduação:* ${birthday.graduation}
👤 *Nome:* ${birthday.name}
🎈 *Fará:* ${nextAge} anos
📞 *Telefone:* ${birthday.phone}
👥 *Relacionamento:* ${birthday.relationship}
${birthday.unit ? `🏢 *Unidade:* ${birthday.unit}` : ''}

🎁 *NÃO ESQUEÇA DE PARABENIZAR AMANHÃ!*
💐 *Sugestões:* Ligação, mensagem, presente ou visita

---
_Sistema PM 24/7 - ${periodo === '09:20' ? '09:20' : periodo === '09:25' ? '09:25' : 'Automático'}_ 🎖️
_${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}_`;
}

// 🤖 EXECUÇÃO PRINCIPAL - VERIFICAR ANIVERSÁRIOS REAIS
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

⏰ *Execução:* ${periodo === '09:20' ? '09:20 Brasil (02:58 UTC)' : periodo === '09:25' ? '09:25 Brasil (02:59 UTC)' : 'Automático'}
📋 *Aniversários no banco:* ${allBirthdays.length}
🔍 *Verificado para amanhã:* 0 aniversários
🗓️ *Data verificada:* ${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}

✅ *Sistema funcionando! Conectado ao Firebase!*
🌍 *Timezone:* America/Sao_Paulo
🖥️ *Platform:* Render FREE (UTC)

---
_Sistema PM 24/7 operacional_ 🚀`;

                await sendWhatsAppMessage(CONFIG.twilio.toNumber, testMessage);
                console.log(`✅ Teste de funcionamento (${periodo}) enviado!`);
            }
            
            return;
        }
        
        // ENVIAR LEMBRETES PARA CADA ANIVERSARIANTE
        console.log(`🎂 ENVIANDO ${tomorrowBirthdays.length} LEMBRETE(S) DE ANIVERSÁRIO...`);
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < tomorrowBirthdays.length; i++) {
            const birthday = tomorrowBirthdays[i];
            
            try {
                const message = createBirthdayMessage(birthday, periodo);
                const result = await sendWhatsAppMessage(CONFIG.twilio.toNumber, message);
                
                console.log(`✅ ENVIADO (${i + 1}/${tomorrowBirthdays.length}): ${birthday.graduation} ${birthday.name} - SID: ${result.sid}`);
                successCount++;
                
                // Aguardar 3 segundos entre mensagens para evitar spam
                if (i < tomorrowBirthdays.length - 1) {
                    console.log('⏳ Aguardando 3s para próxima mensagem...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
                
            } catch (error) {
                console.error(`❌ ERRO (${i + 1}/${tomorrowBirthdays.length}): ${birthday.graduation} ${birthday.name} - ${error.message}`);
                errorCount++;
            }
        }
        
        // RELATÓRIO FINAL
        console.log(`\n📊 RELATÓRIO FINAL (${periodo.toUpperCase()}):`);
        console.log(`   ✅ Sucessos: ${successCount}`);
        console.log(`   ❌ Erros: ${errorCount}`);
        console.log(`   📈 Taxa: ${successCount > 0 ? ((successCount / tomorrowBirthdays.length) * 100).toFixed(1) : 0}%`);
        console.log(`   🎂 Aniversariantes: ${tomorrowBirthdays.map(b => `${b.graduation} ${b.name}`).join(', ')}`);
        
        // Enviar resumo se múltiplos aniversários
        if (tomorrowBirthdays.length > 1) {
            const summaryMessage = `📊 *RESUMO ANIVERSÁRIOS AMANHÃ* 🎖️

🗓️ *Data:* ${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}
🎂 *Total:* ${tomorrowBirthdays.length} aniversariante(s)

👥 *Lista:*
${tomorrowBirthdays.map((b, i) => `${i + 1}. ${b.graduation} ${b.name} (${calculateAge(b.date) + 1} anos)`).join('\n')}

📱 *Lembretes enviados:* ${successCount}/${tomorrowBirthdays.length}
⏰ *Período:* ${periodo === '09:20' ? '09:20 Brasil' : periodo === '09:25' ? '09:25 Brasil' : periodo}

🎁 *Não esqueça de parabenizar todos amanhã!*

---
_Resumo automático PM_ 🎖️`;

            await sendWhatsAppMessage(CONFIG.twilio.toNumber, summaryMessage);
            console.log(`📋 Resumo de múltiplos aniversários enviado!`);
        }

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
_Sistema PM - Alerta de Erro_ ⚠️`;

            await sendWhatsAppMessage(CONFIG.twilio.toNumber, errorMessage);
        } catch (e) {
            console.error('❌ Erro ao enviar alerta de erro:', e);
        }
    }
}

// 🕘 CONFIGURAR CRON JOBS (CORRIGIDO para 09:20 e 09:25 Brasil no Render UTC) [[2]](#__2)
console.log('⏰ Configurando cron jobs para 09:20 e 09:25 Brasil...');

// 09:20 Brasil = 02:58 UTC (próximo dia) - Verificação 1 [[3]](#__3)
cron.schedule('20 12 * * *', () => {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🌙 EXECUÇÃO 09:20 BRASIL (02:58 UTC) - ${brasilTime}`);
    executeAutomaticCheck('09:20');
}, {
    timezone: "UTC"  // Render usa UTC
});

// 09:25 Brasil = 02:59 UTC (próximo dia) - Verificação 2
cron.schedule('25 12 * * *', () => {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🌅 EXECUÇÃO 09:25 BRASIL (02:59 UTC) - ${brasilTime}`);
    executeAutomaticCheck('09:25');
}, {
    timezone: "UTC"  // Render usa UTC
});

// Keep-alive a cada 2 horas (UTC)
cron.schedule('0 */2 * * *', () => {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🔍 Sistema ativo (keep-alive UTC) - Brasil: ${brasilTime}`);
}, {
    timezone: "UTC"
});

console.log(`⏰ Cron jobs configurados para Render (UTC):`);
console.log(`   🌙 02:58 UTC = 09:20 Brasil (Verificação 1)`);
console.log(`   🌅 02:59 UTC = 09:25 Brasil (Verificação 2)`);
console.log(`   🔄 Keep-alive a cada 2 horas UTC`);

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
        renderTimezone: 'UTC'
    });
});

// Página principal (ATUALIZADA)
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
                        <p>🎖️ <strong>${b.graduation} ${b.name}</strong> - ${calculateAge(b.date) + 1} anos</p>
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
            <title>Sistema PM 24/7 - 09:20/09:25</title>
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
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🎖️ Sistema PM 24/7 - 09:20/09:25!</h1>
                <p>Sistema de Aniversários da Polícia Militar</p>
            </div>
            
            <div class="status">
                <p><strong>Status:</strong> ✅ Online (Render FREE + Firebase)</p>
                <p><strong>Horário Brasil:</strong> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                <p><strong>UTC (Render):</strong> ${new Date().toISOString()}</p>
                <p><strong>Uptime:</strong> ${hours}h ${minutes}m</p>
                <p><strong>Keep-alive:</strong> ${CONFIG.keepAlive.enabled ? '✅ Ativo' : '❌ Desabilitado'}</p>
                <p><strong>Firebase:</strong> ${db ? '✅ Conectado' : '❌ Desconectado'}</p>
                <p><strong>Destinatário:</strong> ${CONFIG.twilio.toNumber}</p>
            </div>
            
            <div class="timezone">
                <h4>🌍 Conversão de Timezone (Brasil → UTC):</h4>
                <p>• <strong>09:20 Brasil</strong> = <strong>02:58 UTC</strong> (próximo dia)</p>
                <p>• <strong>09:25 Brasil</strong> = <strong>02:59 UTC</strong> (próximo dia)</p>
                <p><small>Brasil UTC-3 | Render usa UTC</small></p>
            </div>
            
            ${birthdayInfo}
            
            <div class="executions">
                <h3>⏰ Execuções Automáticas:</h3>
                <ul>
                    <li>🌙 <strong>09:20 Brasil (02:58 UTC)</strong> - Primeira verificação</li>
                    <li>🌅 <strong>09:25 Brasil (02:59 UTC)</strong> - Segunda verificação</li>
                </ul>
                <p><small>📅 <strong>Verificando para amanhã:</strong> ${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}</small></p>
            </div>
            
            <h3>🔧 Endpoints Disponíveis:</h3>
            <div class="endpoint"><a href="/test">🧪 /test</a> - Testar WhatsApp</div>
            <div class="endpoint"><a href="/test-2358">🌙 /test-2358</a> - Testar execução 09:20</div>
            <div class="endpoint"><a href="/test-2359">🌅 /test-2359</a> - Testar execução 09:25</div>
            <div class="endpoint"><a href="/birthdays">📋 /birthdays</a> - Ver todos os aniversários</div>
            <div class="endpoint"><a href="/check">🔍 /check</a> - Verificar agora (manual)</div>
            <div class="endpoint"><a href="/status">📊 /status</a> - Status JSON completo</div>
            <div class="endpoint"><a href="/ping">🔄 /ping</a> - Keep-alive</div>
            
            <hr>
            <p><small>💡 <strong>Sistema integrado:</strong> Firebase + Twilio + Render FREE funcionando 24/7</small></p>
            <p><small>🔧 <strong>Versão:</strong> 2.2.0 - 09:20/09:25 Brasil (UTC Render)</small></p>
        </body>
        </html>
    `);
});

// Endpoint para teste geral
app.get('/test', async (req, res) => {
    try {
        // Buscar dados do Firebase para incluir no teste
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        
        const testMessage = `🧪 *TESTE SISTEMA PM + FIREBASE* 🎖️

⏰ *Horário Brasil:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
🕐 *UTC (Render):* ${new Date().toISOString()}
🆓 *Plataforma:* Render FREE
🔥 *Firebase:* ${db ? 'Conectado ✅' : 'Desconectado ❌'}
📱 *WhatsApp:* Conectado via Twilio

📊 *Dados Atuais:*
• 📋 Total no banco: ${birthdays.length} aniversários
• 🎂 Amanhã (${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}): ${tomorrowBirthdays.length} aniversário(s)
${tomorrowBirthdays.length > 0 ? `• 🎖️ ${tomorrowBirthdays.map(b => `${b.graduation} ${b.name}`).join(', ')}` : ''}

⏰ *Execuções Automáticas:*
• 🌙 09:20 Brasil (02:58 UTC) - Verificação 1
• 🌅 09:25 Brasil (02:59 UTC) - Verificação 2

✅ *Sistema PM integrado funcionando perfeitamente!*

---
_Teste manual com dados reais - v2.2.0_ 🚀`;

        const result = await sendWhatsAppMessage(CONFIG.twilio.toNumber, testMessage);
        res.json({ 
            success: true, 
            message: 'Teste enviado com dados do Firebase!', 
            sid: result.sid,
            firebase: {
                connected: db !== null,
                totalBirthdays: birthdays.length,
                tomorrowBirthdays: tomorrowBirthdays.length
            },
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            utc: new Date().toISOString(),
            platform: 'Render FREE + Firebase',
                        version: '2.2.0'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Teste específico para 09:20
app.get('/test-2358', async (req, res) => {
    try {
        await executeAutomaticCheck('09:20');
        res.json({ 
            success: true, 
            message: 'Teste 09:20 Brasil (02:58 UTC) executado!',
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            utc: new Date().toISOString(),
            timezone: 'America/Sao_Paulo → UTC',
            renderTime: '02:58 UTC'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Teste específico para 09:25
app.get('/test-2359', async (req, res) => {
    try {
        await executeAutomaticCheck('09:25');
        res.json({ 
            success: true, 
            message: 'Teste 09:25 Brasil (02:59 UTC) executado!',
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            utc: new Date().toISOString(),
            timezone: 'America/Sao_Paulo → UTC',
            renderTime: '02:59 UTC'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint para verificar aniversários manualmente
app.get('/check', async (req, res) => {
    try {
        await executeAutomaticCheck('manual');
        res.json({ 
            success: true, 
            message: 'Verificação manual executada!',
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            utc: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
                name: b.name,
                graduation: b.graduation,
                date: b.date,
                age: calculateAge(b.date) + 1,
                phone: b.phone,
                relationship: b.relationship,
                unit: b.unit || 'Não informado'
            })),
            allBirthdays: birthdays.map(b => ({
                name: b.name,
                graduation: b.graduation,
                date: b.date,
                currentAge: calculateAge(b.date),
                phone: b.phone,
                relationship: b.relationship,
                unit: b.unit || 'Não informado'
            })),
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            checkingFor: new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Status completo do sistema
app.get('/status', async (req, res) => {
    try {
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        const uptime = process.uptime();
        const memory = process.memoryUsage();
        
        res.json({
            system: {
                status: 'online',
                version: '2.2.0',
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
                    '09:20_Brasil': '02:58_UTC_next_day',
                    '09:25_Brasil': '02:59_UTC_next_day'
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
                toNumber: CONFIG.twilio.toNumber
            },
            cronJobs: {
                '02:58_UTC': '09:20 Brasil - Verificação 1',
                '02:59_UTC': '09:25 Brasil - Verificação 2',
                keepAlive: 'A cada 2 horas UTC'
            },
            keepAlive: {
                enabled: CONFIG.keepAlive.enabled,
                interval: `${CONFIG.keepAlive.interval / 1000 / 60} minutos`
            },
            nextCheck: {
                date: new Date(Date.now() + 86400000).toLocaleDateString('pt-BR'),
                birthdays: tomorrowBirthdays.map(b => `${b.graduation} ${b.name}`)
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            timestamp: new Date().toISOString()
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
            'GET /test-2358',
            'GET /test-2359',
            'GET /check',
            'GET /birthdays',
            'GET /status',
            'GET /ping',
            'POST /webhook'
        ],
        timestamp: new Date().toISOString()
    });
});

// 🚀 INICIALIZAR SERVIDOR
async function startServer() {
    try {
        console.log('🎖️ === INICIANDO SISTEMA PM 24/7 v2.2.0 ===');
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
            console.log(`\n⏰ CRON JOBS ATIVOS:`);
            console.log(`   🌙 02:58 UTC = 09:20 Brasil (Verificação 1)`);
            console.log(`   🌅 02:59 UTC = 09:25 Brasil (Verificação 2)`);
            console.log(`   🔄 Keep-alive: a cada 2 horas UTC`);
            console.log(`\n🎖️ Sistema PM pronto para funcionar 24/7!`);
            console.log(`📋 Próxima verificação: ${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}`);
            console.log(`\n=== SISTEMA OPERACIONAL ===\n`);
        });
        
        // Teste inicial (opcional)
        setTimeout(async () => {
            try {
                console.log('🧪 Executando teste inicial do sistema...');
                const birthdays = await getBirthdaysFromFirebase();
                console.log(`📋 ${birthdays.length} aniversários carregados do Firebase`);
                
                const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
                if (tomorrowBirthdays.length > 0) {
                    console.log(`🎂 ${tomorrowBirthdays.length} aniversário(s) amanhã: ${tomorrowBirthdays.map(b => `${b.graduation} ${b.name}`).join(', ')}`);
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

