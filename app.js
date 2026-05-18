// ============================================
// 🗃️ 1. БАЗА ДАННЫХ (IndexedDB)
// ============================================
const DB_NAME = 'voice-cal-db';
const STORE = 'tasks';

const db = {
  async open() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  },
  async getAll() {
    const conn = await this.open();
    return new Promise((res, rej) => {
      const tx = conn.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => res(req.result.sort((a, b) => a.reminderTime - b.reminderTime));
      req.onerror = () => rej(req.error);
    });
  },
  async put(item) {
    const conn = await this.open();
    return new Promise((res, rej) => {
      const tx = conn.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(item);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  },
  async delete(id) {
    const conn = await this.open();
    return new Promise((res, rej) => {
      const tx = conn.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(id);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  },
  async get(id) {
    const conn = await this.open();
    return new Promise((res, rej) => {
      const tx = conn.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });  }
};

// ============================================
// 🔊 2. ОЗВУЧКА (TEXT-TO-SPEECH)
// ============================================
const synth = window.speechSynthesis;
let voices = [];
let autoSpeak = localStorage.getItem('autoSpeak') === 'true';

// Загрузка голосов
function loadVoices() {
  voices = synth.getVoices();
}

if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = loadVoices;
}

// Функция озвучивания
function speak(text, rate = 1.0) {
  if (!synth) {
    showToast('❌ Озвучка не поддерживается');
    return;
  }
  
  // Отменяем предыдущую озвучку
  synth.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  utterance.rate = rate; // Скорость (0.5 - 2.0)
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  
  // Выбираем русский голос если есть
  const ruVoice = voices.find(v => v.lang.includes('ru'));
  if (ruVoice) {
    utterance.voice = ruVoice;
  }
  
  synth.speak(utterance);
}

// Остановка озвучки
function stopSpeak() {
  if (synth) {
    synth.cancel();
  }
}
// ============================================
// 🎤 3. ГОЛОСОВОЙ ВВОД + ПАРСИНГ
// ============================================
const recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let isListening = false;

if (recognition) {
  const rec = new recognition();
  rec.lang = 'ru-RU';
  rec.continuous = false;
  rec.interimResults = false;

  rec.onstart = () => {
    isListening = true;
    document.getElementById('btn-mic').classList.add('listening');
    document.getElementById('voice-status').textContent = 'Слушаю...';
  };
  rec.onend = () => {
    isListening = false;
    document.getElementById('btn-mic').classList.remove('listening');
    document.getElementById('voice-status').textContent = 'Нажмите и скажите задачу';
  };
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    document.getElementById('task-text').value = text;
    autoParseDate(text);
  };
  rec.onerror = () => {
    document.getElementById('voice-status').textContent = 'Ошибка. Попробуйте снова.';
    isListening = false;
    document.getElementById('btn-mic').classList.remove('listening');
  };

  document.getElementById('btn-mic').onclick = () => { if (!isListening) rec.start(); };
} else {
  document.getElementById('btn-mic').style.display = 'none';
  document.getElementById('voice-status').textContent = 'Голосовой ввод не поддерживается';
}

function autoParseDate(text) {
  const now = new Date();
  let target = new Date(now);
  let matched = false;
  const pad = n => n.toString().padStart(2, '0');

  const months = {
    'январ': 0, 'феврал': 1, 'март': 2, 'апрел': 3, 'мая': 4, 'май': 4,
    'июн': 5, 'июл': 6, 'август': 7, 'сентябр': 8, 'октябр': 9, 'ноябр': 10, 'декабр': 11
  };
  let recurrence = 'none';
  if (/кажд[ыо]й день|ежедневно/i.test(text)) recurrence = 'daily';
  else if (/каждую неделю|еженедельно/i.test(text)) recurrence = 'weekly';
  else if (/кажд[ыо]й месяц|ежемесячно/i.test(text)) recurrence = 'monthly';
  document.getElementById('task-recurrence').value = recurrence;

  const dateMatch = text.match(/(\d{1,2})\s+(январ[яь]|феврал[яь]|марта?|апрел[яь]|мая|ма[яй]|июн[яь]|июл[яь]|августа?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])/i);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const monthStr = dateMatch[2].toLowerCase();
    
    let month = -1;
    for (const [key, val] of Object.entries(months)) {
      if (monthStr.includes(key)) {
        month = val;
        break;
      }
    }
    
    if (month >= 0 && day >= 1 && day <= 31) {
      target.setDate(day);
      target.setMonth(month);
      if (target < now) {
        target.setFullYear(target.getFullYear() + 1);
      }
      matched = true;
    }
  }

  const timeMatch = text.match(/в\s+(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    target.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]));
    matched = true;
  }

  const todayMatch = text.match(/сегодня\s+в\s+(\d{1,2}):(\d{2})/i);
  if (todayMatch) {
    target = new Date(now);
    target.setHours(parseInt(todayMatch[1]), parseInt(todayMatch[2]));
    matched = true;
  }
  
  if (text.includes('завтра') && !todayMatch) { 
    target = new Date(now);
    target.setDate(target.getDate() + 1); 
    matched = true; 
  }
  
  const tomorrowMatch = text.match(/завтра\s+в\s+(\d{1,2}):(\d{2})/i);  if (tomorrowMatch) {
    target = new Date(now);
    target.setDate(target.getDate() + 1);
    target.setHours(parseInt(tomorrowMatch[1]), parseInt(tomorrowMatch[2]));
    matched = true;
  }
  
  if (text.includes('послезавтра') && !tomorrowMatch) { 
    target = new Date(now);
    target.setDate(target.getDate() + 2); 
    matched = true; 
  }
  
  const hoursMatch = text.match(/через\s+(\d+)\s+час/);
  if (hoursMatch) { 
    target = new Date(now);
    target.setHours(target.getHours() + parseInt(hoursMatch[1])); 
    matched = true; 
  }
  
  const minsMatch = text.match(/через\s+(\d+)\s+минут/);
  if (minsMatch) { 
    target = new Date(now);
    target.setMinutes(target.getMinutes() + parseInt(minsMatch[1])); 
    matched = true; 
  }

  if (!matched) {
    target = new Date();
    target.setHours(target.getHours() + 1);
    target.setMinutes(0);
  }
  
  document.getElementById('task-time').value = `${target.getFullYear()}-${pad(target.getMonth()+1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
}

// ============================================
// 📅 4. GOOGLE CALENDAR URL
// ============================================
function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#334155;color:#fff;padding:12px 20px;border-radius:8px;font-size:0.9rem;z-index:9999;';
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.3s'; setTimeout(()=>t.remove(),300); }, 2500);
}

function openGoogleCalendar(task) {
  const date = new Date(task.reminderTime);
  const endDate = new Date(date.getTime() + 60 * 60 * 1000);  
  const pad = n => n.toString().padStart(2, '0');
  const formatDate = d => 
    `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  
  const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const text = `&text=${encodeURIComponent(task.text)}`;
  const dates = `&dates=${formatDate(date)}/${formatDate(endDate)}`;
  const details = `&details=${encodeURIComponent('Создано в Голосовом Ассистенте')}`;
  
  const url = baseUrl + text + dates + details;
  
  const newWindow = window.open(url, '_blank');
  
  setTimeout(() => {
    if (!newWindow || newWindow.closed) {
      showToast('📅 Нажмите на задачу чтобы добавить в календарь');
    }
  }, 500);
}

// ============================================
// 🔔 5. УВЕДОМЛЕНИЯ
// ============================================
function requestNotifPerm() {
  if (!('Notification' in window)) return;
  Notification.requestPermission().then(p => {
    document.getElementById('btn-perm').textContent = p === 'granted' ? '✅' : '';
  });
}
document.getElementById('btn-perm').onclick = requestNotifPerm;

setInterval(async () => {
  const now = Date.now();
  const tasks = await db.getAll();
  const due = tasks.filter(t => t.reminderTime <= now && !t.notified);
  
  due.forEach(async task => {
    if (Notification.permission === 'granted') {
      new Notification('⏰ Напоминание', { body: task.text });
      
      // 🔊 Озвучиваем напоминание!
      speak(`Напоминание: ${task.text}`);
      
      if (task.recurrence && task.recurrence !== 'none') {
        const next = new Date(task.reminderTime);
        if (task.recurrence === 'daily') next.setDate(next.getDate() + 1);
        else if (task.recurrence === 'weekly') next.setDate(next.getDate() + 7);
        else if (task.recurrence === 'monthly') next.setMonth(next.getMonth() + 1);
                task.reminderTime = next.getTime();
        task.notified = false;
        await db.put(task);
      } else {
        task.notified = true;
        await db.put(task);
      }
      renderTasks();
    }
  });
}, 60000);

// ============================================
// 🖼️ 6. UI
// ============================================
document.getElementById('btn-add').onclick = () => {
  const text = document.getElementById('task-text').value.trim();
  const timeVal = document.getElementById('task-time').value;
  const recurrence = document.getElementById('task-recurrence').value;
  
  if (!text) return alert('Введите текст задачи');
  if (!timeVal) return alert('Выберите дату и время');
  
  const newTask = { 
    text, 
    reminderTime: new Date(timeVal).getTime(), 
    recurrence, 
    notified: false, 
    createdAt: Date.now() 
  };
  
  openGoogleCalendar(newTask);
  
  db.put(newTask).then(() => {
    document.getElementById('task-text').value = '';
    document.getElementById('task-time').value = '';
    document.getElementById('task-recurrence').value = 'none';
    renderTasks();
    
    // 🔊 Озвучиваем добавление задачи
    if (autoSpeak) {
      speak(`Добавлена задача: ${newTask.text}`);
    }
  });
};

async function renderTasks() {
  const tasks = await db.getAll();
  const container = document.getElementById('tasks-list');
  if (tasks.length === 0) {    container.innerHTML = '<div class="empty-state">Нет задач. Добавьте первую!</div>';
    return;
  }

  container.innerHTML = tasks.map(t => {
    const date = new Date(t.reminderTime);
    const dateStr = date.toLocaleString('ru-RU', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' });
    
    let badge = '';
    if (t.recurrence === 'daily') badge = ' 🔁 День';
    else if (t.recurrence === 'weekly') badge = ' 🔁 Неделя';
    else if (t.recurrence === 'monthly') badge = ' 🔁 Месяц';

    return `
      <div class="task-card" style="${t.notified ? 'opacity:0.5;text-decoration:line-through' : ''}" onclick="window.exportTask(${t.id})">
        <div class="task-info">
          <div>${t.text}${badge}</div>
          <div class="task-time">${dateStr}</div>
        </div>
        <div class="task-actions">
          <button class="btn-icon btn-speak" onclick="event.stopPropagation(); window.speakTask(${t.id})">🔊</button>
          <button class="btn-icon btn-delete" onclick="event.stopPropagation(); window.deleteTask(${t.id})">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

window.deleteTask = async (id) => {
  if (confirm('Удалить задачу?')) {
    await db.delete(id);
    renderTasks();
  }
};

window.speakTask = async (id) => {
  const task = await db.get(id);
  if (task) {
    const date = new Date(task.reminderTime);
    const dateStr = date.toLocaleString('ru-RU', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' });
    speak(`${task.text}. ${dateStr}`);
  }
};

window.exportTask = async (id) => {
  const task = await db.get(id);
  if (task) {
    openGoogleCalendar(task);
  }
};
// Переключение авто-озвучки
window.toggleAutoSpeak = () => {
  autoSpeak = !autoSpeak;
  localStorage.setItem('autoSpeak', autoSpeak);
  document.getElementById('btn-speak-toggle').textContent = autoSpeak ? '🔊' : '🔇';
  showToast(autoSpeak ? '🔊 Авто-озвучка включена' : '🔇 Авто-озвучка выключена');
};

document.addEventListener('DOMContentLoaded', () => {
  requestNotifPerm();
  loadVoices();
  renderTasks();
  
  // Устанавливаем состояние кнопки авто-озвучки
  const btn = document.getElementById('btn-speak-toggle');
  if (btn) {
    btn.textContent = autoSpeak ? '🔊' : '🔇';
  }
});