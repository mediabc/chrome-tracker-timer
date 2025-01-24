class BackgroundTimer {
    constructor() {
        this.timers = new Map(); // Хранит состояния таймеров для разных задач
        this.setupAlarms();
        this.setupMessageListeners();
        this.updateExtensionIcon();
    }

    setupAlarms() {
        // Обновляем состояние таймеров каждую секунду
        chrome.alarms.create('timerTick', { periodInMinutes: 1/60 });
        
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'timerTick') {
                this.updateAllTimers();
            }
        });
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            switch (request.action) {
                case 'startTimer':
                    this.startTimer(request.taskId);
                    break;
                case 'stopTimer':
                    this.stopTimer(request.taskId);
                    break;
                case 'resetTimer':
                    this.resetTimer(request.taskId);
                    break;
                case 'getTimerState':
                    sendResponse(this.getTimerState(request.taskId));
                    break;
                case 'finishTask':
                    this.finishTask(request.taskId);
                    break;
            }
        });
    }

    startTimer(taskId) {
        const now = Date.now();
        let timer = this.timers.get(taskId) || {
            taskId,
            isRunning: false,
            elapsedTime: 0,
            lastUpdate: now
        };

        timer.isRunning = true;
        timer.lastUpdate = now;
        this.timers.set(taskId, timer);
        this.saveTimerState(taskId);
        this.broadcastTimerState(taskId);
        this.updateExtensionIcon();
    }

    stopTimer(taskId) {
        const timer = this.timers.get(taskId);
        if (timer) {
            timer.isRunning = false;
            this.updateTimer(timer);
            this.saveTimerState(taskId);
            this.broadcastTimerState(taskId);
            this.updateExtensionIcon();
        }
    }

    resetTimer(taskId) {
        const timer = this.timers.get(taskId);
        if (timer) {
            timer.isRunning = false;
            timer.elapsedTime = 0;
            timer.lastUpdate = Date.now();
            this.saveTimerState(taskId);
            this.broadcastTimerState(taskId);
            this.updateExtensionIcon();
        }
    }

    finishTask(taskId) {
        const timer = this.timers.get(taskId);
        if (timer) {
            chrome.storage.local.set({
                [`finished_task_${taskId}`]: {
                    taskId,
                    timestamp: Date.now(),
                    elapsedTime: timer.elapsedTime
                }
            });
        }
    }

    updateAllTimers() {
        const now = Date.now();
        for (let [taskId, timer] of this.timers) {
            if (timer.isRunning) {
                // Обновляем время
                timer.elapsedTime += now - timer.lastUpdate;
                timer.lastUpdate = now;
                
                // Сохраняем состояние
                this.saveTimerState(taskId);
                
                // Отправляем обновление всем вкладкам
                this.broadcastTimerState(taskId);
            }
        }
    }

    updateTimer(timer) {
        const now = Date.now();
        if (timer.isRunning) {
            timer.elapsedTime += now - timer.lastUpdate;
        }
        timer.lastUpdate = now;
    }

    getTimerState(taskId) {
        return this.timers.get(taskId) || {
            taskId,
            isRunning: false,
            elapsedTime: 0,
            lastUpdate: Date.now()
        };
    }

    saveTimerState(taskId) {
        const timer = this.timers.get(taskId);
        if (timer) {
            chrome.storage.local.set({
                [`timer_state_${taskId}`]: timer
            });
        }
    }

    broadcastTimerState(taskId) {
        const timer = this.timers.get(taskId);
        if (timer) {
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach(tab => {
                    if (tab.url && tab.url.includes('tracker.yandex.ru')) {
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'timerStateUpdated',
                            timer: timer
                        }).catch(() => {
                            // Игнорируем ошибки отправки сообщений
                        });
                    }
                });
            });
        }
    }

    // Загрузка сохраненных состояний при запуске
    async loadSavedStates() {
        const storage = await chrome.storage.local.get(null);
        for (let key in storage) {
            if (key.startsWith('timer_state_')) {
                const timer = storage[key];
                if (timer.isRunning) {
                    // Обновляем время с учетом периода неактивности
                    const timePassed = Date.now() - timer.lastUpdate;
                    timer.elapsedTime += timePassed;
                    timer.lastUpdate = Date.now();
                }
                this.timers.set(timer.taskId, timer);
            }
        }
    }

    updateExtensionIcon() {
        // Проверяем, есть ли активные таймеры
        const hasActiveTimer = Array.from(this.timers.values()).some(timer => timer.isRunning);
        
        // Устанавливаем соответствующую иконку
        chrome.action.setIcon({
            path: {
                48: hasActiveTimer ? 'icon48.png' : 'icon_low_48.png',
                128: hasActiveTimer ? 'icon128.png' : 'icon_low_128.png'
            }
        });
    }
}

// Создаем экземпляр фонового таймера
const backgroundTimer = new BackgroundTimer();
backgroundTimer.loadSavedStates(); 