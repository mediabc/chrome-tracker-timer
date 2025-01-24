class TimerManager {
    constructor() {
        this.timers = new Map();
        this.setupMessageListener();
        this.setupAlarm();
        this.loadSavedTimers();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.action) {
                case 'startTimer':
                    this.startTimer(message.taskId, message.title);
                    this.updateExtensionIcon();
                    sendResponse(true);
                    break;
                case 'stopTimer':
                    this.stopTimer(message.taskId);
                    this.updateExtensionIcon();
                    sendResponse(true);
                    break;
                case 'resetTimer':
                    this.resetTimer(message.taskId);
                    this.updateExtensionIcon();
                    sendResponse(true);
                    break;
                case 'getTimerState':
                    sendResponse(this.getTimerState(message.taskId));
                    break;
                case 'finishTask':
                    this.finishTask(message.taskId);
                    sendResponse(true);
                    break;
                case 'updateTimerTitle':
                    this.updateTimerTitle(message.taskId, message.title);
                    sendResponse(true);
                    break;
            }
            return true;
        });
    }

    startTimer(taskId, title) {
        const timer = this.getTimerState(taskId);
        timer.isRunning = true;
        timer.lastUpdate = Date.now();
        if (title) {
            timer.title = title;
        }
        this.saveTimerState(taskId, timer);
        this.broadcastTimerState(taskId);
    }

    stopTimer(taskId) {
        const timer = this.getTimerState(taskId);
        timer.isRunning = false;
        this.saveTimerState(taskId, timer);
        this.broadcastTimerState(taskId);
    }

    resetTimer(taskId) {
        const timer = this.getTimerState(taskId);
        timer.isRunning = false;
        timer.elapsedTime = 0;
        timer.lastUpdate = Date.now();
        this.saveTimerState(taskId, timer);
        this.broadcastTimerState(taskId);
    }

    getTimerState(taskId) {
        if (!this.timers.has(taskId)) {
            this.timers.set(taskId, {
                taskId: taskId,
                isRunning: false,
                elapsedTime: 0,
                lastUpdate: Date.now(),
                title: ''
            });
        }
        return this.timers.get(taskId);
    }

    updateTimerTitle(taskId, title) {
        const timer = this.getTimerState(taskId);
        timer.title = title;
        this.saveTimerState(taskId, timer);
        this.broadcastTimerState(taskId);
    }

    finishTask(taskId) {
        chrome.storage.local.set({
            finishedTaskTimer: { taskId, timestamp: Date.now() }
        });
    }

    setupAlarm() {
        chrome.alarms.create('updateTimers', { periodInMinutes: 1/60 });
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'updateTimers') {
                this.updateAllTimers();
            }
        });
    }

    updateAllTimers() {
        const now = Date.now();
        for (const [taskId, timer] of this.timers.entries()) {
            if (timer.isRunning) {
                timer.elapsedTime += now - timer.lastUpdate;
                timer.lastUpdate = now;
                this.saveTimerState(taskId, timer);
                this.broadcastTimerState(taskId);
            }
        }
    }

    saveTimerState(taskId, timer) {
        this.timers.set(taskId, timer);
        chrome.storage.local.set({
            [`timer_state_${taskId}`]: timer
        });
    }

    broadcastTimerState(taskId) {
        const timer = this.timers.get(taskId);
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

    loadSavedTimers() {
        chrome.storage.local.get(null, (items) => {
            for (let key in items) {
                if (key.startsWith('timer_state_')) {
                    const taskId = key.replace('timer_state_', '');
                    this.timers.set(taskId, items[key]);
                }
            }
            this.updateExtensionIcon();
        });
    }

    updateExtensionIcon() {
        const hasActiveTimer = Array.from(this.timers.values()).some(timer => timer.isRunning);
        chrome.action.setIcon({
            path: {
                48: hasActiveTimer ? 'icon48.png' : 'icon_low_48.png',
                128: hasActiveTimer ? 'icon128.png' : 'icon_low_128.png'
            }
        });
    }
}

// Create timer manager instance
const timerManager = new TimerManager(); 