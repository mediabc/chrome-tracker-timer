class TaskTimer {
    constructor() {
        console.log('TaskTimer: Конструктор инициализирован');
        this.isRunning = false;
        this.elapsedTime = 0;
        this.taskId = null;
        this.initialized = false;
        this.showCloseWarning = true;
        this.loadSettings();
        this.initializeWhenReady();
        this.setupBeforeUnloadHandler();
        this.setupMessageListener();
        this.originalTitle = document.title;
        this.startTime = 0;
        this.taskId = null;
        this.initialized = false;
        this.showCloseWarning = true; // Default value
        this.loadSettings();
        this.initializeWhenReady();
        this.setupBeforeUnloadHandler();
        this.activeTaskKey = 'activeTaskTimer';
        this.finishedTaskKey = 'finishedTaskTimer';
        this.setupStorageListener();
        this.localFinishInProgress = false;
        this.setupUrlChangeObserver();
        this.timerStateKey = 'timerState';
        this.originalFavicon = this.getFavicon();
        this.originalTitle = this.getCurrentTaskTitle();

        // Проверяем, находимся ли мы на странице задачи
        const taskId = this.getTaskIdFromUrl();
        if (!taskId) {
            console.log('TaskTimer: Не найден ID задачи в URL, инициализация отложена');
            return;
        }

        // Add hotkey handlers
        document.addEventListener('keydown', (e) => {
            // Проверяем, находимся ли мы в каком-либо поле ввода или редактируемом элементе
            const activeElement = document.activeElement;
            const isEditableElement = 
                activeElement.tagName === 'INPUT' || 
                activeElement.tagName === 'TEXTAREA' || 
                activeElement.tagName === 'SELECT' ||
                activeElement.isContentEditable ||
                activeElement.closest('.cm-editor.cm-focused') || // CodeMirror editor
                activeElement.closest('[contenteditable="true"]') || // Любой редактируемый элемент
                activeElement.closest('.ProseMirror') || // ProseMirror editor
                activeElement.closest('.ql-editor') || // Quill editor
                activeElement.closest('.CodeMirror-focused'); // Другой вариант CodeMirror

            // Если мы в редактируемом элементе, позволяем стандартную обработку клавиш
            if (isEditableElement) {
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

        this.cleanupInvalidTimers();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message) => {
            if (message.action === 'timerStateUpdated' && message.timer.taskId === this.taskId) {
                console.log('TaskTimer: Получено обновление состояния:', message.timer);
                
                // Обновляем локальное состояние
                this.isRunning = message.timer.isRunning;
                this.elapsedTime = message.timer.elapsedTime;
                
                // Обновляем отображение
                this.updateDisplay();
                
                // Обновляем состояние кнопки
                this.startStopButton.textContent = this.isRunning ? '⚡ Пауза (S)' : '⚡ Старт (S)';
                
                // Принудительно обновляем визуальные индикаторы
                if (this.isRunning) {
                    document.body.classList.add('timer-running');
                    this.updateTitleWithDelay();
                } else {
                    document.body.classList.remove('timer-running');
                    this.setTimerIndicator(false);
                }
            }
        });
    }

    updateTitleWithDelay() {
        // Функция для проверки валидности заголовка
        const isValidTitle = (title) => {
            // Проверяем, что заголовок не "Tracker" и содержит ID задачи
            return title !== "Tracker" && title.includes(this.taskId);
        };

        // Максимальное время ожидания корректного заголовка (5 секунд)
        const maxAttempts = 50; // 50 попыток * 100мс = 5 секунд
        let attempts = 0;

        const checkTitle = () => {
            const currentTitle = this.getCurrentTaskTitle();
            console.log('TaskTimer: Проверка заголовка:', currentTitle);

            if (isValidTitle(currentTitle)) {
                console.log('TaskTimer: Найден корректный заголовок:', currentTitle);
                this.originalTitle = currentTitle;
                this.setTimerIndicator(true);
            } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(checkTitle, 100);
            } else {
                console.log('TaskTimer: Не удалось получить корректный заголовок');
                // Если не удалось получить корректный заголовок, пробуем еще раз через секунду
                setTimeout(() => {
                    if (this.isRunning) {
                        this.updateTitleWithDelay();
                    }
                }, 1000);
            }
        };

        // Начинаем проверку
        checkTitle();
    }

    updateFromBackgroundState(timer) {
        this.isRunning = timer.isRunning;
        this.elapsedTime = timer.elapsedTime;
        this.updateDisplay();
        this.updateButtonState();
        // Принудительно обновляем визуальные индикаторы
        if (this.isRunning) {
            document.body.classList.add('timer-running');
            this.updateTitleWithDelay();
        } else {
            document.body.classList.remove('timer-running');
            this.setTimerIndicator(false);
        }
    }

    updateButtonState() {
        this.startStopButton.textContent = this.isRunning ? '⚡ Пауза (S)' : '⚡ Старт (S)';
    }

    updateVisualState() {
        if (this.isRunning && this.showCloseWarning) {
            document.body.classList.add('timer-running');
            // Запускаем обновление заголовка с задержкой и повторными попытками
            this.updateTitleWithDelay();
        } else {
            document.body.classList.remove('timer-running');
            this.setTimerIndicator(false);
        }
    }

    initializeWhenReady() {
        console.log('TaskTimer: Starting initialization check');
        const checkInterval = setInterval(() => {
            console.log('TaskTimer: Checking document state:', document.readyState);
            if (document.readyState === 'complete') {
                console.log('TaskTimer: Document complete, checking for task page...');
                const taskId = this.getTaskIdFromUrl();
                const actionBar = document.querySelector('ul.gn-action-bar-group.action-bar__start');
                
                if (taskId && actionBar && !this.initialized) {
                    // Проверяем, нет ли уже инициализированного таймера для этой задачи
                    const existingTimer = document.querySelector('.tracker-timer-container');
                    if (existingTimer) {
                        console.log('TaskTimer: Таймер для задачи уже существует');
                        clearInterval(checkInterval);
                        return;
                    }

                    console.log('TaskTimer: Task page found, initializing...');
                    this.taskId = taskId;
                    this.initializeUI();
                    this.loadSavedTime();
                    this.initialized = true;

                    // Сохраняем заголовок страницы и название задачи с задержкой
                    setTimeout(() => {
                        console.log('TaskTimer: Сохранение заголовка страницы');
                        this.originalTitle = this.getCurrentTaskTitle();
                        // Если таймер активен, обновляем индикатор
                        if (this.isRunning) {
                            this.setTimerIndicator(true);
                        }
                        
                        // Обновляем название задачи в хранилище
                        const taskTitle = this.getTaskTitle();
                        if (taskTitle) {
                            chrome.runtime.sendMessage({
                                action: 'updateTimerTitle',
                                taskId: this.taskId,
                                title: taskTitle
                            });
                        }
                    }, 500);
                }
                clearInterval(checkInterval);
            }
        }, 100);
    }

    setupUrlChangeObserver() {
        // Наблюдаем за изменениями в URL через History API
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function() {
            originalPushState.apply(this, arguments);
            window.dispatchEvent(new Event('locationchange'));
        };

        history.replaceState = function() {
            originalReplaceState.apply(this, arguments);
            window.dispatchEvent(new Event('locationchange'));
        };

        window.addEventListener('popstate', () => {
            window.dispatchEvent(new Event('locationchange'));
        });

        // Обработчик изменения URL
        window.addEventListener('locationchange', () => {
            console.log('TaskTimer: Обнаружено изменение URL');
            this.handleUrlChange();
        });

        // Наблюдатель за изменениями DOM
        const observer = new MutationObserver((mutations) => {
            // Проверяем, загрузилась ли страница задачи
            const taskId = this.getTaskIdFromUrl();
            const actionBar = document.querySelector('ul.gn-action-bar-group.action-bar__start');
            
            if (taskId && actionBar && !this.initialized) {
                console.log('TaskTimer: Обнаружена страница задачи после изменения DOM');
                this.taskId = taskId;
                this.initializeUI();
                this.loadSavedTime();
                this.initialized = true;
            }
        });

        // Наблюдаем за изменениями в DOM
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    handleUrlChange() {
        const newTaskId = this.getTaskIdFromUrl();
        console.log('TaskTimer: URL change detected, new task ID:', newTaskId);
        
        if (newTaskId !== this.taskId) {
            console.log('TaskTimer: Task ID changed from', this.taskId, 'to', newTaskId);
            this.taskId = newTaskId;
            this.initialized = false; // Сбрасываем флаг инициализации
            this.removeExistingTimer();
            
            if (this.taskId) {
                // Ждем загрузки UI
                const checkInterval = setInterval(() => {
                    const actionBar = document.querySelector('ul.gn-action-bar-group.action-bar__start');
                    if (actionBar) {
                        // Проверяем, нет ли уже инициализированного таймера для этой задачи
                        const existingTimer = document.querySelector('.tracker-timer-container');
                        if (existingTimer) {
                            console.log('TaskTimer: Таймер для задачи уже существует');
                            clearInterval(checkInterval);
                            return;
                        }

                        clearInterval(checkInterval);
                        this.initializeUI();
                        this.loadSavedTime();
                        this.initialized = true;

                        // Сохраняем заголовок страницы и название задачи с задержкой
                        setTimeout(() => {
                            console.log('TaskTimer: Сохранение заголовка страницы после смены URL');
                            this.originalTitle = this.getCurrentTaskTitle();
                            // Если таймер активен, обновляем индикатор
                            if (this.isRunning) {
                                this.setTimerIndicator(true);
                            }

                            // Обновляем название задачи в хранилище
                            const taskTitle = this.getTaskTitle();
                            if (taskTitle) {
                                chrome.runtime.sendMessage({
                                    action: 'updateTimerTitle',
                                    taskId: this.taskId,
                                    title: taskTitle
                                });
                            }
                        }, 500);
                    }
                }, 100);

                // Устанавливаем таймаут на случай, если элемент не появится
                setTimeout(() => clearInterval(checkInterval), 5000);
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
        console.log('TaskTimer: Starting UI initialization');
        this.removeExistingTimer();

        const timerContainer = document.createElement('div');
        timerContainer.className = 'tracker-timer-container';
        
        // Добавляем индикатор
        const indicator = document.createElement('span');
        indicator.className = 'timer-indicator';
        timerContainer.appendChild(indicator);
        
        this.timerDisplay = document.createElement('div');
        this.timerDisplay.className = 'timer-display';
        this.timerDisplay.textContent = '00:00:00';

        this.startStopButton = document.createElement('button');
        this.startStopButton.className = 'timer-button g-button g-button_view_normal g-button_size_m g-button_pin_round-round';
        this.startStopButton.textContent = '⚡ Старт (S)';
        this.startStopButton.onclick = () => this.toggleTimer();

        this.finishButton = document.createElement('button');
        this.finishButton.className = 'timer-button g-button g-button_view_normal g-button_size_m g-button_pin_round-round';
        this.finishButton.textContent = 'Учесть';
        this.finishButton.onclick = () => this.finishTask();
        // Инициализируем состояние кнопки
        this.finishButton.disabled = true;
        this.finishButton.style.opacity = '0.5';

        this.resetButton = document.createElement('button');
        this.resetButton.className = 'timer-button g-button g-button_view_normal g-button_size_m g-button_pin_round-round';
        this.resetButton.textContent = 'Сброс';
        this.resetButton.onclick = () => this.resetTimer();
        // Инициализируем состояние кнопки
        this.resetButton.disabled = true;
        this.resetButton.style.opacity = '0.5';

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
        if (this.taskId) {
            const state = await this.getTimerState();
            this.updateFromBackgroundState(state);
        }
    }

    async getTimerState() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'getTimerState',
                taskId: this.taskId
            }, resolve);
        });
    }

    async startTimer() {
        // Проверяем наличие taskId
        if (!this.taskId) {
            console.error('TaskTimer: Попытка запуска таймера без ID задачи');
            return;
        }

        // Проверяем, есть ли уже запущенный таймер
        const storage = await new Promise(resolve => chrome.storage.local.get(null, resolve));
        const activeTimer = Object.entries(storage)
            .filter(([key, value]) => key.startsWith('timer_state_'))
            .map(([key, value]) => ({ ...value, key }))
            .find(timer => timer.isRunning);

        if (activeTimer && activeTimer.taskId !== this.taskId) {
            // Показываем диалог с информацией о запущенном таймере
            const dialog = document.createElement('div');
            dialog.className = 'timer-settings-dialog';
            
            const content = document.createElement('div');
            content.className = 'timer-settings-content';
            
            const title = document.createElement('h3');
            title.textContent = 'Уже есть активный таймер';
            
            const message = document.createElement('p');
            message.innerHTML = `У вас уже запущен таймер для задачи <a href="https://tracker.yandex.ru/${activeTimer.taskId}" target="_blank">${activeTimer.taskId}</a>${activeTimer.title ? ': ' + activeTimer.title : ''}.<br>Остановите его перед запуском нового таймера.`;
            
            const closeButton = document.createElement('button');
            closeButton.className = 'timer-button g-button g-button_view_normal g-button_size_m g-button_pin_round-round';
            closeButton.textContent = 'Закрыть';
            closeButton.onclick = () => dialog.remove();
            
            content.appendChild(title);
            content.appendChild(message);
            content.appendChild(closeButton);
            dialog.appendChild(content);
            
            // Добавляем обработчик клика для закрытия при клике вне модалки
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    dialog.remove();
                }
            });

            // Добавляем обработчик ESC
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    dialog.remove();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
            
            document.body.appendChild(dialog);
            
            return;
        }

        // Получаем название задачи перед запуском таймера
        const taskTitle = this.getTaskTitle();
        
        await chrome.runtime.sendMessage({
            action: 'startTimer',
            taskId: this.taskId,
            title: taskTitle
        });
    }

    async stopTimer() {
        // Проверяем наличие taskId
        if (!this.taskId) {
            console.error('TaskTimer: Попытка остановки таймера без ID задачи');
            return;
        }

        await chrome.runtime.sendMessage({
            action: 'stopTimer',
            taskId: this.taskId
        });
    }

    async resetTimer() {
        if (window.confirm('Вы уверены, что хотите сбросить таймер?')) {
            await chrome.runtime.sendMessage({
                action: 'resetTimer',
                taskId: this.taskId
            });
        }
    }

    async finishTask() {
        const currentState = await this.getTimerState();
        if (!currentState.elapsedTime) return;

        this.localFinishInProgress = true;
        
        // Останавливаем таймер
        await this.stopTimer();
        
        // Форматируем время
        const formattedTime = this.formatTimeForInput(currentState.elapsedTime);
        console.log('TaskTimer: Форматированное время:', formattedTime);
        
        // Рассчитываем время начала
        const startTime = new Date(Date.now() - currentState.elapsedTime);
        console.log('TaskTimer: Время начала (Date):', startTime);
        
        const formattedDate = startTime.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        console.log('TaskTimer: Форматированная дата:', formattedDate);
        
        const formattedHours = startTime.getHours().toString().padStart(2, '0');
        const formattedMinutes = startTime.getMinutes().toString().padStart(2, '0');
        console.log('TaskTimer: Форматированное время (HH:MM):', formattedHours + ':' + formattedMinutes);
        
        const formattedStartTime = `${formattedDate} ${formattedHours}:${formattedMinutes}`;
        console.log('TaskTimer: Итоговое форматированное время начала:', formattedStartTime);

        // Уведомляем background script о завершении задачи
        await chrome.runtime.sendMessage({
            action: 'finishTask',
            taskId: this.taskId
        });

        // Открываем диалог трекера
        const keyEvent = new KeyboardEvent('keydown', {
            key: 't',
            code: 'KeyT',
            keyCode: 84,
            which: 84,
            bubbles: true,
            cancelable: true
        });
        
        document.dispatchEvent(keyEvent);

        // Заполняем поля в диалоге и наблюдаем за его закрытием
        const observer = new MutationObserver((mutations, obs) => {
            // Ищем диалог
            const dialog = document.querySelector('div.add-worklog-dialog');
            
            if (dialog) {
                console.log('TaskTimer: Найден диалог учета времени');
                // Если диалог найден, заполняем поля
                const durationInput = document.querySelector('.add-worklog-dialog__duration-control input');
                const dateInput = document.querySelector('.add-worklog-dialog__date-control input');
                
                console.log('TaskTimer: Найдены поля ввода:', {
                    durationInput: !!durationInput,
                    dateInput: !!dateInput
                });
                
                if (durationInput && dateInput) {
                    console.log('TaskTimer: Заполняем поле длительности:', formattedTime);
                    durationInput.value = formattedTime;
                    durationInput.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    // Добавляем паузу перед заполнением поля даты/времени
                    setTimeout(() => {
                        console.log('TaskTimer: Заполняем поле даты/времени:', formattedStartTime);
                        dateInput.value = formattedStartTime;
                        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
                        
                        // Проверяем, что значения были установлены
                        setTimeout(() => {
                            console.log('TaskTimer: Проверка установленных значений:', {
                                duration: durationInput.value,
                                date: dateInput.value
                            });
                        }, 100);
                    }, 100);
                }
            } else {
                console.log('TaskTimer: Диалог учета времени не найден');
            }
        });

        // Начинаем наблюдение за изменениями в DOM
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        console.log('TaskTimer: Начато наблюдение за DOM для поиска диалога');

        // Устанавливаем таймаут для отключения наблюдателя
        setTimeout(() => {
            observer.disconnect();
            console.log('TaskTimer: Наблюдение за DOM остановлено по таймауту (5 секунд)');
            this.localFinishInProgress = false;
        }, 5000);

        // Сбрасываем флаг localFinishInProgress через 5 секунд
        setTimeout(() => {
            this.localFinishInProgress = false;
        }, 5000);
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

        // Disable buttons and set opacity based on elapsed time
        const hasTime = this.elapsedTime > 0;
        this.finishButton.disabled = !hasTime;
        this.resetButton.disabled = !hasTime;
        this.finishButton.style.opacity = hasTime ? '1' : '0.5';
        this.resetButton.style.opacity = hasTime ? '1' : '0.5';
    }

    loadSettings() {
        chrome.storage.sync.get({
            showCloseWarning: true // default value
        }, (items) => {
            console.log('TaskTimer: Загружены настройки:', items);
            this.showCloseWarning = items.showCloseWarning;
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
        
        const closeButton = document.createElement('button');
        closeButton.className = 'timer-button g-button g-button_view_normal g-button_size_m g-button_pin_round-round';
        closeButton.textContent = 'Закрыть';
        closeButton.onclick = () => dialog.remove();
        
        content.appendChild(title);
        content.appendChild(warningSettingItem);
        content.appendChild(closeButton);
        dialog.appendChild(content);
        
        // Добавляем обработчик клика для закрытия при клике вне модалки
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
            }
        });

        // Добавляем обработчик ESC
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                dialog.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        
        document.body.appendChild(dialog);
    }

    setupStorageListener() {
        chrome.storage.local.onChanged.addListener((changes, namespace) => {
            // Проверяем изменения состояния для текущей задачи
            const stateKey = `timer_state_${this.taskId}`;
            if (changes[stateKey]) {
                const state = changes[stateKey].newValue;
                if (state && !this.localFinishInProgress) {
                    console.log('TaskTimer: Обновление состояния из другой вкладки:', state);
                    
                    // Обновляем время
                    this.elapsedTime = state.elapsedTime;
                    
                    // Синхронизируем состояние запуска/остановки
                    if (state.isRunning && !this.isRunning) {
                        // Запускаем таймер, если он не был запущен
                        this.startTimer();
                    } else if (!state.isRunning && this.isRunning) {
                        // Останавливаем таймер, если он был запущен
                        this.stopTimer();
                    }
                    
                    this.updateDisplay();
                }
            }

            // Handle finished task changes
            if (changes[this.finishedTaskKey]) {
                if (this.localFinishInProgress) {
                    return;
                }

                const finishedTask = changes[this.finishedTaskKey].newValue;
                if (finishedTask && finishedTask.taskId === this.taskId) {
                    console.log('TaskTimer: Таймер учтен в другой вкладке');
                    if (this.isRunning) {
                        this.stopTimer();
                    }
                }
            }
        });
    }

    getFavicon() {
        const favicon = document.querySelector('link[rel="icon"]') || document.querySelector('link[rel="shortcut icon"]');
        return favicon ? favicon.href : null;
    }

    setTimerIndicator(isActive) {
        if (isActive) {
            // Проверяем валидность текущего заголовка перед обновлением
            const currentTitle = this.getCurrentTaskTitle();
            if (currentTitle !== "Tracker" && currentTitle.includes(this.taskId)) {
                this.originalTitle = currentTitle;
                // Добавляем индикатор к заголовку
                document.title = `⚡ ${this.originalTitle}`;
                // Принудительно добавляем класс для отображения кружка
                document.body.classList.add('timer-running');
            } else {
                // Если заголовок некорректный, пробуем обновить через небольшую задержку
                setTimeout(() => {
                    if (this.isRunning) {
                        this.updateTitleWithDelay();
                    }
                }, 500);
            }
        } else {
            // Возвращаем оригинальный заголовок
            document.title = this.originalTitle;
            // Принудительно удаляем класс
            document.body.classList.remove('timer-running');
        }
    }

    toggleTimer() {
        // Проверяем наличие taskId
        if (!this.taskId) {
            console.error('TaskTimer: Попытка переключения таймера без ID задачи');
            return;
        }

        if (!this.isRunning) {
            this.startTimer();
        } else {
            this.stopTimer();
        }
    }

    getCurrentTaskTitle() {
        // Получаем текущее название задачи из заголовка
        const title = document.title;
        // Убираем индикатор активного таймера, если он есть
        return title.replace(/^⚡\s/, '');
    }

    getTaskTitle() {
        const titleElement = document.querySelector('.issue-summary h1');
        return titleElement ? titleElement.textContent.trim() : '';
    }

    // Добавим метод для очистки некорректных таймеров
    async cleanupInvalidTimers() {
        const storage = await new Promise(resolve => chrome.storage.local.get(null, resolve));
        
        for (const [key, value] of Object.entries(storage)) {
            if (key.startsWith('timer_state_')) {
                // Проверяем наличие taskId в таймере
                if (!value.taskId) {
                    console.log('TaskTimer: Удаление некорректного таймера:', key);
                    chrome.storage.local.remove(key);
                }
            }
        }
    }
}

// Singleton pattern to prevent multiple timer instances
if (!window.taskTimerInstance) {
    console.log('TaskTimer: Создание нового экземпляра');
    window.taskTimerInstance = new TaskTimer();
} else {
    console.log('TaskTimer: Экземпляр уже существует');
}

// Экспортируем класс для возможного использования в других модулях
window.TaskTimer = TaskTimer; 