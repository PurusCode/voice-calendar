// ============================================
// 🗃️ IndexedDB
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
      req.onsuccess = () => res(req.result.sort((a,b) => a.reminderTime - b.reminderTime));
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
  }
};

// ============================================
// 🎤 Голосовой ввод + Парсинг дат и повторов
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

// Простой парсер дат и повторов из русского текста
function autoParseDate(text) {
  const now = new Date();
  let target = new Date(now);
  let matched = false;

  //  Распознавание повторов
  let recurrence = 'none';
  if (/кажд[ыо]й день|ежедневно|раз в день/i.test(text)) recurrence = 'daily';
  else if (/каждую неделю|еженедельно|раз в неделю/i.test(text)) recurrence = 'weekly';
  else if (/кажд[ыо]й месяц|ежемесячно|раз в месяц/i.test(text)) recurrence = 'monthly';
  document.getElementById('task-recurrence').value = recurrence;

  // 📅 Распознавание дат
  if (text.includes('завтра')) { target.setDate(target.getDate() + 1); matched = true; }
  if (text.includes('послезавтра')) { target.setDate(target.getDate() + 2); matched = true; }
  
  const hoursMatch = text.match(/через\s+(\d+)\s+час/);
  if (hoursMatch) { target.setHours(target.getHours() + parseInt(hoursMatch[1])); matched = true; }
  
  const minsMatch = text.match(/через\s+(\d+)\s+минут/);
  if (minsMatch) { target.setMinutes(target.getMinutes() + parseInt(minsMatch[1])); matched = true; }
  
  const dateMatch = text.match(/(\d{1,2})[.\/-](\d{1,2})(?:\s+в\s+(\d{1,2}):(\d{2}))?/);
  if (dateMatch) {
    target.setDate(parseInt(dateMatch[1]));
    target.setMonth(parseInt(dateMatch[2]) - 1);
    if (dateMatch[3]) target.setHours(parseInt(dateMatch[3]), parseInt(dateMatch[4]));
    else target.setHours(12, 0);
    matched = true;
  }
  
  const timeMatch = text.match(/в\s+(\d{1,2}):(\d{2})/);
  if (timeMatch && !dateMatch) {
    target.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]));
    if (target < now) target.setDate(target.getDate() + 1);
    matched = true;
  }

  if (matched) {
    const pad = n => n.toString().padStart(2, '0');
    document.getElementById('task-time').value = `${target.getFullYear()}-${pad(target.getMonth()+1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
  }
}

// ============================================
// 🔔 Уведомления + Логика повторов
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
      
      if (task.recurrence && task.recurrence !== 'none') {
        // 🔄 Вычисляем следующую дату
        const next = new Date(task.reminderTime);
        if (task.recurrence === 'daily') next.setDate(next.getDate() + 1);
        else if (task.recurrence === 'weekly') next.setDate(next.getDate() + 7);
        else if (task.recurrence === 'monthly') next.setMonth(next.getMonth() + 1);
        
        // Обновляем задачу на следующую итерацию
        task.reminderTime = next.getTime();
        task.notified = false;
        await db.put(task);
      } else {
        // Одноразовая задача
        task.notified = true;
        await db.put(task);
      }
      renderTasks();
    }
  });
}, 60000);

document.addEventListener('visibilitychange', () => { if (!document.hidden) renderTasks(); });

// ============================================
// 🖼️ UI: Добавление, Отрисовка, Удаление
// ============================================
document.getElementById('btn-add').onclick = async () => {
  const text = document.getElementById('task-text').value.trim();
  const timeVal = document.getElementById('task-time').value;
  const recurrence = document.getElementById('task-recurrence').value;
  
  if (!text || !timeVal) return alert('Введите задачу и время');
  
  const reminderTime = new Date(timeVal).getTime();
  await db.put({ text, reminderTime, recurrence, notified: false, createdAt: Date.now() });
  
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
    const isPast = date.getTime() <= Date.now();
    const dateStr = date.toLocaleString('ru-RU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    
    let badge = '';
    if (t.recurrence === 'daily') badge = '<span style="color:#3b82f6;font-size:0.75rem">🔁 Ежедневно</span>';
    else if (t.recurrence === 'weekly') badge = '<span style="color:#3b82f6;font-size:0.75rem"> Еженедельно</span>';
    else if (t.recurrence === 'monthly') badge = '<span style="color:#3b82f6;font-size:0.75rem"> Ежемесячно</span>';

    return `
      <div class="task-card" style="${t.notified ? 'opacity:0.5;text-decoration:line-through' : ''}">
        <div class="task-info">
          <div>${t.text} ${badge}</div>
          <div class="task-time" style="${isPast && !t.notified ? 'color:#ef4444;font-weight:bold' : ''}">
            ${isPast && !t.notified ? '⚠️ Просрочено: ' : ''}${dateStr}
          </div>
        </div>
        <div class="task-actions">
          <button class="btn-icon btn-delete" data-id="${t.id}">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.onclick = async (e) => {
      const id = parseInt(e.target.dataset.id);
      await db.delete(id);
      renderTasks();
    };
  });
}

document.addEventListener('DOMContentLoaded', () => {
  requestNotifPerm();
  renderTasks();
});