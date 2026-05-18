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
// 🎤 2. ГОЛОСОВОЙ ВВОД + ПАРСИНГ ДАТ
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
    document.getElementById('voice-status').textContent = 'Ошибка распознавания. Попробуйте снова.';
    isListening = false;
    document.getElementById('btn-mic').classList.remove('listening');
  };

  document.getElementById('btn-mic').onclick = () => { if (!isListening) rec.start(); };
} else {
  document.getElementById('btn-mic').style.display = 'none';
  document.getElementById('voice-status').textContent = 'Голосовой ввод не поддерживается';
}

// Функция умного распознавания дат
function autoParseDate(text) {
  const now = new Date();
  let target = new Date(now);
  let matched = false;

  // 🔄 1. Распознавание повторов
  let recurrence = 'none';  if (/кажд[ыо]й день|ежедневно/i.test(text)) recurrence = 'daily';
  else if (/каждую неделю|еженедельно/i.test(text)) recurrence = 'weekly';
  else if (/кажд[ыо]й месяц|ежемесячно/i.test(text)) recurrence = 'monthly';
  document.getElementById('task-recurrence').value = recurrence;

  // 📅 2. Распознавание дат
  
  // "Завтра" или "Послезавтра"
  if (text.includes('завтра')) { target.setDate(target.getDate() + 1); matched = true; }
  if (text.includes('послезавтра')) { target.setDate(target.getDate() + 2); matched = true; }
  
  // "Через X часов"
  const hoursMatch = text.match(/через\s+(\d+)\s+час/);
  if (hoursMatch) { target.setHours(target.getHours() + parseInt(hoursMatch[1])); matched = true; }
  
  // "Через X минут"
  const minsMatch = text.match(/через\s+(\d+)\s+минут/);
  if (minsMatch) { target.setMinutes(target.getMinutes() + parseInt(minsMatch[1])); matched = true; }
  
  // "В 18:00" или "в 9:30"
  const timeMatch = text.match(/в\s+(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    target.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]));
    // Если время уже прошло сегодня, ставим на завтра
    if (target < now) target.setDate(target.getDate() + 1);
    matched = true;
  }

  // 🕐 3. ЕСЛИ НЕ РАСПОЗНАЛИ ДАТУ/ВРЕМЯ — ставим дефолт (Текущее время + 1 час)
  const pad = n => n.toString().padStart(2, '0');
  
  if (!matched) {
    // Берем текущее время, добавляем 1 час, округляем минуты до 00 для красоты
    target = new Date();
    target.setHours(target.getHours() + 1);
    target.setMinutes(0);
  }
  
  // Всегда заполняем поле даты (формат YYYY-MM-DDTHH:MM)
  document.getElementById('task-time').value = `${target.getFullYear()}-${pad(target.getMonth()+1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
}

// ============================================
//  3. ЭКСПОРТ В КАЛЕНДАРЬ (ICS)
// ============================================
function openInCalendar(task) {
  const date = new Date(task.reminderTime);
  const pad = n => n.toString().padStart(2, '0');
  
  // Форматируем дату для ICS (UTC)  const dtStart = `${date.getUTCFullYear()}${pad(date.getUTCMonth()+1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
  
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VoiceCal//RU//',
    'BEGIN:VEVENT',
    `SUMMARY:${task.text}`,
    `DTSTART:${dtStart}`,
    `UID:${task.id}@voicecal`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'reminder.ics';
  document.body.appendChild(a);
  a.click(); // Триггер открытия календаря
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================
// 🔔 4. УВЕДОМЛЕНИЯ (ПРОВЕРКА КАЖДУЮ МИНУТУ)
// ============================================
function requestNotifPerm() {
  if (!('Notification' in window)) return alert('Уведомления не поддерживаются');
  Notification.requestPermission().then(p => {
    document.getElementById('btn-perm').textContent = p === 'granted' ? '✅' : '';
  });
}
document.getElementById('btn-perm').onclick = requestNotifPerm;

// Проверка каждую минуту
setInterval(async () => {
  const now = Date.now();
  const tasks = await db.getAll();
  const due = tasks.filter(t => t.reminderTime <= now && !t.notified);
  
  due.forEach(async task => {
    if (Notification.permission === 'granted') {
      new Notification('⏰ Напоминание', { body: task.text, icon: '' });
      
      // Логика повторов
      if (task.recurrence && task.recurrence !== 'none') {
        const next = new Date(task.reminderTime);
        if (task.recurrence === 'daily') next.setDate(next.getDate() + 1);        else if (task.recurrence === 'weekly') next.setDate(next.getDate() + 7);
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
// 🖼️ 5. UI: ДОБАВЛЕНИЕ И ОТРИСОВКА
// ============================================
document.getElementById('btn-add').onclick = async () => {
  const text = document.getElementById('task-text').value.trim();
  const timeVal = document.getElementById('task-time').value;
  const recurrence = document.getElementById('task-recurrence').value;
  
  if (!text) {
    alert('Введите текст задачи');
    return;
  }
  
  if (!timeVal) {
    alert('Выберите дату и время');
    return;
  }
  
  const newTask = { 
    text, 
    reminderTime: new Date(timeVal).getTime(), 
    recurrence, 
    notified: false, 
    createdAt: Date.now() 
  };
  
  await db.put(newTask);
  
  // 🚀 Автоматически открываем системный календарь
  try {
    openInCalendar(newTask);
  } catch (e) {
    console.warn('Авто-открытие календаря заблокировано');
  }
    // Очистка полей
  document.getElementById('task-text').value = '';
  document.getElementById('task-time').value = '';
  document.getElementById('task-recurrence').value = 'none';
  renderTasks();
};

async function renderTasks() {
  const tasks = await db.getAll();
  const container = document.getElementById('tasks-list');
  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет задач. Добавьте первую!</div>';
    return;
  }

  container.innerHTML = tasks.map(t => {
    const date = new Date(t.reminderTime);
    const dateStr = date.toLocaleString('ru-RU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    
    let badge = '';
    if (t.recurrence === 'daily') badge = ' 🔁 День';
    else if (t.recurrence === 'weekly') badge = ' 🔁 Неделя';
    else if (t.recurrence === 'monthly') badge = ' 🔁 Месяц';

    return `
      <div class="task-card" style="${t.notified ? 'opacity:0.5;text-decoration:line-through' : ''}">
        <div class="task-info">
          <div>${t.text}${badge}</div>
          <div class="task-time">${dateStr}</div>
        </div>
        <div class="task-actions">
          <button class="btn-icon btn-delete" onclick="window.deleteTask(${t.id})">🗑️</button>
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

document.addEventListener('DOMContentLoaded', () => {
  requestNotifPerm();
  renderTasks();
});