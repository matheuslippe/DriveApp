document.addEventListener('DOMContentLoaded', () => {
    // FIREBASE CONFIG - COLE O SEU AQUI
const firebaseConfig = {
  apiKey: "AIzaSyDotk1gv71EBK6pY0O4CCvbsYRntqFDkLk",
  authDomain: "malipersonalisae.firebaseapp.com",
  projectId: "malipersonalisae",
  storageBucket: "malipersonalisae.firebasestorage.app",
  messagingSenderId: "875193186763",
  appId: "1:875193186763:web:7003023a1baca7426cde4e",
  measurementId: "G-T90VDJ3SCE"
};

    // INICIALIZAÇÃO
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    let userId = null, entriesListener = null, settingsListener = null, currentEditId = null;

    // SELETORES DO DOM
    const authContainer = document.getElementById('auth-container'), appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form'), signupForm = document.getElementById('signup-form'), toggleAuthLink = document.getElementById('toggle-auth'), authError = document.getElementById('auth-error');
    const userEmailSpan = document.getElementById('user-email'), logoutButton = document.getElementById('logout-button');
    const form = document.getElementById('entry-form'), tableBody = document.querySelector('#entries-table tbody');
    const dashboard = document.getElementById('dashboard'), filter = document.getElementById('filter'), exportBtn = document.getElementById('export-csv');
    const dateInput = document.getElementById('date'), horasInput = document.getElementById('horas');
    const recurringForm = document.getElementById('recurring-form'), aluguelSemanalInput = document.getElementById('aluguel-semanal');
    const goalForm = document.getElementById('goal-form'), goalInput = document.getElementById('goal-input'), goalProgressContainer = document.getElementById('goal-progress-container');
    const editModal = document.getElementById('edit-modal'), editForm = document.getElementById('edit-form'), cancelEditBtn = document.getElementById('cancel-edit');
    const generateReportBtn = document.getElementById('generate-ai-report'), aiReportContainer = document.getElementById('ai-report-container'), aiReportContent = document.getElementById('ai-report-content');
    
    let localEntries = [], userSettings = { aluguelSemanal: 0, ganhosMetaMensal: 0 };
    let sortConfig = { key: 'date', direction: 'desc' };
    let lucroChart, gastosChart, weeklyGoalChart;
    let currentDashboardData = {};

    // --- PLUGIN DO GRÁFICO ---
    const doughnutLabel = { id: 'doughnutLabel', afterDraw(chart) { const {ctx} = chart; const pO = chart.config.options.plugins.doughnutLabel; if (pO && pO.text) { const {chartArea:{top,width,height}} = chart; ctx.save(); ctx.font = 'bold 2rem var(--font-family)'; ctx.fillStyle = '#F5F5F5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(pO.text, width/2, height/2+top); ctx.restore(); } } };
    Chart.register(doughnutLabel);

    // --- AUTENTICAÇÃO ---
    auth.onAuthStateChanged(user => {
        if (user) {
            userId = user.uid;
            userEmailSpan.textContent = user.email;
            authContainer.classList.add('hidden'); appContainer.classList.remove('hidden');
            setupListeners(userId);
        } else {
            userId = null;
            authContainer.classList.remove('hidden'); appContainer.classList.add('hidden');
            if (entriesListener) entriesListener(); if (settingsListener) settingsListener();
        }
    });
    // (Restante da lógica de autenticação)
    loginForm.addEventListener('submit', e => { e.preventDefault(); handleAuth(loginForm, auth.signInWithEmailAndPassword.bind(auth)); });
    signupForm.addEventListener('submit', e => { e.preventDefault(); handleAuth(signupForm, auth.createUserWithEmailAndPassword.bind(auth)); });
    logoutButton.addEventListener('click', () => auth.signOut());
    toggleAuthLink.addEventListener('click', e => { e.preventDefault(); loginForm.classList.toggle('hidden'); signupForm.classList.toggle('hidden'); authError.textContent = ''; toggleAuthLink.textContent = signupForm.classList.contains('hidden') ? "Não tem uma conta? Registe-se" : "Já tem uma conta? Faça login"; });
    function handleAuth(form, authFn) { const email = form.querySelector('input[type="email"]').value, password = form.querySelector('input[type="password"]').value, button = form.querySelector('button'), buttonText = button.textContent; authError.textContent = ''; button.disabled = true; button.textContent = 'Aguarde...'; authFn(email, password).catch(showAuthError).finally(() => { button.disabled = false; button.textContent = buttonText; }); }
    function showAuthError(error) { console.error("Erro de autenticação detalhado:", error); let message = "Ocorreu um erro. Tente novamente."; switch (error.code) { case 'auth/wrong-password': message = "Senha incorreta."; break; case 'auth/user-not-found': message = "Nenhum utilizador encontrado com este e-mail."; break; case 'auth/invalid-email': message = "O formato do e-mail é inválido."; break; case 'auth/weak-password': message = "A senha precisa de ter pelo menos 6 caracteres."; break; case 'auth/email-already-in-use': message = "Este e-mail já está em uso."; break; } authError.textContent = message; }
    
    // --- BANCO DE DADOS ---
    function setupListeners(uid) {
        entriesListener = db.collection('users').doc(uid).collection('entries').orderBy('date', 'desc').onSnapshot(snap => { localEntries = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, console.error);
        settingsListener = db.collection('users').doc(uid).onSnapshot(doc => { if (doc.exists && doc.data()) { userSettings = { aluguelSemanal: 0, ganhosMetaMensal: 0, ...doc.data() }; aluguelSemanalInput.value = userSettings.aluguelSemanal > 0 ? userSettings.aluguelSemanal : ''; goalInput.value = userSettings.ganhosMetaMensal > 0 ? userSettings.ganhosMetaMensal : ''; render(); } }, console.error);
    }
    
    // --- LÓGICA DO APP (Funções Utilitárias e de Renderização) ---
    const formatCurrency = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), formatDate = ds => { if(!ds) return ''; const [y,m,d]=ds.split('-'); return `${d}/${m}/${y}`; }, parseTimeToDecimal = t => { if(!t) return 0; const [h,m]=t.split(':').map(Number); return (h||0)+(m||0)/60; }, formatDecimalToTime = d => { const h=Math.floor(d),m=Math.round((d-h)*60); return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }, getWeekIdentifier = d => { d=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())); d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7)); const yS=new Date(Date.UTC(d.getUTCFullYear(),0,1)); return `${d.getUTCFullYear()}-${Math.ceil((((d-yS)/864e5)+1)/7)}`; };
    function render() { renderTable(); updateDashboard(); }
    function getFilteredEntries() { const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),firstDayThisMonth=new Date(now.getFullYear(),now.getMonth(),1),firstDayLastMonth=new Date(now.getFullYear(),now.getMonth()-1,1),lastDayLastMonth=new Date(now.getFullYear(),now.getMonth(),0),sevenDaysAgo=new Date(today);sevenDaysAgo.setDate(today.getDate()-6); const fv=filter.value; if(fv==='all')return localEntries; return localEntries.filter(e=>{const ed=new Date(e.date+'T00:00:00-03:00');switch(fv){case'this_month':return ed>=firstDayThisMonth&&ed<=now;case'last_month':return ed>=firstDayLastMonth&&ed<=lastDayLastMonth;case'today':return ed.getTime()===today.getTime();case'last_7_days':return ed>=sevenDaysAgo&&ed<=today;default:return true;}}); }
    function renderTable() { const fE=getFilteredEntries(); fE.sort((a,b)=>{let av=a[sortConfig.key],bv=b[sortConfig.key];if(sortConfig.key==='date'){av=new Date(av);bv=new Date(bv);}return(av<bv?-1:av>bv?1:0)*(sortConfig.direction==='asc'?1:-1);}); tableBody.innerHTML=''; if(fE.length===0){tableBody.innerHTML='<tr><td colspan="8" style="text-align:center">Nenhum lançamento encontrado.</td></tr>';return;} fE.forEach(e=>{const r=document.createElement('tr');r.innerHTML=`<td>${formatDate(e.date)}</td><td>${formatCurrency(e.ganhos)}</td><td>${e.km.toFixed(1)} km</td><td>${formatDecimalToTime(e.horas)}</td><td>${formatCurrency(e.combustivel)}</td><td>${formatCurrency(e.outros)}</td><td class='${e.lucro>=0?'lucro':'gasto'}'>${formatCurrency(e.lucro)}</td><td><button class='edit-btn' data-id='${e.id}'>✏️</button><button class='delete-btn' data-id='${e.id}'>🗑️</button></td>`;tableBody.appendChild(r);}); }
    
    function updateDashboard() {
        const filteredEntries = getFilteredEntries();
        const totalGanhos = filteredEntries.reduce((s, e) => s + e.ganhos, 0); const totalCombustivel = filteredEntries.reduce((s, e) => s + e.combustivel, 0); const totalOutros = filteredEntries.reduce((s, e) => s + e.outros, 0); const totalKm = filteredEntries.reduce((s, e) => s + e.km, 0); const totalHoras = filteredEntries.reduce((s, e) => s + e.horas, 0); let totalAluguel = 0;
        if (filteredEntries.length > 0 && userSettings.aluguelSemanal > 0) { const uW = new Set(); filteredEntries.forEach(e => uW.add(getWeekIdentifier(new Date(e.date + 'T00:00:00-03:00')))); totalAluguel = uW.size * userSettings.aluguelSemanal; }
        const totalGastos = totalCombustivel + totalOutros + totalAluguel; const totalLucroLiquido = totalGanhos - totalGastos; const ganhosPorKm = totalKm > 0 ? totalGanhos / totalKm : 0; const ganhosPorHora = totalHoras > 0 ? totalGanhos / totalHoras : 0; const lucroPorKm = totalKm > 0 ? totalLucroLiquido / totalKm : 0;
        
        currentDashboardData = { totalGanhos, totalCombustivel, totalOutros, totalAluguel, totalGastos, totalLucroLiquido, totalKm, totalHoras, ganhosPorKm, ganhosPorHora, lucroPorKm };
        
        dashboard.innerHTML = `<div class='stat-card'><h3>Lucro Líquido</h3><p class='lucro'>${formatCurrency(totalLucroLiquido)}</p></div><div class='stat-card'><h3>Ganhos Totais</h3><p>${formatCurrency(totalGanhos)}</p></div><div class='stat-card'><h3>Gastos Totais</h3><p class='gasto'>${formatCurrency(totalGastos)}</p></div><div class='stat-card'><h3>Ganhos por Km</h3><p>${formatCurrency(ganhosPorKm)}</p></div><div class='stat-card'><h3>Ganhos por Hora</h3><p>${formatCurrency(ganhosPorHora)}</p></div><div class='stat-card'><h3>Lucro por Km</h3><p class='${lucroPorKm >= 0 ? 'lucro' : 'gasto'}'>${formatCurrency(lucroPorKm)}</p></div><div class='stat-card'><h3>Total Km</h3><p>${totalKm.toFixed(1)}</p></div><div class='stat-card'><h3>Total Horas</h3><p>${formatDecimalToTime(totalHoras)}</p></div>`;
        const currentWeekId = getWeekIdentifier(new Date()); const currentWeekEntries = localEntries.filter(e => getWeekIdentifier(new Date(e.date + 'T00:00:00-03:00')) === currentWeekId); const currentWeekGanhos = currentWeekEntries.reduce((s, e) => s + e.ganhos, 0);
        updateCharts(filteredEntries, { totalCombustivel, totalOutros, totalAluguel }, { currentWeekGanhos });
        updateGoalProgress(totalGanhos);
    }
    
    function updateGoalProgress(currentGanhos) { if(filter.value==='this_month'&&userSettings.ganhosMetaMensal>0){const m=userSettings.ganhosMetaMensal,p=Math.min((currentGanhos/m)*100,100);goalProgressContainer.innerHTML=`<div class="goal-text"><span>Meta Mensal</span><span>${formatCurrency(currentGanhos)} / ${formatCurrency(m)}</span></div><div class="progress-bar"><div class="progress-bar-inner" style="width:${p}%;"></div></div>`;goalProgressContainer.classList.remove('hidden');}else{goalProgressContainer.classList.add('hidden');} }
    function updateCharts(data, expenseTotals, goalData) { const textColor='#8b949e',gridColor='rgba(139,148,158,0.2)',chartBg='#1C1C1C'; const ctxLucro=document.getElementById('lucroChart').getContext('2d'),ctxGastos=document.getElementById('gastosChart').getContext('2d'),ctxWeeklyGoal=document.getElementById('weeklyGoalChart').getContext('2d'); if(lucroChart)lucroChart.destroy();if(gastosChart)gastosChart.destroy();if(weeklyGoalChart)weeklyGoalChart.destroy(); const sortedData=[...data].sort((a,b)=>new Date(a.date)-new Date(b.date)); lucroChart=new Chart(ctxLucro,{type:'bar',data:{labels:sortedData.map(e=>formatDate(e.date)),datasets:[{label:'Lucro Bruto Diário',data:sortedData.map(e=>e.lucro),backgroundColor:sortedData.map(e=>e.lucro>=0?'#4CAF50':'#D32F2F'),borderRadius:4,}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Lucro Bruto (Filtrado)',color:textColor,font:{size:14}}},scales:{y:{beginAtZero:true,ticks:{color:textColor},grid:{color:gridColor}},x:{ticks:{color:textColor},grid:{color:'transparent'}}}}}); if(Object.values(expenseTotals).some(v=>v>0)){gastosChart=new Chart(ctxGastos,{type:'doughnut',data:{labels:['Combustível','Outros','Aluguer'],datasets:[{data:[expenseTotals.totalCombustivel,expenseTotals.totalOutros,expenseTotals.totalAluguel],backgroundColor:['#F57C00','#757575','#D32F2F'],borderColor:chartBg,borderWidth:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:true,text:'Distribuição de Gastos',color:textColor,font:{size:14}},legend:{position:'top',labels:{color:textColor}}}}});} const weeklyGoal=userSettings.ganhosMetaMensal/4.33; if(weeklyGoal>0){const progresso=goalData.currentWeekGanhos,restante=Math.max(0,weeklyGoal-progresso),percentage=weeklyGoal>0?Math.round((progresso/weeklyGoal)*100):0;weeklyGoalChart=new Chart(ctxWeeklyGoal,{type:'doughnut',data:{labels:['Alcançado','Faltam'],datasets:[{data:[progresso,restante],backgroundColor:['#4CAF50','rgba(139,148,158,0.2)'],borderColor:chartBg,borderWidth:5}]},options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{title:{display:true,text:'Meta da Semana Atual',color:textColor,font:{size:14}},legend:{display:false},tooltip:{enabled:false},doughnutLabel:{text:`${percentage}%`}}}});} }

    // --- LÓGICA DA IA ---
    async function generateAIReport() {
        const spinner = aiReportContainer.querySelector('.spinner-container');
        aiReportContent.innerHTML = '';
        aiReportContainer.classList.remove('hidden');
        spinner.classList.remove('hidden');
        generateReportBtn.disabled = true;

        const filteredEntries = getFilteredEntries();
        if (filteredEntries.length === 0) {
            aiReportContent.innerHTML = "<p>Não há dados suficientes no período selecionado para gerar uma análise.</p>";
            spinner.classList.add('hidden');
            generateReportBtn.disabled = false;
            return;
        }

        const dataSummary = `
        - Período do Filtro: ${filter.options[filter.selectedIndex].text}
        - Lucro Líquido Total: ${formatCurrency(currentDashboardData.totalLucroLiquido)}
        - Ganhos Totais: ${formatCurrency(currentDashboardData.totalGanhos)}
        - Gastos Totais: ${formatCurrency(currentDashboardData.totalGastos)} (Combustível: ${formatCurrency(currentDashboardData.totalCombustivel)}, Aluguer: ${formatCurrency(currentDashboardData.totalAluguel)}, Outros: ${formatCurrency(currentDashboardData.totalOutros)})
        - Total de Horas Trabalhadas: ${formatDecimalToTime(currentDashboardData.totalHoras)}
        - Total de Km Rodados: ${currentDashboardData.totalKm.toFixed(1)} km
        - Média de Ganhos por Hora: ${formatCurrency(currentDashboardData.ganhosPorHora)}
        - Média de Ganhos por Km: ${formatCurrency(currentDashboardData.ganhosPorKm)}
        `;

        const prompt = `
        Você é um consultor financeiro especialista em otimizar os ganhos de motoristas de aplicativo.
        Analise os seguintes dados financeiros de um motorista para o período selecionado.

        DADOS FINANCEIROS:
        ${dataSummary}

        Com base nestes dados, forneça um relatório conciso e fácil de entender em formato Markdown, com os seguintes pontos:

        ###  análise Rápida
        Faça um resumo de uma ou duas frases sobre o desempenho geral no período.

        ### 🎯 Pontos Fortes
        - Destaque 1 ou 2 métricas positivas (ex: bom R$/Km, dias de alto lucro, controlo de custos) e explique por que são boas.

        ### ⚠️ Pontos de Melhoria
        - Identifique 1 ou 2 áreas onde há oportunidade de melhoria (ex: gastos com combustível acima da média, baixo R$/Hora) e explique o impacto.

        ###  actionable Plan
        - Sugira 2 ou 3 ações **práticas e específicas** que o motorista pode tomar para aumentar o seu lucro líquido, baseando-se diretamente nos dados apresentados.
        `;

        try {
            const result = await gemini.generateContent({
                contents: [{
                    role: 'user', 
                    parts: [{ text: prompt }]
                }],
            });
            const text = await result.response.text();
            aiReportContent.innerHTML = marked.parse(text); // Usa a biblioteca Marked para converter Markdown para HTML
        } catch (error) {
            console.error("Erro ao gerar relatório de IA:", error);
            aiReportContent.textContent = "Desculpe, não foi possível gerar a análise neste momento. Tente novamente mais tarde.";
        } finally {
            spinner.classList.add('hidden');
            generateReportBtn.disabled = false;
        }
    }

    // --- EVENT LISTENERS ---
    // (Restante dos listeners: forms, tabela, etc.)
    form.addEventListener('submit',e=>{e.preventDefault();if(!userId)return;const nE={date:dateInput.value,ganhos:parseFloat(ganhos.value)||0,km:parseFloat(km.value)||0,horas:parseTimeToDecimal(horas.value),combustivel:parseFloat(combustivel.value)||0,outros:parseFloat(outros.value)||0,};nE.lucro=nE.ganhos-nE.combustivel-nE.outros;db.collection('users').doc(userId).collection('entries').add(nE).catch(console.error);form.reset();dateInput.valueAsDate=new Date();horasInput.value="00:00";});
    recurringForm.addEventListener('submit',e=>{e.preventDefault();if(!userId)return;db.collection('users').doc(userId).set({aluguelSemanal:parseFloat(aluguelSemanalInput.value)||0},{merge:true}).catch(console.error);});
    goalForm.addEventListener('submit',e=>{e.preventDefault();if(!userId)return;db.collection('users').doc(userId).set({ganhosMetaMensal:parseFloat(goalInput.value)||0},{merge:true}).catch(console.error);});
    tableBody.addEventListener('click',e=>{if(e.target.closest('.delete-btn')){const id=e.target.closest('.delete-btn').dataset.id;if(!userId||!id)return;if(confirm('Tem a certeza que quer apagar?')){db.collection('users').doc(userId).collection('entries').doc(id).delete().catch(console.error);}}
    if(e.target.closest('.edit-btn')){const id=e.target.closest('.edit-btn').dataset.id;openEditModal(id);}});
    function openEditModal(id){currentEditId=id;const entry=localEntries.find(e=>e.id===id);if(!entry)return;editModal.querySelector('#edit-date').value=entry.date;editModal.querySelector('#edit-ganhos').value=entry.ganhos;editModal.querySelector('#edit-km').value=entry.km;editModal.querySelector('#edit-horas').value=formatDecimalToTime(entry.horas);editModal.querySelector('#edit-combustivel').value=entry.combustivel;editModal.querySelector('#edit-outros').value=entry.outros;editModal.classList.remove('hidden');}
    function closeEditModal(){editModal.classList.add('hidden');currentEditId=null;}
    cancelEditBtn.addEventListener('click',closeEditModal);editModal.addEventListener('click',e=>{if(e.target===editModal){closeEditModal();}});
    editForm.addEventListener('submit',e=>{e.preventDefault();if(!userId||!currentEditId)return;const uE={date:editModal.querySelector('#edit-date').value,ganhos:parseFloat(editModal.querySelector('#edit-ganhos').value)||0,km:parseFloat(editModal.querySelector('#edit-km').value)||0,horas:parseTimeToDecimal(editModal.querySelector('#edit-horas').value),combustivel:parseFloat(editModal.querySelector('#edit-combustivel').value)||0,outros:parseFloat(editModal.querySelector('#edit-outros').value)||0,};uE.lucro=uE.ganhos-uE.combustivel-uE.outros;db.collection('users').doc(userId).collection('entries').doc(currentEditId).update(uE).then(closeEditModal).catch(console.error);});
    filter.addEventListener('change',render);document.querySelector('#entries-table thead').addEventListener('click',e=>{if(e.target.tagName==='TH'&&e.target.dataset.sort){const nK=e.target.dataset.sort;if(sortConfig.key===nK){sortConfig.direction=sortConfig.direction==='asc'?'desc':'asc';}else{sortConfig.key=nK;sortConfig.direction='desc';}document.querySelectorAll('#entries-table th[data-sort]').forEach(th=>th.innerHTML=th.innerHTML.replace('🔽','').replace('🔼',''));e.target.innerHTML+=sortConfig.direction==='desc'?' 🔽':' 🔼';renderTable();}});
    exportBtn.addEventListener('click',()=>{const fE=getFilteredEntries();if(fE.length===0){alert('Não há dados para exportar.');return;}const h=['Data','Ganhos(R$)','Km Rodados','Horas Trabalhadas','Combustivel(R$)','Outros Gastos(R$)','Lucro Bruto Dia(R$)'];const r=fE.map(e=>[e.date,e.ganhos,e.km,formatDecimalToTime(e.horas),e.combustivel,e.outros,e.lucro]);let c='data:text/csv;charset=utf-8,'+h.join(',')+'\n'+r.map(r=>r.join(',')).join('\n');const uE=encodeURI(c);const l=document.createElement('a');l.setAttribute('href',uE);l.setAttribute('download','meu_controlo_financeiro.csv');document.body.appendChild(l);l.click();document.body.removeChild(l);});
    generateReportBtn.addEventListener('click', generateAIReport);

    // --- INICIALIZAÇÃO ---
    dateInput.valueAsDate = new Date();
});
