const form = document.getElementById('patient-form');
const list = document.getElementById('patients-list');
const historyDiv = document.getElementById('history');
const oldHistoryDiv = document.getElementById('old-history');
const alertSound = document.getElementById('alertSound');

const dobInput = document.getElementById('dob');
dobInput.addEventListener('input', () => {
  const value = dobInput.value;
  const year = value.split('-')[0];
  if (year.length > 4) {
    showMessage('⚠️ Ano inválido. Use apenas 4 dígitos no ano.');
    dobInput.value = '';
  }
});

const history = JSON.parse(localStorage.getItem('historyData')) || [];
updateHistory();

function showMessage(text, duration = 4000) {
  const msg = document.getElementById('message');
  msg.textContent = text;
  msg.style.display = 'block';
  setTimeout(() => {
    msg.style.display = 'none';
  }, duration);
}

function saveHistory() {
  localStorage.setItem('historyData', JSON.stringify(history));
}

function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(div => div.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(tab).style.display = 'block';
  document.querySelector(`.tab-btn[onclick="showTab('${tab}')"]`).classList.add('active');
}

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
form.addEventListener('submit', function (e) {
  e.preventDefault();
  const name = document.getElementById('name').value;
  const dob = document.getElementById('dob').value;
  const operator = document.getElementById('operator').value || "Anderson";
  const type = document.getElementById('exam-type').value;
  const observation = document.getElementById('observation')?.value || '';
  const startTime = new Date();
  const patientData = {
    name, dob, operator, type, observation,
    start: startTime, end: null, measures: [],
    date: formatDate(startTime)
  };
  const patientDiv = document.createElement('div');
  patientDiv.classList.add('patient');
  patientDiv.innerHTML = `
    <strong>${name}</strong> (${type.toUpperCase()}) - ${calculateAge(dob)} anos<br>
    Nasc: ${dob} | Operador: ${operator}<br><br>
    <button onclick="startInitial('${type}', this, ${history.length})">Iniciar Primeira Medida</button>
    <div class="timer-container"></div>`;
  list.appendChild(patientDiv);
  history.push(patientData);
  saveHistory();
  form.reset();
});

function createInput(placeholder) {
  const input = document.createElement('input');
  input.type = 'number';
  input.placeholder = placeholder;
  input.classList.add('pio');
  return input;
}

function createTimerBlock(num, targetTime) {
  const timerDiv = document.createElement('div');
  timerDiv.classList.add('timer');
  const timeStr = formatTime(targetTime);
  const countdownSpan = document.createElement('span');
  countdownSpan.textContent = "Carregando...";
  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirmar medida';
  timerDiv.innerHTML = `<strong>Medida ${num}:</strong> ${timeStr} - `;
  timerDiv.appendChild(countdownSpan);
  timerDiv.appendChild(confirmBtn);
  return { timerDiv, countdownSpan, confirmBtn };
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

  timerDiv.appendChild(pioOD);
  timerDiv.appendChild(pioOE);
  timers.appendChild(timerDiv);

  history[historyIndex].measures.push({
    measure: label,
    time: formatTime(new Date()),
    date: formatDate(now),
    pioOD: '', pioOE: ''
  });

  pioOD.addEventListener('change', () => {
    history[historyIndex].measures[0].pioOD = pioOD.value;
    saveHistory();
  });
  pioOE.addEventListener('change', () => {
    history[historyIndex].measures[0].pioOE = pioOE.value;
    saveHistory();
  });

  if (type === 'tsh') {
    showMessage("🧃 Informe ao paciente que ele precisa tomar 5 copos de água.");
    const waterBtn = document.createElement('button');
    waterBtn.textContent = 'Paciente terminou os 5 copos de água';
    waterBtn.onclick = () => {
      waterBtn.remove();
      createSequentialTimers(3, parent, timers, historyIndex, 15);
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
    const { timerDiv, countdownSpan, confirmBtn } = createTimerBlock(i + 2, targetTime);
    timerDiv.style.display = 'flex';
    measureReady.push(false);
    timers.push(timerDiv);

    confirmBtn.onclick = () => {
      if (!measureReady[i]) {
        showMessage("⏳ Aguarde o cronômetro chegar a zero.");
        return;
      }
      confirmBtn.remove();
      countdownSpan.textContent = "✅ Medida confirmada";
      parent.classList.remove('blink');

      const pioOD = createInput('PIO OD');
      const pioOE = createInput('PIO OE');
      pioOD.addEventListener('input', () => { if (pioOD.value.length >= 2) pioOE.focus(); });
      pioOE.addEventListener('input', () => { if (pioOE.value.length >= 2) pioOE.blur(); });

      timerDiv.appendChild(pioOD);
      timerDiv.appendChild(pioOE);

      history[historyIndex].measures.push({
        measure: `Medida ${i + 2}`,
        time: formatTime(new Date()),
        date: formatDate(new Date()),
        pioOD: '', pioOE: ''
      });

      pioOD.addEventListener('change', () => {
        history[historyIndex].measures.at(-1).pioOD = pioOD.value;
        saveHistory();
      });
      pioOE.addEventListener('change', () => {
        history[historyIndex].measures.at(-1).pioOE = pioOE.value;
        saveHistory();
      });

      if (i + 1 < count) {
        createNext(i + 1);
      } else {
        const finalizeBtn = document.createElement('button');
        finalizeBtn.textContent = 'Finalizar Paciente';
        finalizeBtn.onclick = () => {
          history[historyIndex].end = new Date();
          parent.remove();
          saveHistory();
          updateHistory();
        };
        parent.appendChild(finalizeBtn);
      }
    };

    container.appendChild(timerDiv);
    startCountdown(targetTime, countdownSpan, confirmBtn, measureReady, i, parent);
  }

  createNext(0);
}
function updateHistory() {
  historyDiv.innerHTML = "";
  oldHistoryDiv.innerHTML = "";
  const today = formatDate(new Date());

  history.forEach((exam) => {
    if (!exam.end) return;
    const isToday = exam.date === today;
    const container = document.createElement('div');
    container.className = 'exam-item';

    const basicInfo = document.createElement('div');
    basicInfo.innerHTML = `
      <strong>${exam.name}</strong> (${exam.type.toUpperCase()}) - ${calculateAge(exam.dob)} anos<br>
      Data: ${exam.date}
    `;

    const toggle = document.createElement('button');
    toggle.textContent = '⬇';
    toggle.classList.add('toggle-btn');
    const detail = document.createElement('div');
    detail.style.display = 'none';
    toggle.onclick = () => {
      detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
      toggle.textContent = toggle.textContent === '⬇' ? '⬆' : '⬇';
    };

    const printBtn = document.createElement('button');
    printBtn.textContent = '🖨️';
    printBtn.classList.add('toggle-btn');
    printBtn.onclick = () => printSingleExam(exam);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️';
    deleteBtn.classList.add('toggle-btn');
    deleteBtn.onclick = () => {
      const senha = prompt("Digite a senha para apagar o histórico:");
      if (senha !== "adminAnderson") {
        alert("Senha incorreta. Ação cancelada.");
        return;
      }
      if (confirm(`Apagar exame de ${exam.name}?`)) {
        const i = history.indexOf(exam);
        if (i !== -1) {
          history.splice(i, 1);
          saveHistory();
          updateHistory();
        }
      }
    };

    detail.innerHTML = `
      <p>Data de Nascimento: ${exam.dob} (${calculateAge(exam.dob)} anos)</p>
      <p>Operador: ${exam.operator}</p>
      <p>Observações:<br><pre>${exam.observation || '-'}</pre></p>
      <p>Início: ${formatTime(exam.start)} | Fim: ${formatTime(exam.end)}</p>
      <strong>Medidas:</strong><br>
      ${exam.measures.map((m, i) => `➤ ${exam.type === 'tsh' && i === 0 ? '1ª Medida (Sem Água)' : m.measure} (${m.time}) | PIO OD: ${m.pioOD || '-'} | PIO OE: ${m.pioOE || '-'}<br>`).join('')}
    `;

    container.append(basicInfo, toggle, printBtn, deleteBtn, detail);
    (isToday ? historyDiv : oldHistoryDiv).appendChild(container);
  });
}

function printSingleExam(exam) {
  const win = window.open('', '', 'width=800,height=600');
  win.document.write('<html><head><title></title>');
  win.document.write(`
    <style>
      @page { size: A5; margin: 10mm; }
      body { font-family: Arial; font-size: 12px; }
      .block { margin-bottom: 6px; }
      pre { margin: 0; white-space: pre-wrap; word-wrap: break-word; }
    </style>
  `);
  win.document.write('</head><body>');
  win.document.write(`<div class="block"><strong>Paciente:</strong> ${exam.name}</div>`);
  win.document.write(`<div class="block"><strong>Data de Nascimento:</strong> ${exam.dob} (${calculateAge(exam.dob)} anos)</div>`);
  win.document.write(`<div class="block"><strong>Data do Exame:</strong> ${exam.date}</div>`);
  win.document.write(`<div class="block"><strong>Tipo de Exame:</strong> ${exam.type.toUpperCase()}</div>`);
  win.document.write(`<div class="block"><strong>Operador:</strong> ${exam.operator}</div>`);
  win.document.write(`<div class="block"><strong>Observações:</strong><br><pre>${exam.observation || '-'}</pre></div>`);
  win.document.write(`<div class="block"><strong>Início:</strong> ${formatTime(exam.start)} | <strong>Fim:</strong> ${formatTime(exam.end)}</div>`);
  win.document.write(`<div class="block"><strong>Medidas:</strong><br>`);
  exam.measures.forEach((m, i) => {
    const label = exam.type === 'tsh' && i === 0 ? '1ª Medida (Sem Água)' : m.measure;
    win.document.write(`➤ ${label} (${m.time}) | PIO OD: ${m.pioOD || '-'} | PIO OE: ${m.pioOE || '-'}<br>`);
  });
  win.document.write('</div></body></html>');
  win.document.close();
  win.print();
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
    win.document.write(`<div class="block"><strong>Paciente:</strong> ${exam.name}</div>`);
    win.document.write(`<div class="block"><strong>Data de Nascimento:</strong> ${exam.dob} (${calculateAge(exam.dob)} anos)</div>`);
    win.document.write(`<div class="block"><strong>Data do Exame:</strong> ${exam.date}</div>`);
    win.document.write(`<div class="block"><strong>Tipo de Exame:</strong> ${exam.type.toUpperCase()}</div>`);
    win.document.write(`<div class="block"><strong>Operador:</strong> ${exam.operator}</div>`);
    win.document.write(`<div class="block"><strong>Observações:</strong><br><pre>${exam.observation || '-'}</pre></div>`);
    win.document.write(`<div class="block"><strong>Início:</strong> ${formatTime(exam.start)} | <strong>Fim:</strong> ${formatTime(exam.end)}</div>`);
    win.document.write(`<div class="block"><strong>Medidas:</strong><br>`);
    exam.measures.forEach((m, i) => {
      const label = exam.type === 'tsh' && i === 0 ? '1ª Medida (Sem Água)' : m.measure;
      win.document.write(`➤ ${label} (${m.time}) | PIO OD: ${m.pioOD || '-'} | PIO OE: ${m.pioOE || '-'}<br>`);
    });
    win.document.write('</div></div>');
  });

  win.document.write('</body></html>');
  win.document.close();
  win.print();
}

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

function clearHistory(type) {
  const senha = prompt("Digite a senha para apagar o histórico:");
  if (senha !== "adminAnderson") {
    alert("Senha incorreta. Ação cancelada.");
    return;
  }

  if (type === 'day') {
    if (confirm("Apagar todo o histórico do dia?")) {
      const today = formatDate(new Date());
      const remaining = history.filter(p => p.date !== today);
      history.length = 0;
      history.push(...remaining);
      saveHistory();
      updateHistory();
    }
  } else if (type === 'all') {
    if (confirm("Deseja apagar TODO o histórico?")) {
      history.length = 0;
      saveHistory();
      updateHistory();
    }
  }
}
