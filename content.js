class TaskTimer {
    constructor() {
        console.log('TaskTimer: Конструктор инициализирован');
        this.isRunning = false;
        this.startTime = 0;
        this.elapsedTime = 0;
        this.taskId = null;
        this.initialized = false;
        this.showCloseWarning = true; // Default value
        this.resetOnFinish = true; // Default value
        this.loadSettings();
        this.initializeWhenReady();
        this.setupBeforeUnloadHandler();
        this.activeTaskKey = 'activeTaskTimer';
        this.finishedTaskKey = 'finishedTaskTimer'; // Add new key for tracking finished state
        this.setupStorageListener();
        this.localFinishInProgress = false;

        // Add hotkey handlers
        document.addEventListener('keydown', (e) => {
            // Check if we're in an input field
            if (document.activeElement.tagName === 'INPUT' || 
                document.activeElement.tagName === 'TEXTAREA') {
                return;
            }

            // Prevent if any modifier keys are pressed
            if (e.ctrlKey || e.altKey || e.metaKey) {
                return;
            }

            // Start/Pause hotkey (S/Ы)
            if (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'ы') {
                e.preventDefault();
                this.toggleTimer();
            }
        });
    }

    initializeWhenReady() {
        console.log('TaskTimer: Начало проверки инициализации');
        const checkInterval = setInterval(() => {
            console.log('TaskTimer: Проверка состояния документа:', document.readyState);
            if (document.readyState === 'complete') {
                console.log('TaskTimer: Документ загружен, ожидание React приложения...');
                setTimeout(() => {
                    this.taskId = this.getTaskIdFromUrl();
                    console.log('TaskTimer: ID задачи обнаружен:', this.taskId);
                    if (this.taskId && !this.initialized) {
                        console.log('TaskTimer: Инициализация UI для задачи:', this.taskId);
                        this.initializeUI();
                        this.loadSavedTime();
                        this.initialized = true;
                    } else {
                        console.log('TaskTimer: Пропуск инициализации. ID задачи существует:', !!this.taskId, 'Уже инициализирован:', this.initialized);
                    }
                }, 2000);
                clearInterval(checkInterval);
            }
        }, 100);

        window.addEventListener('popstate', () => {
            console.log('TaskTimer: URL изменен');
            this.handleUrlChange();
        });
        window.addEventListener('pushstate', () => {
            console.log('TaskTimer: URL изменен');
            this.handleUrlChange();
        });
        window.addEventListener('replacestate', () => {
            console.log('TaskTimer: URL изменен');
            this.handleUrlChange();
        });
    }

    handleUrlChange() {
        const newTaskId = this.getTaskIdFromUrl();
        console.log('TaskTimer: Обнаружено изменение URL, новый ID задачи:', newTaskId);
        if (newTaskId !== this.taskId) {
            console.log('TaskTimer: ID задачи изменен с', this.taskId, 'на', newTaskId);
            this.taskId = newTaskId;
            this.removeExistingTimer();
            if (this.taskId) {
                this.initializeUI();
                this.loadSavedTime();
            }
        }
    }

    removeExistingTimer() {
        const existingTimer = document.querySelector('.tracker-timer-container');
        if (existingTimer) {
            console.log('TaskTimer: Удаление существующего таймера');
            existingTimer.remove();
        }
    }

    getTaskIdFromUrl() {
        // Match any uppercase letters followed by a hyphen and numbers
        const match = window.location.pathname.match(/\/([A-Z]+)-(\d+)/);
        const taskId = match ? match[0].substring(1) : null;  // Remove leading slash if found
        console.log('TaskTimer: Извлечен ID задачи из URL:', taskId, 'Текущий URL:', window.location.pathname);
        return taskId;
    }

    initializeUI() {
        console.log('TaskTimer: Начало инициализации UI');
        this.removeExistingTimer();

        const timerContainer = document.createElement('div');
        timerContainer.className = 'tracker-timer-container';
        
        this.timerDisplay = document.createElement('div');
        this.timerDisplay.className = 'timer-display';
        this.timerDisplay.textContent = '00:00:00';

        this.startStopButton = document.createElement('button');
        this.startStopButton.className = 'timer-button g-button g-button_view_normal g-button_size_m g-button_pin_round-round';
        this.startStopButton.textContent = 'Старт (S)';
        this.startStopButton.title = 'Hotkey: S';
        this.startStopButton.onclick = () => this.toggleTimer();

        this.finishButton = document.createElement('button');
        this.finishButton.className = 'timer-button g-button g-button_view_normal g-button_size_m g-button_pin_round-round';
        this.finishButton.textContent = 'Учесть';
        this.finishButton.style.display = 'none';
        this.finishButton.onclick = () => this.finishTask();

        this.resetButton = document.createElement('button');
        this.resetButton.className = 'timer-button g-button g-button_view_normal g-button_size_m g-button_pin_round-round';
        this.resetButton.textContent = 'Сброс';
        this.resetButton.style.display = 'none';
        this.resetButton.onclick = () => this.resetTimer();

        this.settingsButton = document.createElement('button');
        this.settingsButton.className = 'timer-button settings-button';
        this.settingsButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" class="g-icon gn-composite-bar-item__icon" fill="currentColor" stroke="none" data-qa="settings-icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16">
                    <g clip-path="url(#a)">
                        <path fill="currentColor" fill-rule="evenodd" d="M7.199 2H8.8a.2.2 0 0 1 .2.2c0 1.808 1.958 2.939 3.524 2.034a.199.199 0 0 1 .271.073l.802 1.388a.199.199 0 0 1-.073.272c-1.566.904-1.566 3.164 0 4.069a.199.199 0 0 1 .073.271l-.802 1.388a.199.199 0 0 1-.271.073C10.958 10.863 9 11.993 9 13.8a.2.2 0 0 1-.199.2H7.2a.199.199 0 0 1-.2-.2c0-1.808-1.958-2.938-3.524-2.034a.199.199 0 0 1-.272-.073l-.8-1.388a.199.199 0 0 1 .072-.271c1.566-.905 1.566-3.165 0-4.07a.199.199 0 0 1-.073-.271l.801-1.388a.199.199 0 0 1 .272-.073C5.042 5.138 7 4.007 7 2.2c0-.11.089-.199.199-.199ZM5.5 2.2c0-.94.76-1.7 1.699-1.7H8.8c.94 0 1.7.76 1.7 1.7a.85.85 0 0 0 1.274.735 1.699 1.699 0 0 1 2.32.622l.802 1.388c.469.813.19 1.851-.622 2.32a.85.85 0 0 0 0 1.472 1.7 1.7 0 0 1 .622 2.32l-.802 1.388a1.699 1.699 0 0 1-2.32.622.85.85 0 0 0-1.274.735c0 .939-.76 1.7-1.699 1.7H7.2a1.7 1.7 0 0 1-1.699-1.7.85.85 0 0 0-1.274-.735 1.698 1.698 0 0 1-2.32-.622l-.802-1.388a1.699 1.699 0 0 1 .622-2.32.85.85 0 0 0 0-1.471 1.699 1.699 0 0 1-.622-2.321l.801-1.388a1.699 1.699 0 0 1 2.32-.622A.85.85 0 0 0 5.5 2.2Zm4 5.8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" clip-rule="evenodd"/>
                    </g>
                    <defs>
                        <clipPath id="a">
                            <path fill="currentColor" d="M0 0h16v16H0z"/>
                        </clipPath>
                    </defs>
                </svg>
            </svg>`;
        this.settingsButton.title = 'Настройки таймера';
        this.settingsButton.onclick = () => this.showSettings();

        timerContainer.appendChild(this.timerDisplay);
        timerContainer.appendChild(this.startStopButton);
        timerContainer.appendChild(this.finishButton);
        timerContainer.appendChild(this.resetButton);
        timerContainer.appendChild(this.settingsButton);

        // Create a list item to contain the timer
        const timerListItem = document.createElement('li');
        timerListItem.className = 'action-bar__item';
        timerListItem.appendChild(timerContainer);

        // Find the action bar
        const actionBar = document.querySelector('ul.gn-action-bar-group.action-bar__start');
        if (actionBar) {
            console.log('TaskTimer: Найдена панель действий, добавление таймера');
            actionBar.appendChild(timerListItem);
        } else {
            console.error('TaskTimer: Не удалось найти панель действий. Повторная попытка через 1 секунду.');
            // Add a retry mechanism since the action bar might load after our initial attempt
            setTimeout(() => {
                const retryActionBar = document.querySelector('ul.gn-action-bar-group.action-bar__start');
                if (retryActionBar) {
                    console.log('TaskTimer: Найдена панель действий при повторной попытке, добавление таймера');
                    retryActionBar.appendChild(timerListItem);
                } else {
                    console.error('TaskTimer: Не удалось найти панель действий даже при повторной попытке');
                }
            }, 1000);
        }
    }

    async loadSavedTime() {
        console.log('TaskTimer: Загрузка сохраненного времени для задачи:', this.taskId);
        if (this.taskId) {
            // Check if task was finished
            chrome.storage.local.get(this.finishedTaskKey, (result) => {
                const finishedTask = result[this.finishedTaskKey];
                if (finishedTask && finishedTask.taskId === this.taskId) {
                    // If task was finished recently (within last minute), respect that state
                    if (Date.now() - finishedTask.timestamp < 60000) {
                        if (this.resetOnFinish) {
                            this.elapsedTime = 0;
                            this.updateDisplay();
                            return;
                        }
                    }
                }

                // Load saved time only if task wasn't finished recently
                chrome.storage.local.get(this.taskId, (result) => {
                    console.log('TaskTimer: Загружено сохраненное время:', result[this.taskId]);
                    if (result[this.taskId]) {
                        this.elapsedTime = result[this.taskId];
                        this.updateDisplay();
                    }
                });
            });

            // Check if this task has an active timer
            const activeTask = await this.checkActiveTimer();
            if (activeTask && activeTask.taskId === this.taskId) {
                console.log('TaskTimer: Найден активный таймер для этой задачи, возобновление состояния');
                this.isRunning = true;
                this.startStopButton.textContent = 'Пауза (S)';
                this.startTime = Date.now() - this.elapsedTime;
                this.timer = setInterval(() => {
                    this.elapsedTime = Date.now() - this.startTime;
                    this.updateDisplay();
                    this.saveTime();
                }, 1000);

                if (this.showCloseWarning) {
                    document.body.classList.add('timer-running');
                }
            }
        }
    }

    saveTime() {
        if (this.taskId && this.isRunning) {
            const saveData = {};
            saveData[this.taskId] = this.elapsedTime;
            chrome.storage.local.set(saveData);
        }
    }

    toggleTimer() {
        if (!this.isRunning) {
            this.startTimer();
        } else {
            this.stopTimer();
        }
    }

    async checkActiveTimer() {
        return new Promise((resolve) => {
            chrome.storage.local.get(this.activeTaskKey, (result) => {
                const activeTask = result[this.activeTaskKey];
                resolve(activeTask);
            });
        });
    }

    setActiveTimer(taskId) {
        return new Promise((resolve) => {
            const data = taskId ? {
                taskId: taskId,
                url: window.location.href
            } : null;
            
            chrome.storage.local.set({
                [this.activeTaskKey]: data
            }, resolve);
        });
    }

    async startTimer() {
        const activeTask = await this.checkActiveTimer();
        
        if (activeTask && activeTask.taskId !== this.taskId) {
            const alertDialog = document.createElement('div');
            alertDialog.className = 'timer-settings-dialog';
            
            const content = document.createElement('div');
            content.className = 'timer-settings-content';
            
            const title = document.createElement('h3');
            title.textContent = 'Активный таймер';
            
            const message = document.createElement('p');
            message.className = 'timer-setting-item';
            message.innerHTML = `Таймер уже запущен для задачи <a href="${activeTask.url}" target="_blank">${activeTask.taskId}</a>.<br>Остановите его перед запуском нового таймера.`;
            
            const closeButton = document.createElement('button');
            closeButton.className = 'timer-button g-button g-button_view_normal g-button_size_m g-button_pin_round-round';
            closeButton.textContent = 'Закрыть';
            closeButton.onclick = () => alertDialog.remove();
            
            content.appendChild(title);
            content.appendChild(message);
            content.appendChild(closeButton);
            alertDialog.appendChild(content);
            document.body.appendChild(alertDialog);
            
            return;
        }

        this.isRunning = true;
        this.startTime = Date.now() - this.elapsedTime;
        this.startStopButton.textContent = 'Пауза (S)';
        
        // Set this task as active first
        await this.setActiveTimer(this.taskId);

        this.timer = setInterval(() => {
            this.elapsedTime = Date.now() - this.startTime;
            this.updateDisplay();
            this.saveTime();
        }, 1000);

        if (this.showCloseWarning) {
            document.body.classList.add('timer-running');
        }
    }

    stopTimer() {
        this.isRunning = false;
        this.startStopButton.textContent = 'Старт (S)';
        clearInterval(this.timer);
        this.saveTime();
        document.body.classList.remove('timer-running');
        
        // Clear active timer
        this.setActiveTimer(null);
    }

    finishTask() {
        this.localFinishInProgress = true; // Устанавливаем флаг
        this.stopTimer();
        const formattedTime = this.formatTimeForInput(this.elapsedTime);
        
        // Set finished state in storage
        chrome.storage.local.set({
            [this.finishedTaskKey]: {
                taskId: this.taskId,
                timestamp: Date.now()
            }
        });

        // Only reset time if the setting is enabled
        if (this.resetOnFinish) {
            this.elapsedTime = 0;
            this.updateDisplay();
            this.saveTime();
        }

        // Simulate pressing 'T' to open Tracker's dialog
        const keyEvent = new KeyboardEvent('keydown', {
            key: 't',
            code: 'KeyT',
            keyCode: 84,
            which: 84,
            bubbles: true,
            cancelable: true
        });
        
        document.dispatchEvent(keyEvent);

        // Wait for the dialog to open and then fill the duration input
        const fillDurationInput = setInterval(() => {
            const durationInput = document.getElementById('duration1');
            if (durationInput) {
                durationInput.value = formattedTime;
                durationInput.dispatchEvent(new Event('input', { bubbles: true }));
                clearInterval(fillDurationInput);
            }
        }, 100);

        // Сбрасываем флаг через небольшую задержку
        setTimeout(() => {
            this.localFinishInProgress = false;
        }, 200);
    }

    formatTimeForInput(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const weeks = Math.floor(days / 7);

        const s = seconds % 60;
        const m = minutes % 60;
        const h = hours % 24;
        const d = days % 7;
        const w = weeks;

        const parts = [];
        if (w > 0) parts.push(`${w}w`);
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        if (s > 0) parts.push(`${s}s`);

        return parts.join(' ') || '0m';  // Return at least '0m' if no time
    }

    updateDisplay() {
        const hours = Math.floor(this.elapsedTime / 3600000);
        const minutes = Math.floor((this.elapsedTime % 3600000) / 60000);
        const seconds = Math.floor((this.elapsedTime % 60000) / 1000);
        
        this.timerDisplay.textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        // Show/hide action buttons based on elapsed time
        const hasTime = this.elapsedTime > 0;
        this.finishButton.style.display = hasTime ? '' : 'none';
        this.resetButton.style.display = hasTime ? '' : 'none';
    }

    loadSettings() {
        chrome.storage.sync.get({
            showCloseWarning: true, // default values
            resetOnFinish: true
        }, (items) => {
            console.log('TaskTimer: Загружены настройки:', items);
            this.showCloseWarning = items.showCloseWarning;
            this.resetOnFinish = items.resetOnFinish;
        });
    }

    setupBeforeUnloadHandler() {
        window.addEventListener('beforeunload', (e) => {
            if (this.isRunning && this.showCloseWarning) {
                e.preventDefault();
                e.returnValue = 'Таймер все еще работает. Вы уверены, что хотите закрыть страницу?';
                return e.returnValue;
            }
        });
    }

    showSettings() {
        const dialog = document.createElement('div');
        dialog.className = 'timer-settings-dialog';
        
        const content = document.createElement('div');
        content.className = 'timer-settings-content';
        
        const title = document.createElement('h3');
        title.textContent = 'Настройки таймера';
        
        // First setting (existing)
        const warningSettingItem = document.createElement('label');
        warningSettingItem.className = 'timer-setting-item';
        
        const warningCheckbox = document.createElement('input');
        warningCheckbox.type = 'checkbox';
        warningCheckbox.checked = this.showCloseWarning;
        warningCheckbox.onchange = (e) => {
            this.showCloseWarning = e.target.checked;
            chrome.storage.sync.set({
                showCloseWarning: this.showCloseWarning
            }, () => {
                console.log('TaskTimer: Настройки сохранены');
            });
        };
        
        warningSettingItem.appendChild(warningCheckbox);
        warningSettingItem.appendChild(document.createTextNode(' Предупреждать при закрытии вкладки с активным таймером'));

        // New setting
        const resetSettingItem = document.createElement('label');
        resetSettingItem.className = 'timer-setting-item';
        
        const resetCheckbox = document.createElement('input');
        resetCheckbox.type = 'checkbox';
        resetCheckbox.checked = this.resetOnFinish;
        resetCheckbox.onchange = (e) => {
            this.resetOnFinish = e.target.checked;
            chrome.storage.sync.set({
                resetOnFinish: this.resetOnFinish
            }, () => {
                console.log('TaskTimer: Настройки сохранены');
            });
        };
        
        resetSettingItem.appendChild(resetCheckbox);
        resetSettingItem.appendChild(document.createTextNode(' Сбрасывать таймер после учета'));
        
        const closeButton = document.createElement('button');
        closeButton.className = 'timer-button g-button g-button_view_normal g-button_size_m g-button_pin_round-round';
        closeButton.textContent = 'Закрыть';
        closeButton.onclick = () => dialog.remove();
        
        content.appendChild(title);
        content.appendChild(warningSettingItem);
        content.appendChild(resetSettingItem);
        content.appendChild(closeButton);
        dialog.appendChild(content);
        document.body.appendChild(dialog);
    }

    setupStorageListener() {
        chrome.storage.local.onChanged.addListener((changes, namespace) => {
            // Handle finished task changes
            if (changes[this.finishedTaskKey]) {
                // Игнорируем событие, если это локальное завершение
                if (this.localFinishInProgress) {
                    return;
                }

                const finishedTask = changes[this.finishedTaskKey].newValue;
                if (finishedTask && finishedTask.taskId === this.taskId) {
                    console.log('TaskTimer: Таймер учтен в другой вкладке');
                    // Stop timer if running
                    if (this.isRunning) {
                        this.stopTimer();
                    }
                    // Reset time if setting enabled
                    if (this.resetOnFinish) {
                        this.elapsedTime = 0;
                        this.updateDisplay();
                        this.saveTime();
                    }
                }
            }

            // Handle active timer changes
            if (changes[this.activeTaskKey]) {
                const activeTask = changes[this.activeTaskKey].newValue;
                this.handleActiveTimerChange(activeTask);
            }

            // Handle elapsed time changes for current task
            if (this.taskId && changes[this.taskId]) {
                const newTime = changes[this.taskId].newValue;
                // Only update if the difference is significant (more than 1 second)
                if (newTime !== this.elapsedTime && Math.abs(newTime - this.elapsedTime) > 1000) {
                    console.log('TaskTimer: Синхронизация времени с другой вкладки:', newTime);
                    this.elapsedTime = newTime;
                    if (this.isRunning) {
                        this.startTime = Date.now() - this.elapsedTime;
                    }
                    this.updateDisplay();
                }
            }
        });
    }

    handleActiveTimerChange(activeTask) {
        if (!activeTask) {
            // Timer was stopped in another tab
            if (this.isRunning) {
                console.log('TaskTimer: Таймер остановлен в другой вкладке');
                this.isRunning = false;
                this.startStopButton.textContent = 'Старт (S)';
                clearInterval(this.timer);
                document.body.classList.remove('timer-running');
            }
            return;
        }

        if (activeTask.taskId === this.taskId) {
            // Our task's timer was started in another tab
            if (!this.isRunning) {
                console.log('TaskTimer: Таймер запущен в другой вкладке');
                this.isRunning = true;
                this.startStopButton.textContent = 'Пауза (S)';
                this.startTime = Date.now() - this.elapsedTime;
                this.timer = setInterval(() => {
                    this.elapsedTime = Date.now() - this.startTime;
                    this.updateDisplay();
                    this.saveTime();
                }, 1000);
                if (this.showCloseWarning) {
                    document.body.classList.add('timer-running');
                }
            }
        } else {
            // Another task's timer was started
            if (this.isRunning) {
                console.log('TaskTimer: Запущен таймер другой задачи');
                this.isRunning = false;
                this.startStopButton.textContent = 'Старт (S)';
                clearInterval(this.timer);
                document.body.classList.remove('timer-running');
            }
        }
    }

    resetTimer() {
        // Use system confirm dialog
        if (window.confirm('Вы уверены, что хотите сбросить таймер?')) {
            this.stopTimer();
            this.elapsedTime = 0;
            this.updateDisplay();
            this.saveTime();
        }
    }
}

console.log('TaskTimer: Скрипт загружен, создание экземпляра');
new TaskTimer(); 