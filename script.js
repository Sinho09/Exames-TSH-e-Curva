const form = document.getElementById('patient-form');
const list = document.getElementById('patients-list');
const historyDiv = document.getElementById('history');
const oldHistoryDiv = document.getElementById('old-history');
const alertSound = document.getElementById('alertSound');
const themeBtn = document.getElementById('theme-toggle');
const history = [];

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date) {
  return new Date(date).toLocaleDateString();
}

function calculateAge(dob) {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

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
  loadFromFirebase();
});

function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(div => div.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(tab).style.display = 'block';
  document.querySelector(`.tab-btn[onclick="showTab('${tab}')"]`).classList.add('active');
}

function showMessage(text, duration = 4000) {
  const msg = document.getElementById('message');
  msg.textContent = text;
  msg.style.display = 'block';
  setTimeout(() => { msg.style.display = 'none'; }, duration);
}

form.addEventListener('submit', function (e) {
  e.preventDefault();
  const name = document.getElementById('name').value.trim();
  const dob = document.getElementById('dob').value;
  const operator = document.getElementById('operator').value || "Anderson";
  const type = document.getElementById('exam-type').value;
  const observation = document.getElementById('observation')?.value || '';
  const startTime = new Date();
  
  const patientData = {
  name,
  dob,
  operator,
  type,
  observation,
  start: startTime,
  end: null,
  measures: [],
  date: formatDate(new Date()),,
  paquimetria: { od: '', oe: '' }
};


  const patientDiv = document.createElement('div');
  patientDiv.classList.add('patient');
  patientDiv.innerHTML = `
    <strong>${name}</strong> (${type.toUpperCase()}) - ${calculateAge(dob)} anos<br>
    Nasc: ${dob} | Operador: ${operator}<br><br>
    <button onclick="startInitial('${type}', this, ${history.length})">Iniciar Primeira Medida</button>
    <div class="timer-container"></div>
  `;

  list.appendChild(patientDiv);
  history.push(patientData);
  form.reset();
});

function createInput(placeholder) {
  const input = document.createElement('input');
  input.type = 'number';
  input.placeholder = placeholder;
  input.classList.add('pio');
  return input;
}

function startInitial(type, btn, historyIndex) {
  const parent = btn.parentElement;
  const timers = parent.querySelector('.timer-container');
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

  history[historyIndex].measures.push({
    measure: label,
    time: formatTime(now),
    date: formatDate(now),
    pioOD: '', pioOE: ''
  });

  pioOD.addEventListener('change', () => {
    history[historyIndex].measures[0].pioOD = pioOD.value;
  });
  pioOE.addEventListener('change', () => {
    history[historyIndex].measures[0].pioOE = pioOE.value;
  });

  if (type === 'tsh') {
    showMessage("🧃 Informe ao paciente que ele precisa tomar 5 copos de água.");
    const waterBtn = document.createElement('button');
    waterBtn.textContent = 'Paciente terminou os 5 copos de água';
    waterBtn.onclick = () => {
      waterBtn.remove();
      createSequentialTimers(3, parent, timers, historyIndex, 1);
    };
    parent.appendChild(waterBtn);
  } else if (type === 'curva') {
    createSequentialTimers(2, parent, timers, historyIndex, 180);
  }
}
function createSequentialTimers(count, parent, container, historyIndex, minutes) {
  const timers = [], measureReady = [];
 
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

    timers.push(timerDiv);
    container.appendChild(timerDiv);
    measureReady.push(false);

    confirmBtn.onclick = () => {
      if (!measureReady[i]) {
        showMessage("⏳ Aguarde o cronômetro chegar a zero.");
        return;
      }

      alertSound.pause();
      alertSound.currentTime = 0;

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

      history[historyIndex].measures.push({
        measure: `Medida ${i + 2}`,
        time: formatTime(new Date()),
        date: formatDate(new Date()),
        pioOD: '', pioOE: ''
      });

      pioOD.addEventListener('change', () => {
        history[historyIndex].measures.at(-1).pioOD = pioOD.value;
      });
      pioOE.addEventListener('change', () => {
        history[historyIndex].measures.at(-1).pioOE = pioOE.value;
      });

      if (i + 1 < count) {
        createNext(i + 1);
      } else {
        const finalizeBtn = document.createElement('button');
        finalizeBtn.textContent = 'Finalizar Paciente';
        finalizeBtn.onclick = () => {
          history[historyIndex].end = new Date();
          parent.remove();
          updateHistory();
          saveToFirebase(history[historyIndex]);
        };
        parent.appendChild(finalizeBtn);
      }
    };

    startCountdown(targetTime, countdownSpan, confirmBtn, measureReady, i, parent);
  }

  createNext(0);
}

function startCountdown(target, displayEl, button, statusArray, index, card) {
  const interval = setInterval(() => {
    const now = new Date();
    const remaining = target - now;

    if (remaining <= 0 && !statusArray[index]) {
      displayEl.textContent = "🟢 Pronto para medir";
      statusArray[index] = true;
      card.classList.add('blink');
      alertSound.play();
    }

    if (remaining <= -30000) {
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
function saveToFirebase(exam) {
  if (!firebase || !firebase.firestore) return;
  db.collection("exames").add(exam)
    .then(() => console.log("✅ Exame salvo no Firebase"))
    .catch(error => console.error("❌ Erro ao salvar:", error));
}

function printSingleExam(exam) {
  const win = window.open('', '', 'width=800,height=600');
  win.document.write('<html><head><title>Exame</title>');
  win.document.write(`
    <style>
      @page { size: A5; margin: 10mm; }
      body { font-family: Arial; font-size: 12px; line-height: 1.4; }
      .block { margin-bottom: 10px; }
      h2 { text-align: center; margin-top: 20px; font-size: 18px; }
      h3 { text-align: center; margin: 5px 0 15px 0; font-weight: normal; font-size: 14px; }
      .result-line { margin: 5px 0; }
      .section-title { font-weight: bold; margin: 15px 0 5px 0; }
      pre { white-space: pre-wrap; word-wrap: break-word; margin: 0; }
    </style>
  `);
  win.document.write('</head><body>');

  win.document.write(`<div class="block"><strong>Nome:</strong> ${exam.name}</div>`);
  win.document.write(`<div class="block"><strong>Data de Nascimento:</strong> ${formatDate(exam.dob)}</div>`);
  win.document.write(`<div class="block"><strong>Operador:</strong> ${exam.operator}</div>`);
  win.document.write(`<div class="block"><strong>Data do Exame:</strong> ${formatDate(exam.date)}</div>`);

  const exameCompleto = exam.type === 'tsh'
    ? "Teste de Sobrecarga Hídrica"
    : "Curva Tensional de Três Medidas";

  win.document.write(`<h2>Resultado</h2>`);
  win.document.write(`<h3>${exameCompleto}</h3>`);

  let firstTime = null;
  if (exam.type === 'curva' && exam.measures.length > 0) {
    const [h, m] = exam.measures[0].time.split(':').map(Number);
    firstTime = new Date();
    firstTime.setHours(h, m, 0, 0);
  }

  exam.measures.forEach((m, i) => {
    let descricao = '';

    if (exam.type === 'tsh') {
      descricao = i === 0
        ? "Antes da ingestão de água"
        : `${i * 15} minutos após ingestão de água`;
    } else if (exam.type === 'curva') {
      const medidaTime = new Date(firstTime.getTime() + i * 3 * 60 * 60 * 1000);
      const hh = medidaTime.getHours().toString().padStart(2, '0');
      const mm = medidaTime.getMinutes().toString().padStart(2, '0');
      descricao = `${i + 1}ª Medida (${hh}:${mm})`;
    }

    win.document.write(`<div class="result-line"><strong>${descricao}:</strong> ${m.pioOD || '--'} mmHg | ${m.pioOE || '--'} mmHg</div>`);
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

function updateHistory() {
  historyDiv.innerHTML = "";
  oldHistoryDiv.innerHTML = "";
  const today = new Date().toISOString().split('T')[0];

  history.forEach((exam, index) => {
    if (!exam.end) return;
    const isToday = exam.date === new Date().toISOString().split('T')[0];
    

    const container = document.createElement('div');
    container.className = 'exam-item';

    const basicInfo = document.createElement('div');
    basicInfo.innerHTML = `
      <strong>${exam.name}</strong> (${exam.type.toUpperCase()}) - ${calculateAge(exam.dob)} anos<br>
      Data: ${exam.date}
    `;

    const toggle = document.createElement('button');
    toggle.textContent = '▼';
    toggle.classList.add('toggle-btn');

    const detail = document.createElement('div');
    detail.style.display = 'none';
    toggle.onclick = () => {
      detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
      toggle.textContent = toggle.textContent === '▼' ? '▲' : '▼';
    };

    const printBtn = document.createElement('button');
    printBtn.textContent = '🖨️';
    printBtn.title = 'Imprimir';
    printBtn.classList.add('toggle-btn');
    printBtn.onclick = () => printSingleExam(exam);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Excluir';
    deleteBtn.classList.add('toggle-btn', 'danger');
    deleteBtn.onclick = () => {
      if (!confirm(`Tem certeza que deseja excluir o exame de ${exam.name}?`)) return;

      db.collection("exames")
        .where("name", "==", exam.name)
        .where("dob", "==", exam.dob)
        .where("start", "==", exam.start)
        .get()
        .then(querySnapshot => {
          querySnapshot.forEach(doc => doc.ref.delete());
        });

      history.splice(index, 1);
      updateHistory();
    };

    detail.innerHTML = `
      <p>Data de Nascimento: ${formatDate(exam.dob)} (${calculateAge(exam.dob)} anos)</p>
      <p>Operador: ${exam.operator}</p>
      <p>Início: ${formatTime(exam.start)} | Fim: ${formatTime(exam.end)}</p>
      <strong>Medidas:</strong><br>
      ${exam.measures.map((m, i) => {
        const label = exam.type === 'tsh' && i === 0 ? '1ª Medida (Sem Água)' : m.measure;
        return `➤ ${label} (${m.time}) | PIO OD: ${m.pioOD || '-'} | PIO OE: ${m.pioOE || '-'}<br>`;
      }).join('')}
    `;

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
      <label>Paquimetria OD: <input type="number" value="${exam.paquimetria?.od || ''}" onchange="history[${index}].paquimetria.od = this.value; saveToFirebase(history[${index}])" /></label>
      <label>Paquimetria OE: <input type="number" value="${exam.paquimetria?.oe || ''}" onchange="history[${index}].paquimetria.oe = this.value; saveToFirebase(history[${index}])" /></label>
    `;

    detail.appendChild(obs);
    detail.appendChild(pqDiv);

    container.append(basicInfo, toggle, printBtn, deleteBtn, detail);
    (isToday ? historyDiv : oldHistoryDiv).appendChild(container);
  });
}

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
  win.document.write(`<h2>${title} – Clínica de Olhos Adi Nascimento</h2>`);

  exams.forEach(exam => {
    win.document.write('<div class="exam">');
    win.document.write(`<div class="block"><strong>Nome:</strong> ${exam.name}</div>`);
    win.document.write(`<div class="block"><strong>Data de Nascimento:</strong> ${formatDate(exam.dob)} (${calculateAge(exam.dob)} anos)</div>`);
    win.document.write(`<div class="block"><strong>Data do Exame:</strong> ${exam.date}</div>`);
    win.document.write(`<div class="block"><strong>Tipo de Exame:</strong> ${exam.type.toUpperCase()}</div>`);
    win.document.write(`<div class="block"><strong>Operador:</strong> ${exam.operator}</div>`);
    win.document.write(`<div class="block"><strong>Início:</strong> ${formatTime(exam.start)} | <strong>Fim:</strong> ${formatTime(exam.end)}</div>`);
    win.document.write(`<div class="block"><strong>Medidas:</strong><br>`);
    exam.measures.forEach((m, i) => {
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

document.getElementById('toggle-day-history')?.addEventListener('click', function () {
  const historyWrapper = document.getElementById('history-wrapper');
  const daySearch = document.getElementById('day-history-search');
  const isHidden = historyWrapper.classList.contains('hidden');

  historyWrapper.classList.toggle('hidden');
  daySearch.classList.toggle('hidden');

  this.textContent = isHidden ? '▲' : '▼';
});

function printHistory() {
  const today = formatDate(new Date());
  const exams = history.filter(p => p.end && p.date === today);
  printMultipleExams(exams, "Histórico do Dia");
}

function printOldHistory() {
  const today = formatDate(new Date());
  const exams = history.filter(p => p.end && p.date !== today);
  printMultipleExams(exams, "Histórico Antigo");
}

function exportToCSV(target) {
  const today = formatDate(new Date());
  const exams = history.filter(p => p.end && (target === 'history' ? p.date === today : p.date !== today));
  let csv = "Nome;Data Nasc.;Idade;Tipo;Operador;Data Exame;Início;Fim;Observações;PQ OD;PQ OE\n";

  exams.forEach(exam => {
    const base = `${exam.name};${exam.dob};${calculateAge(exam.dob)};${exam.type};${exam.operator};${exam.date};${formatTime(exam.start)};${formatTime(exam.end)};${exam.observation?.replace(/\n/g, " ") || "-"};${exam.paquimetria?.od || ''};${exam.paquimetria?.oe || ''}`;
    csv += base + "\n";
    exam.measures.forEach((m, i) => {
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

const daySearchInput = document.getElementById('day-history-search');
if (daySearchInput) {
  daySearchInput.addEventListener('input', () => {
    const term = daySearchInput.value.toLowerCase();
    const items = historyDiv.querySelectorAll('.exam-item');
    items.forEach(item => {
      const match = item.innerText.toLowerCase().includes(term);
      item.style.display = match ? 'block' : 'none';
    });
  });
}

function loadFromFirebase() {
  db.collection("exames").get().then(snapshot => {
    history.length = 0;
    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data.paquimetria) data.paquimetria = { od: '', oe: '' };
      history.push(data);
    });
    updateHistory();
  });
}

function clearHistory(tipo) {
  if (!confirm("Tem certeza que deseja limpar o histórico?")) return;

  const hoje = formatDate(new Date());

  db.collection("exames").get().then(snapshot => {
    const batch = db.batch();
    const examesRemovidos = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const isHoje = data.date === hoje;

      if (
        (tipo === 'day' && isHoje) ||
        (tipo === 'all' && !isHoje)
      ) {
        batch.delete(doc.ref);
        examesRemovidos.push(data);
      }
    });

    batch.commit().then(() => {
      console.log("✅ Exames removidos do Firebase");

      if (tipo === 'day') {
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].date === hoje) {
            history.splice(i, 1);
          }
        }
      } else if (tipo === 'all') {
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].date !== hoje) {
            history.splice(i, 1);
          }
        }
      }

      updateHistory();
      showMessage(`🧹 ${examesRemovidos.length} exames apagados (${tipo === 'day' ? 'do dia' : 'antigos'})`);
    }).catch(err => {
      console.error("❌ Erro ao apagar:", err);
      showMessage("Erro ao apagar dados!");
    });
  });
}

// Historico Antigo 
// Ocultar Botões 
document.querySelector("button[onclick='printOldHistory()']").style.display = "none";
document.querySelector("button[onclick=\"exportToCSV('old-history')\"]").style.display = "none";
document.querySelector("button[onclick=\"clearHistory('all')\"]").style.display = "none";

// Mostrar Botões

//document.querySelector("button[onclick='printOldHistory()']").style.display = "inline-block"; 
// document.querySelector("button[onclick=\"exportToCSV('old-history')\"]").style.display = "inline-block";
//document.querySelector("button[onclick=\"clearHistory('all')\"]").style.display = "inline-block";

// Historico do Dia
//Ocultar Botões
document.querySelector("button[onclick='printHistory()']").style.display = "none";
document.querySelector("button[onclick=\"exportToCSV('history')\"]").style.display = "none";
document.querySelector("button[onclick=\"clearHistory('day')\"]").style.display = "none";

//Mostrar Botões

//document.querySelector("button[onclick='printHistory()']").style.display = "inline-block";
//document.querySelector("button[onclick=\"exportToCSV('history')\"]").style.display = "inline-block";
//document.querySelector("button[onclick=\"clearHistory('day')\"]").style.display = "inline-block";
