document.addEventListener('DOMContentLoaded', () => {
    // FIREBASE CONFIG - COLE O SEU AQUI
const firebaseConfig = {
  apiKey: "AIzaSyALWKHaDpx7TI2hktGB4yPZW2TmxfyG3Fg",
  authDomain: "meu-controle-de-motorista.firebaseapp.com",
  projectId: "meu-controle-de-motorista",
  storageBucket: "meu-controle-de-motorista.firebasestorage.app",
  messagingSenderId: "228090160448",
  appId: "1:228090160448:web:c5d0656d235043b5ba86a5"
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
    
    let localEntries = [], userSettings = { aluguelSemanal: 0, ganhosMetaMensal: 0 };
    let sortConfig = { key: 'date', direction: 'desc' };
    let lucroChart, gastosChart, weeklyGoalChart;

    // --- PLUGIN DO GRÁFICO PARA TEXTO NO CENTRO ---
    const doughnutLabel = {
        id: 'doughnutLabel',
        afterDraw(chart, args, options) {
            const { ctx } = chart;
            // CORREÇÃO: Verificação mais segura para evitar erros em outros gráficos
            const pluginOptions = chart.config.options.plugins.doughnutLabel;

            if (pluginOptions && pluginOptions.text) {
                const { chartArea: { top, right, bottom, left, width, height } } = chart;
                ctx.save();
                ctx.font = options.font || 'bold 2rem var(--font-family)';
                ctx.fillStyle = options.color || '#F5F5F5';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(pluginOptions.text, width / 2, height / 2 + top);
                ctx.restore();
            }
        }
    };
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
    loginForm.addEventListener('submit', e => { e.preventDefault(); handleAuth(loginForm, auth.signInWithEmailAndPassword.bind(auth)); });
    signupForm.addEventListener('submit', e => { e.preventDefault(); handleAuth(signupForm, auth.createUserWithEmailAndPassword.bind(auth)); });
    logoutButton.addEventListener('click', () => auth.signOut());
    toggleAuthLink.addEventListener('click', e => { e.preventDefault(); loginForm.classList.toggle('hidden'); signupForm.classList.toggle('hidden'); authError.textContent = ''; toggleAuthLink.textContent = signupForm.classList.contains('hidden') ? "Não tem uma conta? Registe-se" : "Já tem uma conta? Faça login"; });
    
    function handleAuth(form, authFn) {
        const email = form.querySelector('input[type="email"]').value;
        const password = form.querySelector('input[type="password"]').value;
        const button = form.querySelector('button');
        const buttonText = button.textContent;
        authError.textContent = ''; button.disabled = true; button.textContent = 'Aguarde...';
        authFn(email, password).catch(showAuthError).finally(() => { button.disabled = false; button.textContent = buttonText; });
    }

    function showAuthError(error) {
        console.error("Erro de autenticação detalhado:", error);
        let message = "Ocorreu um erro. Tente novamente.";
        switch (error.code) {
            case 'auth/wrong-password': message = "Senha incorreta."; break;
            case 'auth/user-not-found': message = "Nenhum utilizador encontrado com este e-mail."; break;
            case 'auth/invalid-email': message = "O formato do e-mail é inválido."; break;
            case 'auth/weak-password': message = "A senha precisa de ter pelo menos 6 caracteres."; break;
            case 'auth/email-already-in-use': message = "Este e-mail já está em uso."; break;
        }
        authError.textContent = message;
    }

    // --- BANCO DE DADOS (FIRESTORE) ---
    function setupListeners(uid) {
        entriesListener = db.collection('users').doc(uid).collection('entries').orderBy('date', 'desc').onSnapshot(snap => {
            localEntries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            render();
        }, console.error);
        settingsListener = db.collection('users').doc(uid).onSnapshot(doc => {
            if (doc.exists && doc.data()) {
                userSettings = { aluguelSemanal: 0, ganhosMetaMensal: 0, ...doc.data() };
                aluguelSemanalInput.value = userSettings.aluguelSemanal > 0 ? userSettings.aluguelSemanal : '';
                goalInput.value = userSettings.ganhosMetaMensal > 0 ? userSettings.ganhosMetaMensal : '';
                render();
            }
        }, console.error);
    }

    // --- FUNÇÕES UTILITÁRIAS ---
    const formatCurrency = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formatDate = dateString => { if (!dateString) return ''; const [year, month, day] = dateString.split('-'); return `${day}/${month}/${year}`; };
    const parseTimeToDecimal = timeString => { if (!timeString) return 0; const [hours, minutes] = timeString.split(':').map(Number); return (hours || 0) + (minutes || 0) / 60; };
    const formatDecimalToTime = decimal => { const hours = Math.floor(decimal); const minutes = Math.round((decimal - hours) * 60); return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`; };
    const getWeekIdentifier = date => { date = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7)); const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1)); return `${date.getUTCFullYear()}-${Math.ceil((((date - yearStart) / 864e5) + 1) / 7)}`; };
    
    function render() {
        renderTable();
        updateDashboard();
    }

    // --- LÓGICA PRINCIPAL ---
    function getFilteredEntries() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 6);
        
        const filterValue = filter.value;
        if (filterValue === 'all') return localEntries;
        
        return localEntries.filter(entry => {
            const entryDate = new Date(entry.date + 'T00:00:00-03:00');
            switch (filterValue) {
                case 'this_month': return entryDate >= firstDayThisMonth && entryDate <= now;
                case 'last_month': return entryDate >= firstDayLastMonth && entryDate <= lastDayLastMonth;
                case 'today': return entryDate.getTime() === today.getTime();
                case 'last_7_days': return entryDate >= sevenDaysAgo && entryDate <= today;
                default: return true;
            }
        });
    }

    function renderTable() {
        const filteredEntries = getFilteredEntries();
        filteredEntries.sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];
            if (sortConfig.key === 'date') {
                valA = new Date(valA);
                valB = new Date(valB);
            }
            return (valA < valB ? -1 : valA > valB ? 1 : 0) * (sortConfig.direction === 'asc' ? 1 : -1);
        });
        
        tableBody.innerHTML = '';
        if (filteredEntries.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center">Nenhum lançamento encontrado.</td></tr>';
            return;
        }
        
        filteredEntries.forEach(entry => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${formatDate(entry.date)}</td><td>${formatCurrency(entry.ganhos)}</td><td>${entry.km.toFixed(1)} km</td><td>${formatDecimalToTime(entry.horas)}</td><td>${formatCurrency(entry.combustivel)}</td><td>${formatCurrency(entry.outros)}</td><td class='${entry.lucro >= 0 ? 'lucro' : 'gasto'}'>${formatCurrency(entry.lucro)}</td><td><button class='edit-btn' data-id='${entry.id}'>✏️</button><button class='delete-btn' data-id='${entry.id}'>🗑️</button></td>`;
            tableBody.appendChild(row);
        });
    }

    function updateDashboard() {
        const filteredEntries = getFilteredEntries();
        const totalGanhos = filteredEntries.reduce((sum, entry) => sum + entry.ganhos, 0);
        const totalCombustivel = filteredEntries.reduce((sum, entry) => sum + entry.combustivel, 0);
        const totalOutros = filteredEntries.reduce((sum, entry) => sum + entry.outros, 0);
        const totalKm = filteredEntries.reduce((sum, entry) => sum + entry.km, 0);
        const totalHoras = filteredEntries.reduce((sum, entry) => sum + entry.horas, 0);
        
        let totalAluguel = 0;
        if (filteredEntries.length > 0 && userSettings.aluguelSemanal > 0) {
            const uniqueWeeks = new Set();
            filteredEntries.forEach(entry => uniqueWeeks.add(getWeekIdentifier(new Date(entry.date + 'T00:00:00-03:00'))));
            totalAluguel = uniqueWeeks.size * userSettings.aluguelSemanal;
        }
        
        const totalGastos = totalCombustivel + totalOutros + totalAluguel;
        const totalLucroLiquido = totalGanhos - totalGastos;
        const ganhosPorKm = totalKm > 0 ? totalGanhos / totalKm : 0;
        const ganhosPorHora = totalHoras > 0 ? totalGanhos / totalHoras : 0;
        const lucroPorKm = totalKm > 0 ? totalLucroLiquido / totalKm : 0;

        dashboard.innerHTML = `<div class='stat-card'><h3>Lucro Líquido</h3><p class='lucro'>${formatCurrency(totalLucroLiquido)}</p></div><div class='stat-card'><h3>Ganhos Totais</h3><p>${formatCurrency(totalGanhos)}</p></div><div class='stat-card'><h3>Gastos Totais</h3><p class='gasto'>${formatCurrency(totalGastos)}</p></div><div class='stat-card'><h3>Ganhos por Km</h3><p>${formatCurrency(ganhosPorKm)}</p></div><div class='stat-card'><h3>Ganhos por Hora</h3><p>${formatCurrency(ganhosPorHora)}</p></div><div class='stat-card'><h3>Lucro por Km</h3><p class='${lucroPorKm >= 0 ? 'lucro' : 'gasto'}'>${formatCurrency(lucroPorKm)}</p></div><div class='stat-card'><h3>Total Km</h3><p>${totalKm.toFixed(1)}</p></div><div class='stat-card'><h3>Total Horas</h3><p>${formatDecimalToTime(totalHoras)}</p></div>`;
        
        const currentWeekId = getWeekIdentifier(new Date());
        const currentWeekEntries = localEntries.filter(e => getWeekIdentifier(new Date(e.date + 'T00:00:00-03:00')) === currentWeekId);
        const currentWeekGanhos = currentWeekEntries.reduce((sum, entry) => sum + entry.ganhos, 0);

        updateCharts(filteredEntries, { totalCombustivel, totalOutros, totalAluguel }, { currentWeekGanhos });
        updateGoalProgress(totalGanhos);
    }
    
    function updateGoalProgress(currentGanhos) {
        if (filter.value === 'this_month' && userSettings.ganhosMetaMensal > 0) {
            const meta = userSettings.ganhosMetaMensal;
            const progress = Math.min((currentGanhos / meta) * 100, 100);
            goalProgressContainer.innerHTML = `<div class="goal-text"><span>Meta Mensal</span><span>${formatCurrency(currentGanhos)} / ${formatCurrency(meta)}</span></div><div class="progress-bar"><div class="progress-bar-inner" style="width: ${progress}%;"></div></div>`;
            goalProgressContainer.classList.remove('hidden');
        } else {
            goalProgressContainer.classList.add('hidden');
        }
    }

    function updateCharts(data, expenseTotals, goalData) {
        const textColor = '#8b949e', gridColor = 'rgba(139, 148, 158, 0.2)', chartBg = '#1C1C1C';
        const ctxLucro = document.getElementById('lucroChart').getContext('2d'), ctxGastos = document.getElementById('gastosChart').getContext('2d'), ctxWeeklyGoal = document.getElementById('weeklyGoalChart').getContext('2d');
        if (lucroChart) lucroChart.destroy(); if (gastosChart) gastosChart.destroy(); if (weeklyGoalChart) weeklyGoalChart.destroy();
        
        const sortedData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
        lucroChart = new Chart(ctxLucro, { type: 'bar', data: { labels: sortedData.map(e => formatDate(e.date)), datasets: [{ label: 'Lucro Bruto Diário', data: sortedData.map(e => e.lucro), backgroundColor: sortedData.map(e => e.lucro >= 0 ? '#4CAF50' : '#D32F2F'), borderRadius: 4, }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'Lucro Bruto (Filtrado)', color: textColor, font: {size: 14} }}, scales: { y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } }, x: { ticks: { color: textColor }, grid: { color: 'transparent' } } } } });
        
        if (Object.values(expenseTotals).some(v => v > 0)) { gastosChart = new Chart(ctxGastos, { type: 'doughnut', data: { labels: ['Combustível', 'Outros', 'Aluguer'], datasets: [{ data: [expenseTotals.totalCombustivel, expenseTotals.totalOutros, expenseTotals.totalAluguel], backgroundColor: ['#F57C00', '#757575', '#D32F2F'], borderColor: chartBg, borderWidth: 5 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Distribuição de Gastos', color: textColor, font: {size: 14} }, legend: { position: 'top', labels: { color: textColor }} } } });}

        const weeklyGoal = userSettings.ganhosMetaMensal / 4.33;
        if (weeklyGoal > 0) {
            const progresso = goalData.currentWeekGanhos;
            const restante = Math.max(0, weeklyGoal - progresso);
            const percentage = weeklyGoal > 0 ? Math.round((progresso / weeklyGoal) * 100) : 0;
            weeklyGoalChart = new Chart(ctxWeeklyGoal, { type: 'doughnut', data: { labels: ['Alcançado', 'Faltam'], datasets: [{ data: [progresso, restante], backgroundColor: ['#4CAF50', 'rgba(139, 148, 158, 0.2)'], borderColor: chartBg, borderWidth: 5 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { title: { display: true, text: 'Meta da Semana Atual', color: textColor, font: {size: 14} }, legend: { display: false }, tooltip: { enabled: false }, doughnutLabel: { text: `${percentage}%` } } } });
        }
    }

    // --- EVENT LISTENERS ---
    form.addEventListener('submit', (e) => {
        e.preventDefault(); if (!userId) return;
        const newEntry = { date: dateInput.value, ganhos: parseFloat(ganhos.value) || 0, km: parseFloat(km.value) || 0, horas: parseTimeToDecimal(horas.value), combustivel: parseFloat(combustivel.value) || 0, outros: parseFloat(outros.value) || 0, };
        newEntry.lucro = newEntry.ganhos - newEntry.combustivel - newEntry.outros;
        db.collection('users').doc(userId).collection('entries').add(newEntry).catch(console.error);
        form.reset(); dateInput.valueAsDate = new Date(); horasInput.value = "00:00";
    });
    recurringForm.addEventListener('submit', e => { e.preventDefault(); if (!userId) return; db.collection('users').doc(userId).set({ aluguelSemanal: parseFloat(aluguelSemanalInput.value) || 0 }, { merge: true }).catch(console.error); });
    goalForm.addEventListener('submit', e => { e.preventDefault(); if (!userId) return; db.collection('users').doc(userId).set({ ganhosMetaMensal: parseFloat(goalInput.value) || 0 }, { merge: true }).catch(console.error); });
    tableBody.addEventListener('click', e => {
        if (e.target.closest('.delete-btn')) { const id = e.target.closest('.delete-btn').dataset.id; if (!userId || !id) return; if (confirm('Tem a certeza que quer apagar?')) { db.collection('users').doc(userId).collection('entries').doc(id).delete().catch(console.error); }}
        if (e.target.closest('.edit-btn')) { const id = e.target.closest('.edit-btn').dataset.id; openEditModal(id); }
    });
    function openEditModal(id) {
        currentEditId = id; const entry = localEntries.find(e => e.id === id); if (!entry) return;
        editModal.querySelector('#edit-date').value = entry.date; editModal.querySelector('#edit-ganhos').value = entry.ganhos; editModal.querySelector('#edit-km').value = entry.km; editModal.querySelector('#edit-horas').value = formatDecimalToTime(entry.horas); editModal.querySelector('#edit-combustivel').value = entry.combustivel; editModal.querySelector('#edit-outros').value = entry.outros;
        editModal.classList.remove('hidden');
    }
    function closeEditModal() { editModal.classList.add('hidden'); currentEditId = null; }
    cancelEditBtn.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', e => { if (e.target === editModal) { closeEditModal(); }});
    editForm.addEventListener('submit', e => {
        e.preventDefault(); if (!userId || !currentEditId) return;
        const updatedEntry = { date: editModal.querySelector('#edit-date').value, ganhos: parseFloat(editModal.querySelector('#edit-ganhos').value) || 0, km: parseFloat(editModal.querySelector('#edit-km').value) || 0, horas: parseTimeToDecimal(editModal.querySelector('#edit-horas').value), combustivel: parseFloat(editModal.querySelector('#edit-combustivel').value) || 0, outros: parseFloat(editModal.querySelector('#edit-outros').value) || 0, };
        updatedEntry.lucro = updatedEntry.ganhos - updatedEntry.combustivel - updatedEntry.outros;
        db.collection('users').doc(userId).collection('entries').doc(currentEditId).update(updatedEntry).then(closeEditModal).catch(console.error);
    });
    filter.addEventListener('change', render);
    document.querySelector('#entries-table thead').addEventListener('click', e => { if (e.target.tagName === 'TH' && e.target.dataset.sort) { const newKey = e.target.dataset.sort; if (sortConfig.key === newKey) { sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc'; } else { sortConfig.key = newKey; sortConfig.direction = 'desc'; } document.querySelectorAll('#entries-table th[data-sort]').forEach(th => th.innerHTML = th.innerHTML.replace('🔽','').replace('🔼','')); e.target.innerHTML += sortConfig.direction === 'desc' ? ' 🔽' : ' 🔼'; renderTable(); } });
    exportBtn.addEventListener('click', () => { const filteredEntries = getFilteredEntries(); if (filteredEntries.length === 0) { alert('Não há dados para exportar.'); return; } const headers = ['Data', 'Ganhos(R$)', 'Km Rodados', 'Horas Trabalhadas', 'Combustivel(R$)', 'Outros Gastos(R$)', 'Lucro Bruto Dia(R$)']; const rows = filteredEntries.map(e => [e.date, e.ganhos, e.km, formatDecimalToTime(e.horas), e.combustivel, e.outros, e.lucro]); let csvContent = 'data:text/csv;charset=utf-8,' + headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n'); const encodedUri = encodeURI(csvContent); const link = document.createElement('a'); link.setAttribute('href', encodedUri); link.setAttribute('download', 'meu_controlo_financeiro.csv'); document.body.appendChild(link); link.click(); document.body.removeChild(link); });
    
    dateInput.valueAsDate = new Date();
});
