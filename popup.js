function formatTime(milliseconds) {
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor((milliseconds % 3600000) / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function createTimerElement(timer, isAnotherTimerRunning) {
    const taskId = timer.taskId;
    const taskUrl = `https://tracker.yandex.ru/${taskId}`;
    const isRunning = timer.isRunning;
    const taskTitle = timer.title ? timer.title.replace(`${taskId} `, '') : '';
    
    const timerElement = document.createElement('div');
    timerElement.className = `timer-info ${isRunning ? 'active' : 'paused'}`;
    
    timerElement.innerHTML = `
        <div class="timer-header">
            <a href="${taskUrl}" target="_blank" class="timer-task">${taskId}</a>
            ${taskTitle ? `<div class="timer-title">${taskTitle}</div>` : ''}
        </div>
        <div class="timer-time">${formatTime(timer.elapsedTime)}</div>
        <div class="timer-status ${isRunning ? 'active' : 'paused'}">
            ${isRunning ? '⚡ Таймер активен' : '⏸ На паузе'}
        </div>
        <button class="timer-control" data-task-id="${taskId}" ${!isRunning && isAnotherTimerRunning ? 'disabled' : ''}>
            ${isRunning ? '⏸ Пауза' : '▶️ Старт'}
        </button>
    `;

    // Добавляем обработчик для кнопки
    const button = timerElement.querySelector('.timer-control');
    button.addEventListener('click', () => {
        if (!isRunning && isAnotherTimerRunning) {
            return; // Блокируем запуск если уже есть активный таймер
        }
        chrome.runtime.sendMessage({
            action: isRunning ? 'stopTimer' : 'startTimer',
            taskId: taskId
        });
    });

    return timerElement;
}

function updateContent(timers) {
    const content = document.getElementById('content');
    content.innerHTML = '';

    const timersList = Object.values(timers);
    
    if (timersList.length === 0) {
        content.innerHTML = '<div class="no-timer">Нет активных таймеров</div>';
        return;
    }

    // Проверяем, есть ли уже запущенный таймер
    const isAnyTimerRunning = timersList.some(timer => timer.isRunning);

    // Сортируем таймеры: сначала по статусу, потом по ключу задачи
    timersList.sort((a, b) => {
        // Сначала сортируем по статусу (активные первыми)
        if (a.isRunning !== b.isRunning) {
            return b.isRunning - a.isRunning;
        }
        
        // Затем сортируем по ключу задачи
        const [aProject, aNumber] = a.taskId.split('-');
        const [bProject, bNumber] = b.taskId.split('-');
        
        // Сначала сравниваем проекты
        if (aProject !== bProject) {
            return aProject.localeCompare(bProject);
        }
        
        // Если проекты одинаковые, сравниваем номера
        return parseInt(aNumber) - parseInt(bNumber);
    });

    // Создаем элементы для каждого таймера
    timersList.forEach(timer => {
        if (timer.elapsedTime > 0) { // Показываем только таймеры с ненулевым временем
            content.appendChild(createTimerElement(timer, isAnyTimerRunning && !timer.isRunning));
        }
    });
}

// Первоначальное обновление состояния
chrome.storage.local.get(null, (storage) => {
    const timers = {};
    for (let key in storage) {
        if (key.startsWith('timer_state_')) {
            timers[key] = storage[key];
        }
    }
    updateContent(timers);
});

// Слушаем изменения в storage
chrome.storage.local.onChanged.addListener((changes) => {
    chrome.storage.local.get(null, (storage) => {
        const timers = {};
        for (let key in storage) {
            if (key.startsWith('timer_state_')) {
                timers[key] = storage[key];
            }
        }
        updateContent(timers);
    });
}); 