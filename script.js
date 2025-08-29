/* script.js — versão com sincronização em tempo real via Firebase
   para exames em andamento visíveis em diferentes computadores (somente leitura)
   e fluxo de paquimetria para exames concluídos */

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
let currentPage = 1;
const itemsPerPage = 10;

/* === Função para parar o alarme === */
function stopAlarm() {
  if (alertSound) {
    alertSound.pause();
    alertSound.currentTime = 0;
  }
  if (alertTimeout) {
    clearTimeout(alertTimeout);
    alertTimeout = null;
  }
  // Remove a animação de piscar de todos os cards
  document.querySelectorAll('.patient.blink').forEach(card => {
    card.classList.remove('blink');
  });
}

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
    setupOngoingExamsListener();
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
  const operator = document.getElementById('operator').value;
  const type = document.getElementById('exam-type').value;
  const observation = document.getElementById('observation')?.value || '';
  const startTime = new Date();

  if (!operator) {
    showMessage("Por favor, selecione um operador.");
    return;
  }

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
    paquimetria: { od: '', oe: '' },
    status: 'ongoing', // Status para identificar exames em andamento
    locallyCreated: true // Marcar como criado localmente
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

  // Adicionar evento de clique no card para parar o alarme
  patientDiv.addEventListener('click', () => {
    stopAlarm();
  });

  list.appendChild(patientDiv);
  history.push(patientData);
  
  // Salvar no Firebase imediatamente como exame em andamento
  saveToFirebase(patientData);
  
  form.reset();

  // ligar evento do botão de start (delegação simples)
  const startBtn = patientDiv.querySelector('button[data-action="start"]');
  startBtn.addEventListener('click', () => startInitial(type, startBtn, id));
});

/* === Listener para exames em andamento === */
function setupOngoingExamsListener() {
  if (!db) {
    console.error("Firebase não inicializado para listener");
    return;
  }

  // Escutar mudanças em tempo real nos exames em andamento
  ongoingExamsListener = db.collection("exames")
    .where("status", "==", "ongoing")
    .onSnapshot((snapshot) => {
      console.log("Mudanças detectadas nos exames em andamento");
      
      // Primeiro, remover todos os cards readonly existentes
      document.querySelectorAll('.patient.readonly').forEach(card => card.remove());
      
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        data.id = doc.id;
        
        // Converter Timestamps para Date
        if (data.start && typeof data.start.toDate === 'function') {
          data.start = data.start.toDate();
        }
        if (data.end && typeof data.end.toDate === 'function') {
          data.end = data.end.toDate();
        }
        
        // Verificar se realmente está em andamento (não finalizado)
        if (!data.end && data.status === 'ongoing') {
          // Verificar se não é um exame criado localmente
          const localExam = history.find(h => h.id === data.id);
          if (!localExam) {
            createReadOnlyExamCard(data);
          }
        }
      });
    }, (error) => {
      console.error("Erro no listener de exames em andamento:", error);
    });
}

/* === Criar card somente leitura para exames de outros computadores === */
function createReadOnlyExamCard(examData) {
  const patientDiv = document.createElement('div');
  patientDiv.classList.add('patient', 'readonly');
  patientDiv.setAttribute('data-id', examData.id);
  
  let statusText = "⏳ Aguardando início";
  let measureInfo = "";
  
  // Mostrar informações das medidas já realizadas
  if (examData.measures && examData.measures.length > 0) {
    const lastMeasure = examData.measures[examData.measures.length - 1];
    measureInfo = `<br><small>Última medida: ${lastMeasure.measure} (${lastMeasure.time})</small>`;
  }
  
  patientDiv.innerHTML = `
    <div style="opacity: 0.8;">
      <strong>${examData.name}</strong> (${examData.type.toUpperCase()}) - ${calculateAge(examData.dob)} anos<br>
      Nasc: ${examData.dob} | Operador: ${examData.operator}<br>
      <small style="color: #666; font-style: italic;">📱 Exame em andamento em outro computador</small>
      ${measureInfo}
    </div>
  `;

  list.appendChild(patientDiv);
}

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
      stopAlarm();

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
          history[idx].status = 'completed'; // Marcar como concluído
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
          alertSound.volume = 0.7; // ajusta o volume
          alertSound.play().catch(e => console.log("Erro ao reproduzir som:", e)); 
        }
        
        // Para o alerta automaticamente após 30 segundos
        alertTimeout = setTimeout(() => {
          stopAlarm();
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
   - carrega exames em andamento e finalizados
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
    list.innerHTML = ''; // Limpar lista de exames em andamento
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
      if (!data.status) data.status = data.end ? 'completed' : 'ongoing';
      
      // preencher dateISO / dateDisplay caso faltem
      if (!data.dateISO) {
        data.dateISO = toISODate(data.start || new Date());
      }
      if (!data.dateDisplay) {
        data.dateDisplay = formatDateDisplay(data.start || new Date());
      }
      
      data.id = doc.id; // garante que temos id do doc
      history.push(data);
      
      // Se é um exame em andamento, recriar o card
      if (data.status === 'ongoing' && !data.end) {
        recreateOngoingExam(data);
      }
    });
    
    console.log("Exames carregados:", history.length);
    updateHistory();
    showMessage(`${history.length} exames carregados do Firebase`);
  }).catch(err => {
    console.error("Erro ao carregar do Firebase:", err);
    showMessage("Erro ao carregar dados do Firebase: " + err.message);
  });
}

/* === Recriar exame em andamento do Firebase === */
function recreateOngoingExam(examData) {
  console.log("Recriando exame em andamento:", examData.name);
  
  // Criar card do paciente
  const patientDiv = document.createElement('div');
  patientDiv.classList.add('patient');
  patientDiv.setAttribute('data-id', examData.id);
  
  // Determinar se é um exame local ou de outro computador
  const isLocalExam = history.some(h => h.id === examData.id && h.locallyCreated);
  
  if (isLocalExam) {
    // Exame criado localmente - permitir continuação
    patientDiv.innerHTML = `
      <strong>${examData.name}</strong> (${examData.type.toUpperCase()}) - ${calculateAge(examData.dob)} anos<br>
      Nasc: ${examData.dob} | Operador: ${examData.operator}<br><br>
      <div class="timer-container"></div>
    `;
    
    // Recriar timers e medidas existentes
    const timers = patientDiv.querySelector('.timer-container');
    examData.measures.forEach((measure, index) => {
      const timerDiv = document.createElement('div');
      timerDiv.classList.add('timer');
      timerDiv.innerHTML = `<strong>${measure.measure}:</strong> ${measure.time} - ✅ Medida confirmada`;
      
      // Adicionar campos PIO se existirem
      if (measure.pioOD !== undefined || measure.pioOE !== undefined) {
        const pioOD = createInput('PIO OD');
        const pioOE = createInput('PIO OE');
        pioOD.value = measure.pioOD || '';
        pioOE.value = measure.pioOE || '';
        
        const pioGroup = document.createElement('div');
        pioGroup.className = 'pio-group';
        pioGroup.appendChild(pioOD);
        pioGroup.appendChild(pioOE);
        timerDiv.appendChild(pioGroup);
        
        // Eventos para salvar mudanças
        pioOD.addEventListener('change', () => {
          examData.measures[index].pioOD = pioOD.value;
          saveToFirebase(examData);
        });
        pioOE.addEventListener('change', () => {
          examData.measures[index].pioOE = pioOE.value;
          saveToFirebase(examData);
        });
      }
      
      timers.appendChild(timerDiv);
    });
    
    // Se ainda há medidas pendentes, adicionar botão para continuar
    const expectedMeasures = examData.type === 'tsh' ? 4 : 3;
    if (examData.measures.length < expectedMeasures) {
      const continueBtn = document.createElement('button');
      continueBtn.textContent = 'Continuar Próxima Medida';
      continueBtn.addEventListener('click', () => {
        // Lógica para continuar o exame
        const remainingMeasures = expectedMeasures - examData.measures.length;
        const minutes = examData.type === 'tsh' ? 15 : 180;
        createSequentialTimers(remainingMeasures, patientDiv, timers, examData.id, minutes);
        continueBtn.remove();
      });
      patientDiv.appendChild(continueBtn);
    } else {
      // Todas as medidas completas, botão finalizar
      const finalizeBtn = document.createElement('button');
      finalizeBtn.textContent = 'Finalizar Paciente';
      finalizeBtn.addEventListener('click', () => {
        const idx = history.findIndex(h => h.id === examData.id);
        if (idx !== -1) {
          history[idx].end = new Date();
          history[idx].status = 'completed';
          patientDiv.remove();
          updateHistory();
          saveToFirebase(history[idx]);
        }
      });
      patientDiv.appendChild(finalizeBtn);
    }
  } else {
    // Exame de outro computador - somente leitura
    patientDiv.classList.add('readonly');
    
    let measureInfo = "";
    if (examData.measures && examData.measures.length > 0) {
      const lastMeasure = examData.measures[examData.measures.length - 1];
      measureInfo = `<br><small>Última medida: ${lastMeasure.measure} (${lastMeasure.time})</small>`;
    }
    
    patientDiv.innerHTML = `
      <div style="opacity: 0.8;">
        <strong>${examData.name}</strong> (${examData.type.toUpperCase()}) - ${calculateAge(examData.dob)} anos<br>
        Nasc: ${examData.dob} | Operador: ${examData.operator}<br>
        <small style="color: #666; font-style: italic;">📱 Exame em andamento em outro computador</small>
        ${measureInfo}
      </div>
    `;
  }

  // Adicionar evento de clique no card para parar o alarme
  patientDiv.addEventListener('click', () => {
    stopAlarm();
  });

  list.appendChild(patientDiv);
}

/* === Fluxo de paquimetria para exames concluídos === */
function createPaquimetriaFlow(exam, container) {
  const flowDiv = document.createElement('div');
  flowDiv.className = 'paquimetria-flow';
  
  // Campo OD
  const odStep = document.createElement('div');
  odStep.className = 'paquimetria-step';
  const odLabel = document.createElement('label');
  odLabel.textContent = 'Paquimetria OD:';
  const odInput = document.createElement('input');
  odInput.type = 'number';
  odInput.value = exam.paquimetria?.od || '';
  odInput.maxLength = 3;
  odInput.placeholder = '000';
  
  odStep.appendChild(odLabel);
  odStep.appendChild(odInput);
  
  // Campo OE
  const oeStep = document.createElement('div');
  oeStep.className = 'paquimetria-step';
  const oeLabel = document.createElement('label');
  oeLabel.textContent = 'Paquimetria OE:';
  const oeInput = document.createElement('input');
  oeInput.type = 'number';
  oeInput.value = exam.paquimetria?.oe || '';
  oeInput.maxLength = 3;
  oeInput.placeholder = '000';
  
  oeStep.appendChild(oeLabel);
  oeStep.appendChild(oeInput);
  
  // Campo Observação
  const obsStep = document.createElement('div');
  obsStep.className = 'paquimetria-step';
  const obsLabel = document.createElement('label');
  obsLabel.textContent = 'Observações:';
  const obsTextarea = document.createElement('textarea');
  obsTextarea.value = exam.observation || '';
  obsTextarea.placeholder = 'Digite observações...';
  
  obsStep.appendChild(obsLabel);
  obsStep.appendChild(obsTextarea);
  
  flowDiv.appendChild(odStep);
  flowDiv.appendChild(oeStep);
  flowDiv.appendChild(obsStep);
  
  // Lógica de navegação automática
  odInput.addEventListener('input', (e) => {
    if (e.target.value.length === 3) {
      oeInput.focus();
    }
  });
  
  oeInput.addEventListener('input', (e) => {
    if (e.target.value.length === 3) {
      obsTextarea.focus();
    }
  });
  
  // Salvar apenas quando todos os campos estão preenchidos
  function tryToSave() {
    const odValue = odInput.value.trim();
    const oeValue = oeInput.value.trim();
    const obsValue = obsTextarea.value.trim();
    
    if (odValue.length === 3 && oeValue.length === 3) {
      // Atualizar dados do exame
      if (!exam.paquimetria) exam.paquimetria = { od: '', oe: '' };
      exam.paquimetria.od = odValue;
      exam.paquimetria.oe = oeValue;
      exam.observation = obsValue;
      
      // Salvar no Firebase
      saveToFirebase(exam);
      showMessage("Paquimetria e observações salvas!");
    }
  }
  
  // Eventos para salvar
  odInput.addEventListener('blur', tryToSave);
  oeInput.addEventListener('blur', tryToSave);
  obsTextarea.addEventListener('blur', tryToSave);
  
  // Ctrl+Enter para salvar observações
  obsTextarea.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      tryToSave();
    }
  });
  
  container.appendChild(flowDiv);
}

/* === Impressão de um exame (A5) === */
function printIndividualExam(exam) {
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
  win.document.write(`<div class="block"><strong>Data do Exame:</strong> ${exam.dateDisplay || exam.dateISO}</div>`);

  win.document.write(`<h2>Resultado de Exames</h2>`);
  win.document.write(`<h3>${exam.type === 'tsh' ? 'Teste de Sobrecarga Hídrica' : 'Curva Tensional de 3 Medidas'}</h3>`);

  (exam.measures || []).forEach((m, i) => {
    let descricao = m.measure;
    
    if (exam.type === 'tsh') {
      // Formato específico para TSH
      if (i === 0) {
        descricao = "Antes da ingestão de água:";
      } else if (i === 1) {
        descricao = "15 minutos após da ingestão de água:";
      } else if (i === 2) {
        descricao = "30 minutos após da ingestão de água:";
      } else if (i === 3) {
        descricao = "45 minutos após da ingestão de água:";
      }
      win.document.write(`<div class="result-line"><strong>${descricao}</strong><br><br>${m.pioOD || '--'} mmHg | ${m.pioOE || '--'} mmHg<br><br></div>`);
    } else if (exam.type === 'curva' && exam.measures.length > 1) {
      // Formato para Curva Tensional
      const firstTime = exam.start;
      if (firstTime) {
        const medidaTime = new Date(firstTime.getTime() + i * 3 * 60 * 60 * 1000);
        const hh = medidaTime.getHours().toString().padStart(2, '0');
        const mm = medidaTime.getMinutes().toString().padStart(2, '0');
        descricao = `${i + 1}ª Medida (${hh}:${mm})`;
      } else {
        descricao = `${i + 1}ª Medida (${m.time || '--:--'})`;
      }
      win.document.write(`<div class="result-line"><strong>${descricao}</strong><br>${m.pioOD || '--'} mmHg | ${m.pioOE || '--'} mmHg</div>`);
    } else {
      // Formato padrão
      win.document.write(`<div class="result-line"><strong>${descricao}</strong><br>${m.pioOD || '--'} mmHg | ${m.pioOE || '--'} mmHg</div>`);
    }
  });

  const pq = exam.paquimetria;
  if (pq && (pq.od || pq.oe)) {
    win.document.write(`<div class="section-title">Paquimetria</div>`);
    win.document.write(`<div class="result-line">Olho Direito: ${pq.od || '--'} µm | Olho Esquerdo: ${pq.oe || '--'} µm</div>`);
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

  // Separar exames do dia e antigos
  const todayExams = history.filter(exam => exam.end && exam.dateISO === todayISO);
  const oldExams = history.filter(exam => exam.end && exam.dateISO !== todayISO).sort((a, b) => new Date(b.start) - new Date(a.start));

  // Atualizar histórico do dia
  todayExams.forEach((exam) => {
    const container = createExamItem(exam, true); // true = editável
    historyDiv.appendChild(container);
  });

  // Atualizar histórico antigo com paginação
  updateOldHistoryWithPagination(oldExams);
}

/* === Criar item de exame === */
function createExamItem(exam, isEditable = false) {
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
  printBtn.onclick = () => printIndividualExam(exam);

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '🗑️';
  deleteBtn.className = 'print-btn danger';
  deleteBtn.onclick = () => {
    if (confirm('Tem certeza que deseja excluir este exame?')) {
      deleteExamFromFirebase(exam.id);
    }
  };

  const detail = document.createElement('div');
  detail.className = 'exam-detail';
  detail.innerHTML = `
    ${ (exam.measures || []).map((m, i) => {
      const label = exam.type === 'tsh' && i === 0 ? '1ª Medida (Sem Água)' : m.measure;
      return `➤ ${label} (${m.time}) | PIO OD: ${m.pioOD || '-'} mmHg | PIO OE: ${m.pioOE || '-'} mmHg<br>`;
    }).join('')}
  `;

  toggle.onclick = () => {
    const isOpen = detail.classList.contains('open');
    
    if (isOpen) {
      // Fechando
      detail.classList.remove('open');
      detail.classList.add('closing');
      toggle.textContent = '▼';
      
      // Remove a classe closing após a animação
      setTimeout(() => {
        detail.classList.remove('closing');
      }, 400);
    } else {
      // Abrindo
      detail.classList.remove('closing');
      detail.classList.add('open');
      toggle.textContent = '▲';
    }
  };

  // Adicionar fluxo de paquimetria apenas para exames editáveis (histórico do dia)
  if (isEditable) {
    createPaquimetriaFlow(exam, detail);
  } else {
    // Para histórico antigo, mostrar apenas informações (somente leitura)
    const pqDiv = document.createElement('div');
    pqDiv.innerHTML = `
      <div style="margin-top: 10px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
        <strong>Paquimetria:</strong> OD: ${exam.paquimetria?.od || '--'} µm | OE: ${exam.paquimetria?.oe || '--'} µm<br>
        <strong>Observações:</strong> ${exam.observation || 'Nenhuma observação'}
      </div>
    `;
    detail.appendChild(pqDiv);
  }

  container.append(basicInfo, toggle, printBtn, deleteBtn, detail);
  return container;
}

/* === Atualizar histórico antigo com paginação === */
function updateOldHistoryWithPagination(oldExams) {
  const totalItems = oldExams.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = oldExams.slice(startIndex, endIndex);

  // Limpar conteúdo anterior
  oldHistoryDiv.innerHTML = "";

  // Adicionar controles de paginação no topo
  if (totalPages > 1) {
    const topPagination = createPaginationControls(totalItems, totalPages);
    oldHistoryDiv.appendChild(topPagination);
  }

  // Criar container de grade para melhor visualização
  const gridContainer = document.createElement('div');
  gridContainer.className = 'old-history-grid';
  gridContainer.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 15px;
    margin: 20px 0;
  `;

  // Adicionar itens da página atual em formato de grade
  currentItems.forEach((exam) => {
    const container = createCompactExamItem(exam);
    gridContainer.appendChild(container);
  });

  oldHistoryDiv.appendChild(gridContainer);

  // Adicionar controles de paginação no final
  if (totalPages > 1) {
    const bottomPagination = createPaginationControls(totalItems, totalPages);
    oldHistoryDiv.appendChild(bottomPagination);
  }
}

/* === Criar item compacto para histórico antigo === */
function createCompactExamItem(exam) {
  const container = document.createElement('div');
  container.className = 'compact-exam-item';
  container.style.cssText = `
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 15px;
    background: #f9f9f9;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  
  // Hover effect
  container.addEventListener('mouseenter', () => {
    container.style.transform = 'translateY(-2px)';
    container.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
  });
  container.addEventListener('mouseleave', () => {
    container.style.transform = 'translateY(0)';
    container.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
  });

  const header = document.createElement('div');
  header.style.cssText = `
    font-weight: bold;
    font-size: 16px;
    color: #333;
    margin-bottom: 8px;
    border-bottom: 1px solid #eee;
    padding-bottom: 8px;
  `;
  header.textContent = exam.name;

  const info = document.createElement('div');
  info.style.cssText = `
    font-size: 13px;
    color: #666;
    line-height: 1.4;
    margin-bottom: 10px;
  `;
  info.innerHTML = `
    <div><strong>Tipo:</strong> ${exam.type.toUpperCase()}</div>
    <div><strong>Data:</strong> ${exam.dateDisplay || exam.dateISO}</div>
    <div><strong>Operador:</strong> ${exam.operator}</div>
    <div><strong>Idade:</strong> ${calculateAge(exam.dob)} anos</div>
  `;

  const measures = document.createElement('div');
  measures.style.cssText = `
    font-size: 12px;
    background: #fff;
    padding: 8px;
    border-radius: 4px;
    margin-bottom: 10px;
  `;
  let measuresText = '<strong>Medidas:</strong><br>';
  (exam.measures || []).forEach((m, i) => {
    measuresText += `• ${m.measure}: ${m.pioOD || '--'}/${m.pioOE || '--'} mmHg<br>`;
  });
  measures.innerHTML = measuresText;

  const paquimetria = document.createElement('div');
  paquimetria.style.cssText = `
    font-size: 12px;
    background: #e8f4fd;
    padding: 6px;
    border-radius: 4px;
    margin-bottom: 10px;
  `;
  paquimetria.innerHTML = `<strong>Paquimetria:</strong> OD: ${exam.paquimetria?.od || '--'} µm | OE: ${exam.paquimetria?.oe || '--'} µm`;

  const actions = document.createElement('div');
  actions.style.cssText = `
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  `;

  const printBtn = document.createElement('button');
  printBtn.innerHTML = '🖨️';
  printBtn.title = 'Imprimir';
  printBtn.style.cssText = `
    padding: 6px 10px;
    border: 1px solid #007bff;
    background: #007bff;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;
  printBtn.onclick = () => printIndividualExam(exam);

  const deleteBtn = document.createElement('button');
  deleteBtn.innerHTML = '🗑️';
  deleteBtn.title = 'Excluir';
  deleteBtn.style.cssText = `
    padding: 6px 10px;
    border: 1px solid #dc3545;
    background: #dc3545;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;
  deleteBtn.onclick = () => {
    if (confirm(`Excluir exame de ${exam.name}?`)) {
      deleteExamFromFirebase(exam.id);
    }
  };

  actions.appendChild(printBtn);
  actions.appendChild(deleteBtn);

  container.appendChild(header);
  container.appendChild(info);
  container.appendChild(measures);
  container.appendChild(paquimetria);
  container.appendChild(actions);

  return container;
}

/* === Criar controles de paginação === */
function createPaginationControls(totalItems, totalPages) {
  const paginationDiv = document.createElement('div');
  paginationDiv.className = 'pagination-controls';

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '← Anterior';
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      updateHistory();
    }
  };

  const pageInfo = document.createElement('span');
  pageInfo.className = 'pagination-info';
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  pageInfo.textContent = `Mostrando ${totalItems} de ${totalItems} exames | Página ${currentPage} de ${totalPages}`;

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Próxima →';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = () => {
    if (currentPage < totalPages) {
      currentPage++;
      updateHistory();
    }
  };

  paginationDiv.appendChild(prevBtn);
  paginationDiv.appendChild(pageInfo);
  paginationDiv.appendChild(nextBtn);

  return paginationDiv;
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
    win.document.write(`<div class="block"><strong>Medidas:</strong><br>`);
    (exam.measures || []).forEach((m, i) => {
      const label = exam.type === 'tsh' && i === 0 ? '1ª Medida (Sem Água)' : m.measure;
      win.document.write(`➤ ${label} (${m.time}) | PIO OD: ${m.pioOD || '-'} mmHg | PIO OE: ${m.pioOE || '-'} mmHg<br>`);
    });
    win.document.write(`</div>`);

    if (exam.paquimetria?.od || exam.paquimetria?.oe) {
      win.document.write(`<div class="block"><strong>Paquimetria:</strong> Olho Direito: ${exam.paquimetria.od || '--'} µm | Olho Esquerdo: ${exam.paquimetria.oe || '--'} µm</div>`);
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
    // Filtrar cards compactos no histórico antigo
    const compactItems = oldHistoryDiv.querySelectorAll('.compact-exam-item');
    const examItems = oldHistoryDiv.querySelectorAll('.exam-item');
    
    // Filtrar cards compactos (novo layout)
    compactItems.forEach(item => {
      const match = item.innerText.toLowerCase().includes(term);
      item.style.display = match || term === '' ? 'block' : 'none';
    });
    
    // Filtrar cards tradicionais (fallback)
    examItems.forEach(item => {
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

