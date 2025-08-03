// server.js - Sistema PM CORRIGIDO para Render
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
        toNumber: process.env.TWILIO_TO_NUMBER || 'whatsapp:+557181478028' // CORRIGIDO: adicionado whatsapp:
    },
    notification: {
        timing: process.env.NOTIFICATION_TIMING || '1-day',
        sendTime: process.env.NOTIFICATION_TIME || '23:51'
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
    // Usar timezone do Brasil
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

// 💬 CRIAR MENSAGEM PERSONALIZADA PARA ANIVERSÁRIO
function createBirthdayMessage(birthday, periodo = 'padrão') {
    const age = calculateAge(birthday.date);
    const nextAge = age + 1;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const periodoEmoji = periodo === 'manhã' ? '🌅' : 
                        periodo === 'noite' ? '🌙' : '🎂';
    
    const periodoTexto = periodo === 'manhã' ? '(Lembrete Matinal)' : 
                        periodo === 'noite' ? '(Lembrete Noturno)' : 
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
_Sistema PM 24/7 - ${periodo.charAt(0).toUpperCase() + periodo.slice(1)}_ 🎖️
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

⏰ *Execução:* ${periodo === 'manhã' ? '23:57 (Manhã)' : periodo === 'noite' ? '23:55 (Noite)' : 'Automático'}
📋 *Aniversários no banco:* ${allBirthdays.length}
🔍 *Verificado para amanhã:* 0 aniversários
🗓️ *Data verificada:* ${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}

✅ *Sistema funcionando! Conectado ao Firebase!*
🌍 *Timezone:* America/Sao_Paulo
🆓 *Platform:* Render FREE

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
⏰ *Período:* ${periodo.charAt(0).toUpperCase() + periodo.slice(1)}

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

// 🕘 CONFIGURAR CRON JOBS (CORRIGIDO para Render)
console.log('⏰ Configurando cron jobs...');

// Executa todos os dias às 23:57 (manhã) - horário do Brasil
cron.schedule('0 9 * * *', () => {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🌅 EXECUÇÃO MANHÃ (23:57) - ${brasilTime}`);
    executeAutomaticCheck('manhã');
}, {
    timezone: "America/Sao_Paulo"
});

// Executa todos os dias às 23:55 (noite) - horário do Brasil
cron.schedule('40 22 * * *', () => {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🌙 EXECUÇÃO NOITE (23:55) - ${brasilTime}`);
    executeAutomaticCheck('noite');
}, {
    timezone: "America/Sao_Paulo"
});

// Verificação a cada 2 horas para manter ativo
cron.schedule('0 */2 * * *', () => {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🔍 Sistema ativo (verificação) - ${brasilTime}`);
}, {
    timezone: "America/Sao_Paulo"
});

// 🌐 ROTAS WEB
app.use(express.json());

// Rota para keep-alive
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'alive', 
        timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        uptime: process.uptime(),
        keepAlive: CONFIG.keepAlive.enabled,
        memory: process.memoryUsage(),
        timezone: 'America/Sao_Paulo'
    });
});

// Página principal
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
            <title>Sistema PM 24/7</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; max-width: 900px; margin: 50px auto; padding: 20px; }
                .header { text-align: center; background: #007bff; color: white; padding: 20px; border-radius: 10px; }
                .status { background: #d4edda; padding: 15px; margin: 20px 0; border-radius: 5px; }
                .endpoint { background: #f8f9fa; padding: 10px; margin: 10px 0; border-radius: 5px; }
                a { color: #007bff; text-decoration: none; }
                a:hover { text-decoration: underline; }
                .executions { background: #e7f3ff; padding: 15px; margin: 15px 0; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🎖️ Sistema PM 24/7 COM FIREBASE!</h1>
                <p>Sistema de Aniversários da Polícia Militar</p>
            </div>
            
            <div class="status">
                <p><strong>Status:</strong> ✅ Online (Render FREE + Firebase)</p>
                <p><strong>Horário Brasil:</strong> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                <p><strong>Uptime:</strong> ${hours}h ${minutes}m</p>
                <p><strong>Keep-alive:</strong> ${CONFIG.keepAlive.enabled ? '✅ Ativo' : '❌ Desabilitado'}</p>
                <p><strong>Firebase:</strong> ${db ? '✅ Conectado' : '❌ Desconectado'}</p>
                <p><strong>Destinatário:</strong> ${CONFIG.twilio.toNumber}</p>
                <p><strong>Timezone:</strong> America/Sao_Paulo</p>
            </div>
            
            ${birthdayInfo}
            
            <div class="executions">
                <h3>⏰ Execuções Automáticas (Horário Brasil):</h3>
                <ul>
                    <li>🌅 <strong>23:57</strong> - Verificação matinal (busca aniversários de amanhã)</li>
                    <li>🌙 <strong>23:55</strong> - Verificação noturna (segunda verificação)</li>
                </ul>
                <p><small>📅 <strong>Verificando para amanhã:</strong> ${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}</small></p>
            </div>
            
            <h3>🔧 Endpoints Disponíveis:</h3>
            <div class="endpoint"><a href="/test">🧪 /test</a> - Testar WhatsApp</div>
            <div class="endpoint"><a href="/birthdays">📋 /birthdays</a> - Ver todos os aniversários</div>
            <div class="endpoint"><a href="/check">🔍 /check</a> - Verificar agora (manual)</div>
            <div class="endpoint"><a href="/check?periodo=manhã">🌅 /check?periodo=manhã</a> - Simular execução matinal</div>
            <div class="endpoint"><a href="/check?periodo=noite">🌙 /check?periodo=noite</a> - Simular execução noturna</div>
            <div class="endpoint"><a href="/status">📊 /status</a> - Status JSON completo</div>
            <div class="endpoint"><a href="/ping">🔄 /ping</a> - Keep-alive</div>
            
            <hr>
            <p><small>💡 <strong>Sistema integrado:</strong> Firebase + Twilio + Render FREE funcionando 24/7</small></p>
            <p><small>🔧 <strong>Versão:</strong> 2.1.0 - Corrigido para Render</small></p>
        </body>
        </html>
    `);
});

// Endpoint para teste
app.get('/test', async (req, res) => {
    try {
        // Buscar dados do Firebase para incluir no teste
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        
        const testMessage = `🧪 *TESTE SISTEMA PM + FIREBASE* 🎖️

⏰ *Horário Brasil:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
🆓 *Plataforma:* Render FREE
🔥 *Firebase:* ${db ? 'Conectado ✅' : 'Desconectado ❌'}
📱 *WhatsApp:* Conectado via Twilio

📊 *Dados Atuais:*
• 📋 Total no banco: ${birthdays.length} aniversários
• 🎂 Amanhã (${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')}): ${tomorrowBirthdays.length} aniversário(s)
${tomorrowBirthdays.length > 0 ? `• 🎖️ ${tomorrowBirthdays.map(b => `${b.graduation} ${b.name}`).join(', ')}` : ''}

⏰ *Execuções Automáticas (Brasil):*
• 🌅 23:57 - Verificação matinal
• 🌙 23:55 - Verificação noturna

✅ *Sistema PM integrado funcionando perfeitamente!*

---
_Teste manual com dados reais - v2.1.0_ 🚀`;

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
            platform: 'Render FREE + Firebase',
            version: '2.1.0'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        });
    }
});

// Endpoint para verificação manual
// Continuação do endpoint /check
app.get('/check', async (req, res) => {
    try {
        const periodo = req.query.periodo || 'manual';
        await executeAutomaticCheck(periodo);
        res.json({ 
            success: true, 
            message: `Verificação ${periodo} executada com sucesso!`,
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        });
    }
});

// Status do sistema
app.get('/status', async (req, res) => {
    try {
        // Buscar dados atuais do Firebase
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        
        res.json({
            status: 'online',
            platform: 'Render FREE',
            keepAlive: CONFIG.keepAlive.enabled,
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            timezone: 'America/Sao_Paulo',
            firebase: {
                connected: db !== null,
                totalBirthdays: birthdays.length,
                tomorrowBirthdays: tomorrowBirthdays.length,
                nextBirthdays: tomorrowBirthdays.map(b => ({
                    name: `${b.graduation} ${b.name}`,
                    age: calculateAge(b.date) + 1,
                    relationship: b.relationship
                }))
            },
            config: {
                timing: CONFIG.notification.timing,
                executions: [
                    { time: '23:57', description: 'Verificação matinal' },
                    { time: '23:55', description: 'Verificação noturna' }
                ],
                toNumber: CONFIG.twilio.toNumber
            },
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: '2.1.0 - Corrigido para Render'
        });
    } catch (error) {
        res.json({
            status: 'online',
            error: error.message,
            firebase: { connected: false },
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        });
    }
});

// Endpoint: listar aniversários
app.get('/birthdays', async (req, res) => {
    try {
        const birthdays = await getBirthdaysFromFirebase();
        const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
        
        res.json({
            success: true,
            total: birthdays.length,
            tomorrowCount: tomorrowBirthdays.length,
            tomorrow: tomorrowBirthdays.map(b => ({
                graduation: b.graduation,
                name: b.name,
                age: calculateAge(b.date) + 1,
                phone: b.phone,
                relationship: b.relationship,
                unit: b.unit || 'N/A'
            })),
            all: birthdays.map(b => ({
                graduation: b.graduation,
                name: b.name,
                date: b.date,
                age: calculateAge(b.date),
                relationship: b.relationship
            })),
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        });
    }
});

// 🚀 INICIAR SERVIDOR
app.listen(PORT, async () => {
    const brasilTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`🎖️ Sistema PM iniciado na porta ${PORT}`);
    console.log(`⏰ Horário Brasil: ${brasilTime}`);
    console.log(`⏰ Cron jobs configurados:`);
    console.log(`   🌅 23:57 - Verificação matinal`);
    console.log(`   🌙 23:55 - Verificação noturna`);
    console.log(`📱 Destinatário: ${CONFIG.twilio.toNumber}`);
    console.log(`🌍 Timezone: America/Sao_Paulo`);
    console.log(`🆓 Render FREE - Sistema ativo!`);
    
    // Inicializar Firebase
    console.log('🔥 Conectando ao Firebase...');
    const firebaseConnected = await initializeFirebase();
    
    if (firebaseConnected) {
        console.log('✅ Firebase conectado com sucesso!');
        
        // Teste inicial: buscar aniversários
        try {
            const birthdays = await getBirthdaysFromFirebase();
            console.log(`📋 ${birthdays.length} aniversários encontrados no banco`);
            
            // Verificar se tem aniversário AMANHÃ
            const tomorrowBirthdays = checkTomorrowBirthdays(birthdays);
            if (tomorrowBirthdays.length > 0) {
                console.log(`🎂 ATENÇÃO: ${tomorrowBirthdays.length} aniversário(s) AMANHÃ!`);
                tomorrowBirthdays.forEach(b => {
                    console.log(`   🎖️ ${b.graduation} ${b.name} (${calculateAge(b.date) + 1} anos)`);
                });
            } else {
                console.log(`📅 Nenhum aniversário amanhã (${new Date(Date.now() + 86400000).toLocaleDateString('pt-BR')})`);
            }
        } catch (error) {
            console.error('❌ Erro no teste inicial Firebase:', error);
        }
    } else {
        console.log('❌ Firebase não conectado - sistema funcionará em modo teste');
    }
    
    // Iniciar keep-alive
    startKeepAlive();
    
    console.log(`✅ SISTEMA PM COM FIREBASE E DUPLA EXECUÇÃO FUNCIONANDO!`);
    console.log(`🔧 Versão: 2.1.0 - Corrigido para Render`);
});

// Tratamento de erros
process.on('uncaughtException', (error) => {
    console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promessa rejeitada:', reason);
});

console.log('🎖️ Sistema PM carregado com sucesso! Versão 2.1.0');

