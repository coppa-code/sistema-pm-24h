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

// 🛡️ CONTROLE DE LIMITE TWILIO MELHORADO
let dailyMessageCount = 0;
const MAX_DAILY_MESSAGES = 3; // ⚠️ REDUZIDO PARA EVITAR LIMITE
let twilioLimitReached = false;

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

// Reset flags às 00:00 UTC
cron.schedule('0 0 * * *', () => {
    dailyMessageCount = 0;
    twilioLimitReached = false; // ✅ RESETAR FLAG TWILIO
    console.log('🔄 Contador de mensagens e flag Twilio resetados para novo dia');
}, {
    timezone: "UTC"
});
