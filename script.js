/* script.js — versão com sincronização em tempo real via Firebase
   para exames em andamento visíveis em diferentes computadores */

/* === Referências ao DOM === */
const form = document.getElementById('patient-form');
const list = document.getElementById('patients-list');
const historyDiv = document.getElementById('history-wrapper');
const oldHistoryDiv = document.getElementById('old-history-wrapper');
const alertSound = document.getElementById('alertSound');
const themeBtn = document.getElementById('theme-toggle');
const history = []; // array local de exames
let alertTimeout = null; // variável para controlar o timeout do alerta
let ongoingExamsListener = null; // listener para exames em andamento

/* === Helpers para data/hora === */
function formatTime(date) {
  if (!date) return '--:--';
  const d = (date instanceof Date) ? date : new Date(date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatDateDisplay(date) {
  if (!date) return '';
  const d = (date instanceof Date) ? date : new Date(date);
  return d.toLocaleDateString();
}
function toISODate(d = new Date()) {
  return new Date(d).toISOString().split('T')[0]; // YYYY-MM-DD
}
function calculateAge(dob) {
  if (!dob) return '';
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/* === Tema escuro === */
themeBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const dark = document.body.classList.contains('dark-mode');
  themeBtn.textContent = dark ? '☀️' : '🌙';
  localStorage.setItem('darkMode', dark ? 'on' : 'off');
});

window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('darkMode');
  if (savedTheme === 'on') {
    document.body.classList.add('dark-mode');
    themeBtn.textContent = '☀️';
  }
  
  // Aguardar um pouco para garantir que o Firebase foi inicializado
  setTimeout(() => {
    loadFromFirebase();
  }, 1000);
});

/* === Mostrar abas === */
function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(div => div.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const el = document.getElementById(tab);
  if (el) el.style.display = 'block';
  const btn = document.querySelector(`.tab-btn[onclick="showTab('${tab}')"]`);
  if (btn) btn.classList.add('active');
}

/* === Mensagens rápidas === */
function showMessage(text, duration = 3500) {
  const msg = document.getElementById('message');
  if (!msg) return;
  msg.textContent = text;
  msg.style.display = 'block';
  setTimeout(() => { msg.style.display = 'none'; }, duration);
}

/* === Form submission (novo paciente/exame) === */
form.addEventListener('submit', function (e) {
  e.preventDefault();
  const name = document.getElementById('name').value.trim();
  const dob = document.getElementById('dob').value;
  const operator = document.getElementById('operator').value || "Anderson";
  const type = document.getElementById('exam-type').value;
  const observation = document.getElementById('observation')?.value || '';
  const startTime = new Date();

  // ID único local (usamos como doc id no Firestore)
  const id = Date.now().toString();

  const patientData = {
    id,
    name,
    dob,
    operator,
    type,
    observation,
    start: startTime,      // será convertido ao salvar
    end: null,
    measures: [],
    dateISO: toISODate(startTime),       // YYYY-MM-DD para lógica
    dateDisplay: formatDateDisplay(startTime),
    paquimetria: { od: '', oe: '' }
  };

  // Cria o card do paciente no DOM com data-id
  const patientDiv = document.createElement('div');
  patientDiv.classList.add('patient');
  patientDiv.setAttribute('data-id', id);
  patientDiv.innerHTML = `
    <strong>${name}</strong> (${type.toUpperCase()}) - ${calculateAge(dob)} anos<br>
    Nasc: ${dob} | Operador: ${operator}<br><br>
    <button data-action="start" class="start-btn">Iniciar Primeira Medida</button>
    <div class="timer-container"></div>
  `;

  list.appendChild(patientDiv);
  history.push(patientData);
  form.reset();

  // ligar evento do botão de start (delegação simples)
  const startBtn = patientDiv.querySelector('button[data-action="start"]');
  startBtn.addEventListener('click', () => startInitial(type, startBtn, id));
});

/* === criação de input PIO (OD/OE) === */
function createInput(placeholder) {
  const input = document.createElement('input');
  input.type = 'number';
  input.placeholder = placeholder;
  input.classList.add('pio');
  input.min = 0;
  return input;
}

/* === Inicia primeira medida (sem água para TSH) === */
function startInitial(type, btn, patientId) {
  const parent = btn.parentElement;
  const timers = parent.querySelector('.timer-container');
  if (!timers) return;
  btn.remove();

  const now = new Date();
  const initialTime = formatTime(now);
  const label = type === 'tsh' ? '1ª Medida (Sem Água)' : '1ª Medida';
  const timerDiv = document.createElement('div');
  timerDiv.classList.add('timer');
  timerDiv.innerHTML = `<strong>${label}:</strong> ${initialTime} - ✅ Medida confirmada`;

  const pioOD = createInput('PIO OD');
  const pioOE = createInput('PIO OE');
  pioOD.addEventListener('input', () => { if (pioOD.value.length >= 2) pioOE.focus(); });
  pioOE.addEventListener('input', () => { if (pioOE.value.length >= 2) pioOE.blur(); });

  const pioGroup = document.createElement('div');
  pioGroup.className = 'pio-group';
  pioGroup.appendChild(pioOD);
  pioGroup.appendChild(pioOE);
  timerDiv.appendChild(pioGroup);

  timers.appendChild(timerDiv);

  const idx = history.findIndex(h => h.id === patientId);
  if (idx === -1) return;
  history[idx].measures.push({
    measure: label,
    time: formatTime(now),
    date: toISODate(now),
    pioOD: '', pioOE: ''
  });

  pioOD.addEventListener('change', () => { 
    history[idx].measures[0].pioOD = pioOD.value;
    // Salvar automaticamente no Firebase quando PIO for alterado
    saveToFirebase(history[idx]);
  });
  pioOE.addEventListener('change', () => { 
    history[idx].measures[0].pioOE = pioOE.value;
    // Salvar automaticamente no Firebase quando PIO for alterado
    saveToFirebase(history[idx]);
  });

  if (type === 'tsh') {
    showMessage("🧃 Informe ao paciente que ele precisa tomar 5 copos de água.");
    const waterBtn = document.createElement('button');
    waterBtn.textContent = 'Paciente terminou os 5 copos de água';
    waterBtn.addEventListener('click', () => {
      waterBtn.remove();
      createSequentialTimers(3, parent, timers, patientId, 15); // 3 medidas adicionais de 15 min
    });
    parent.appendChild(waterBtn);
  } else if (type === 'curva') {
    // curva: 3 medidas com intervalo de 180 minutos (3h) — já temos 1ª, faltam 2
    createSequentialTimers(2, parent, timers, patientId, 180);
  }
}

/* === cria timers sequenciais ===
   count: quantos timers adicionais (ex: 3 para TSH -> 3 timers de 15min após água)
   minutes: duração em minutos entre agora e próxima medida
*/
function createSequentialTimers(count, parent, container, patientId, minutes) {
  const timersEl = [];
  const measureReady = [];

  function createNext(i) {
    const now = new Date();
    const targetTime = new Date(now.getTime() + minutes * 60000);
    const timerDiv = document.createElement('div');
    timerDiv.classList.add('timer');

    const timeStr = formatTime(targetTime);
    const countdownSpan = document.createElement('span');
    countdownSpan.textContent = "Carregando...";

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Confirmar medida';

    timerDiv.innerHTML = `<strong>Medida ${i + 2}:</strong> ${timeStr} - `;
    timerDiv.appendChild(countdownSpan);
    timerDiv.appendChild(confirmBtn);

    timersEl.push(timerDiv);
    container.appendChild(timerDiv);
    measureReady.push(false);

    confirmBtn.addEventListener('click', () => {
      if (!measureReady[i]) {
        showMessage("⏳ Aguarde o cronômetro chegar a zero.");
        return;
      }

      // Para o alerta sonoro imediatamente
      if (alertSound) {
        alertSound.pause();
        alertSound.currentTime = 0;
      }
      if (alertTimeout) {
        clearTimeout(alertTimeout);
        alertTimeout = null;
      }

      confirmBtn.remove();
      countdownSpan.textContent = "✅ Medida confirmada";
      parent.classList.remove('blink');

      const pioOD = createInput('PIO OD');
      const pioOE = createInput('PIO OE');
      pioOD.addEventListener('input', () => { if (pioOD.value.length >= 2) pioOE.focus(); });
      pioOE.addEventListener('input', () => { if (pioOE.value.length >= 2) pioOE.blur(); });

      const pioGroup = document.createElement('div');
      pioGroup.className = 'pio-group';
      pioGroup.appendChild(pioOD);
      pioGroup.appendChild(pioOE);
      timerDiv.appendChild(pioGroup);

      const idx = history.findIndex(h => h.id === patientId);
      if (idx === -1) return;

      history[idx].measures.push({
        measure: `Medida ${i + 2}`,
        time: formatTime(new Date()),
        date: toISODate(new Date()),
        pioOD: '', pioOE: ''
      });

      pioOD.addEventListener('change', () => {
        history[idx].measures.at(-1).pioOD = pioOD.value;
        saveToFirebase(history[idx]);
      });
      pioOE.addEventListener('change', () => {
        history[idx].measures.at(-1).pioOE = pioOE.value;
        saveToFirebase(history[idx]);
      });

      if (i + 1 < count) {
        createNext(i + 1);
      } else {
        const finalizeBtn = document.createElement('button');
        finalizeBtn.textContent = 'Finalizar Paciente';
        finalizeBtn.addEventListener('click', () => {
          history[idx].end = new Date();
          // remover card do DOM
          const card = document.querySelector(`.patient[data-id="${patientId}"]`);
          if (card) card.remove();

          updateHistory();
          // Salva no Firebase (função abaixo já usa doc id igual a history[idx].id)
          saveToFirebase(history[idx]);
        });
        parent.appendChild(finalizeBtn);
      }
    });

    // inicia cronometro
    startCountdown(targetTime, countdownSpan, measureReady, i, parent);
  }

  createNext(0);
}

/* === Contador === */
function startCountdown(target, displayEl, statusArray, index, card) {
  const interval = setInterval(() => {
    const now = new Date();
    const remaining = target - now;

    if (remaining <= 0 && !statusArray[index]) {
      displayEl.textContent = "🟢 Pronto para medir";
      statusArray[index] = true;
      card.classList.add('blink');
      
      // Inicia o alerta sonoro
      try { 
        if (alertSound) {
          alertSound.loop = true; // faz o som repetir
          alertSound.play(); 
        }
        
        // Para o alerta automaticamente após 30 segundos
        alertTimeout = setTimeout(() => {
          if (alertSound) {
            alertSound.pause();
            alertSound.currentTime = 0;
          }
          card.classList.remove('blink');
          alertTimeout = null;
        }, 30000); // 30 segundos
      } catch (e) {
        console.log("Erro ao reproduzir som:", e);
      }
    }

    if (remaining <= -30000) { // depois de 30s parado, parar loop
      clearInterval(interval);
      card.classList.remove('blink');
      return;
    }

    if (remaining > 0) {
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
      displayEl.textContent = `${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
      if (remaining <= 10000) {
        card.classList.add('blink');
      }
    }
  }, 1000);
}

/* === SALVAR no Firebase ===
   - usa doc ID igual a exam.id (gerado localmente)
   - converte Date -> Timestamp
*/
function saveToFirebase(exam) {
  if (!firebase || !firebase.firestore || !db) {
    console.error("Firebase não inicializado");
    showMessage("Erro: Firebase não inicializado");
    return;
  }

  // Prepara um objeto limpo para salvar (conversão de Dates para Timestamps)
  const toSave = Object.assign({}, exam);
  
  // converte start/end para Timestamp se necessário
  try {
    if (exam.start) {
      toSave.start = firebase.firestore.Timestamp.fromDate(new Date(exam.start));
    }
    if (exam.end) {
      toSave.end = firebase.firestore.Timestamp.fromDate(new Date(exam.end));
    }
  } catch (e) {
    // fallback: não converte
    console.warn("Erro ao converter datas para Timestamp:", e);
  }

  // Garantir que measures tenham apenas campos serializáveis (times como string OK)
  // Gravamos no doc com id = exam.id
  db.collection("exames").doc(exam.id).set(toSave, { merge: true })
    .then(() => {
      console.log("✅ Exame salvo no Firebase (id=" + exam.id + ")");
      showMessage("Exame salvo com sucesso!");
    })
    .catch(error => {
      console.error("❌ Erro ao salvar:", error);
      showMessage("Erro ao salvar no Firebase: " + error.message);
    });
}

/* === Carregar do Firebase ===
   - converte Timestamp -> Date
   - mantém doc id em exam.id
*/
function loadFromFirebase() {
  if (!db) {
    console.error("Firebase não inicializado");
    showMessage("Erro: Firebase não inicializado");
    return;
  }
  
  console.log("Carregando dados do Firebase...");
  
  db.collection("exames").get().then(snapshot => {
    history.length = 0;
    console.log("Documentos encontrados:", snapshot.size);
    
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log("Carregando exame:", doc.id, data);
      
      // converter Timestamps do Firestore para Date (se aplicável)
      if (data.start && typeof data.start.toDate === 'function') {
        data.start = data.start.toDate();
      }
      if (data.end && typeof data.end.toDate === 'function') {
        data.end = data.end.toDate();
      }
      
      // garantir campos mínimos
      if (!data.paquimetria) data.paquimetria = { od: '', oe: '' };
      if (!data.measures) data.measures = [];
      
      // preencher dateISO / dateDisplay caso faltem
      if (!data.dateISO) {
        data.dateISO = toISODate(data.start || new Date());
      }
      if (!data.dateDisplay) {
        data.dateDisplay = formatDateDisplay(data.start || new Date());
      }
      
      data.id = doc.id; // garante que temos id do doc
      history.push(data);
    });
    
    console.log("Exames carregados:", history.length);
    updateHistory();
    showMessage(`${history.length} exames carregados do Firebase`);
  }).catch(err => {
    console.error("Erro ao carregar do Firebase:", err);
    showMessage("Erro ao carregar dados do Firebase: " + err.message);
  });
}

/* === Impressão de um exame (A5) === */
function printSingleExam(exam) {
  const win = window.open('', '', 'width=800,height=600');
  win.document.write('<html><head><title>Exame</title>');
  win.document.write(`
    <style>
      @page { size: A5; margin: 10mm; }
      body { font-family: Arial; font-size: 12px; line-height: 1.4; }
      .block { margin-bottom: 8px; }
      h2 { text-align: center; margin-top: 8px; font-size: 18px; }
      h3 { text-align: center; margin: 5px 0 12px 0; font-weight: normal; font-size: 14px; }
      .result-line { margin: 6px 0; }
      .section-title { font-weight: bold; margin: 12px 0 6px 0; text-align: left; }
      pre { white-space: pre-wrap; word-wrap: break-word; margin:0; }
      .center { text-align: center; }
    </style>
  `);
  win.document.write('</head><body>');

  win.document.write(`<div class="block"><strong>Nome:</strong> ${exam.name}</div>`);
  win.document.write(`<div class="block"><strong>Data de Nascimento:</strong> ${formatDateDisplay(exam.dob)} (${calculateAge(exam.dob)} anos)</div>`);
  win.document.write(`<div class="block"><strong>Operador:</strong> ${exam.operator}</div>`);
  win.document.write(`<div class="block"><strong>Data do Exame:</strong> ${exam.dateDisplay || formatDateDisplay(exam.start)}</div>`);

  const exameCompleto = exam.type === 'tsh'
    ? "Teste de Sobrecarga Hídrica"
    : "Curva Tensional de Três Medidas";

  win.document.write(`<h2 class="center">Resultado</h2>`);
  win.document.write(`<h3 class="center">${exameCompleto}</h3>`);

  // Para curva, alinhar horários segundo 1ª medida (se houver)
  let firstTime = null;
  if (exam.type === 'curva' && exam.measures && exam.measures.length > 0) {
    const parts = (exam.measures[0].time || '').split(':').map(Number);
    if (parts.length >= 2) {
      firstTime = new Date();
      firstTime.setHours(parts[0], parts[1], 0, 0);
    }
  }

  (exam.measures || []).forEach((m, i) => {
    let descricao = '';
    if (exam.type === 'tsh') {
      descricao = i === 0 ? "Antes da ingestão de água" : `${i * 15} minutos após ingestão de água`;
    } else if (exam.type === 'curva') {
      if (firstTime) {
        const medidaTime = new Date(firstTime.getTime() + i * 3 * 60 * 60 * 1000);
        const hh = medidaTime.getHours().toString().padStart(2, '0');
        const mm = medidaTime.getMinutes().toString().padStart(2, '0');
        descricao = `${i + 1}ª Medida (${hh}:${mm})`;
      } else {
        descricao = `${i + 1}ª Medida (${m.time || '--:--'})`;
      }
    }
    win.document.write(`<div class="result-line"><strong>${descricao}</strong><br>${m.pioOD || '--'} | ${m.pioOE || '--'}</div>`);
  });

  const pq = exam.paquimetria;
  if (pq && (pq.od || pq.oe)) {
    win.document.write(`<div class="section-title">Paquimetria</div>`);
    win.document.write(`<div class="result-line">${pq.od || '--'} µm | ${pq.oe || '--'} µm</div>`);
  }

  if (exam.observation && exam.observation.trim() !== "") {
    win.document.write(`<div class="section-title">Segue em anexo:</div>`);
    win.document.write(`<div class="block"><pre>${exam.observation}</pre></div>`);
  }

  win.document.write('</body></html>');
  win.document.close();
  win.print();
}

/* === Atualiza lista de histórico no DOM === */
function updateHistory() {
  if (historyDiv) historyDiv.innerHTML = "";
  if (oldHistoryDiv) oldHistoryDiv.innerHTML = "";
  const todayISO = toISODate();

  history.forEach((exam) => {
    if (!exam.end) return; // só exibe finalizados
    const isToday = exam.dateISO === todayISO;

    const container = document.createElement('div');
    container.className = 'exam-item';

    const basicInfo = document.createElement('div');
    basicInfo.innerHTML = `
      <strong>${exam.name}</strong> (${exam.type.toUpperCase()}) - ${calculateAge(exam.dob)} anos<br>
      Nasc: ${exam.dob} | Operador: ${exam.operator}<br>
      Data: ${exam.dateDisplay || exam.dateISO} | Início: ${formatTime(exam.start)} | Fim: ${formatTime(exam.end)}
    `;

    const toggle = document.createElement('button');
    toggle.textContent = '▼';
    toggle.className = 'toggle-btn';

    const printBtn = document.createElement('button');
    printBtn.textContent = '🖨️';
    printBtn.className = 'print-btn';
    printBtn.onclick = () => printSingleExam(exam);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️';
    deleteBtn.className = 'print-btn danger';
    deleteBtn.onclick = () => {
      if (confirm('Tem certeza que deseja excluir este exame?')) {
        deleteExamFromFirebase(exam.id);
      }
    };

    const detail = document.createElement('div');
    detail.style.display = 'none';
    detail.innerHTML = `
      ${ (exam.measures || []).map((m, i) => {
        const label = exam.type === 'tsh' && i === 0 ? '1ª Medida (Sem Água)' : m.measure;
        return `➤ ${label} (${m.time}) | PIO OD: ${m.pioOD || '-'} | PIO OE: ${m.pioOE || '-'}<br>`;
      }).join('')}
    `;

    toggle.onclick = () => {
      const isHidden = detail.style.display === 'none';
      detail.style.display = isHidden ? 'block' : 'none';
      toggle.textContent = isHidden ? '▲' : '▼';
    };

    // observações editáveis
    const obs = document.createElement('textarea');
    obs.value = exam.observation || '';
    obs.placeholder = "Digite observações...";
    obs.className = 'observacao-edit';
    obs.onchange = () => {
      exam.observation = obs.value;
      saveToFirebase(exam);
    };

    const pqDiv = document.createElement('div');
    pqDiv.className = 'paquimetria-group';
    pqDiv.innerHTML = `
      <label>Paquimetria OD: <input type="number" value="${exam.paquimetria?.od || ''}" /></label>
      <label>Paquimetria OE: <input type="number" value="${exam.paquimetria?.oe || ''}" /></label>
    `;
    // listeners para salvar ao alterar paquimetria
    const inputs = pqDiv.querySelectorAll('input');
    inputs[0].addEventListener('change', (e) => { 
      if (!exam.paquimetria) exam.paquimetria = { od: '', oe: '' };
      exam.paquimetria.od = e.target.value; 
      saveToFirebase(exam); 
    });
    inputs[1].addEventListener('change', (e) => { 
      if (!exam.paquimetria) exam.paquimetria = { od: '', oe: '' };
      exam.paquimetria.oe = e.target.value; 
      saveToFirebase(exam); 
    });

    detail.appendChild(obs);
    detail.appendChild(pqDiv);

    container.append(basicInfo, toggle, printBtn, deleteBtn, detail);
    (isToday ? historyDiv : oldHistoryDiv).appendChild(container);
  });
}

/* === Deletar exame do Firebase === */
function deleteExamFromFirebase(examId) {
  if (!db) {
    showMessage("Erro: Firebase não inicializado");
    return;
  }

  db.collection("exames").doc(examId).delete()
    .then(() => {
      console.log("✅ Exame deletado do Firebase (id=" + examId + ")");
      // Remover do array local
      const index = history.findIndex(h => h.id === examId);
      if (index !== -1) {
        history.splice(index, 1);
        updateHistory();
      }
      showMessage("Exame excluído com sucesso!");
    })
    .catch(error => {
      console.error("❌ Erro ao deletar:", error);
      showMessage("Erro ao excluir exame: " + error.message);
    });
}

/* === Imprimir múltiplos exames === */
function printMultipleExams(exams, title) {
  const win = window.open('', '', 'width=900,height=700');
  win.document.write('<html><head><title>' + title + '</title>');
  win.document.write(`
    <style>
      @page { size: A4; margin: 10mm; }
      body { font-family: Arial; font-size: 11px; }
      h2 { text-align: center; }
      .exam { border: 1px solid #000; margin-bottom: 12px; padding: 8px; page-break-inside: avoid; }
      .block { margin-bottom: 6px; }
      pre { margin: 0; white-space: pre-wrap; word-wrap: break-word; }
    </style>
  `);
  win.document.write('</head><body>');
  win.document.write(`<h2>${title} – Instituto de Olhos Adi Nascimento</h2>`);

  exams.forEach(exam => {
    win.document.write('<div class="exam">');
    win.document.write(`<div class="block"><strong>Nome:</strong> ${exam.name}</div>`);
    win.document.write(`<div class="block"><strong>Data de Nascimento:</strong> ${formatDateDisplay(exam.dob)} (${calculateAge(exam.dob)} anos)</div>`);
    win.document.write(`<div class="block"><strong>Data do Exame:</strong> ${exam.dateDisplay || exam.dateISO}</div>`);
    win.document.write(`<div class="block"><strong>Tipo de Exame:</strong> ${exam.type.toUpperCase()}</div>`);
    win.document.write(`<div class="block"><strong>Operador:</strong> ${exam.operator}</div>`);
    win.document.write(`<div class="block"><strong>Início:</strong> ${formatTime(exam.start)} | <strong>Fim:</strong> ${formatTime(exam.end)}</div>`);
    win.document.write(`<div class="block"><strong>Medidas:</strong><br>`);
    (exam.measures || []).forEach((m, i) => {
      const label = exam.type === 'tsh' && i === 0 ? '1ª Medida (Sem Água)' : m.measure;
      win.document.write(`➤ ${label} (${m.time}) | PIO OD: ${m.pioOD || '-'} | PIO OE: ${m.pioOE || '-'}<br>`);
    });
    win.document.write(`</div>`);

    if (exam.paquimetria?.od || exam.paquimetria?.oe) {
      win.document.write(`<div class="block"><strong>Paquimetria:</strong> OD: ${exam.paquimetria.od || '--'} µm | OE: ${exam.paquimetria.oe || '--'} µm</div>`);
    }

    if (exam.observation?.trim()) {
      win.document.write(`<div class="block"><strong>Segue em anexo:</strong><br><pre>${exam.observation}</pre></div>`);
    }

    win.document.write('</div>');
  });

  win.document.write('</body></html>');
  win.document.close();
  win.print();
}

function printHistory() {
  const todayISO = toISODate();
  const exams = history.filter(p => p.end && p.dateISO === todayISO);
  printMultipleExams(exams, "Histórico do Dia");
}

function printOldHistory() {
  const todayISO = toISODate();
  const exams = history.filter(p => p.end && p.dateISO !== todayISO);
  printMultipleExams(exams, "Histórico Antigo");
}

function exportToCSV(target) {
  const todayISO = toISODate();
  const exams = history.filter(p => p.end && (target === 'history' ? p.dateISO === todayISO : p.dateISO !== todayISO));
  let csv = "Nome;Data Nasc.;Idade;Tipo;Operador;Data Exame;Início;Fim;Observações;PQ OD;PQ OE\n";

  exams.forEach(exam => {
    const base = `${exam.name};${exam.dob};${calculateAge(exam.dob)};${exam.type};${exam.operator};${exam.dateDisplay || exam.dateISO};${formatTime(exam.start)};${formatTime(exam.end)};${(exam.observation||'').replace(/\n/g, " ") || "-"};${exam.paquimetria?.od || ''};${exam.paquimetria?.oe || ''}`;
    csv += base + "\n";
    (exam.measures || []).forEach((m, i) => {
      const label = exam.type === 'tsh' && i === 0 ? '1ª Medida (Sem Água)' : m.measure;
      csv += `;;Medida: ${label};${m.time};OD: ${m.pioOD || '-'};OE: ${m.pioOE || '-'};;;;\n`;
    });
  });

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${target}-exames.csv`;
  a.click();
}

/* === FILTROS de busca (old/day) === */
const oldSearchInput = document.getElementById('old-history-search');
if (oldSearchInput) {
  oldSearchInput.addEventListener('input', () => {
    const term = oldSearchInput.value.trim().toLowerCase();
    const items = oldHistoryDiv.querySelectorAll('.exam-item');
    items.forEach(item => {
      const match = item.innerText.toLowerCase().includes(term);
      item.style.display = match || term === '' ? 'block' : 'none';
    });
  });
}

// Filtro para histórico do dia
const daySearchInput = document.getElementById('day-history-search');
if (daySearchInput) {
  daySearchInput.addEventListener('input', () => {
    const term = daySearchInput.value.trim().toLowerCase();
    const items = document.querySelectorAll('#history .exam-item');
    items.forEach(item => {
      const match = item.innerText.toLowerCase().includes(term);
      item.style.display = match || term === '' ? 'block' : 'none';
    });
  });
}

/* === Limpar histórico (dia / antigos / todos) ===
   - tipo: 'day' -> apaga exames do dia atual
           'old' -> apaga exames anteriores (antigos)
           'all' -> apaga todos os exames (use com cuidado)
*/
function clearHistory(tipo) {
  if (!confirm("Tem certeza que deseja limpar o histórico?")) return;

  if (!db) {
    showMessage("Erro: Firebase não inicializado");
    return;
  }
  
  const hojeISO = toISODate();

  db.collection("exames").get().then(snapshot => {
    const batch = db.batch();
    const examesRemovidos = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      // converte data.dateISO se disponível, senão tenta derivar de start
      const docDateISO = data.dateISO || (data.start && typeof data.start.toDate === 'function' ? data.start.toDate().toISOString().split('T')[0] : null);
      if (
        (tipo === 'day' && docDateISO === hojeISO) ||
        (tipo === 'old' && docDateISO && docDateISO !== hojeISO) ||
        (tipo === 'all')
      ) {
        batch.delete(doc.ref);
        examesRemovidos.push(doc.id);
      }
    });

    batch.commit().then(() => {
      console.log("✅ Exames removidos do Firebase");
      // atualizar array local removendo os deletados
      for (let i = history.length - 1; i >= 0; i--) {
        const h = history[i];
        if (tipo === 'day' && h.dateISO === hojeISO) history.splice(i, 1);
        if (tipo === 'old' && h.dateISO !== hojeISO) history.splice(i, 1);
        if (tipo === 'all') history.splice(i, 1);
      }
      updateHistory();
      showMessage(`🧹 ${examesRemovidos.length} exames apagados`);
    }).catch(err => {
      console.error("❌ Erro ao apagar:", err);
      showMessage("Erro ao apagar dados!");
    });
  });
}

/* === Fim do script === */

