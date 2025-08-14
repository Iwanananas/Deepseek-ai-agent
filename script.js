document.addEventListener('DOMContentLoaded', () => {
    // Configuration Constants - Set these with your actual values
    const OPENROUTER_API_KEY = "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";
    const GOOGLE_CLIENT_ID = "451401714888-6s1lg87mlfmsgakhemn9l1irv024mga5.apps.googleusercontent.com";
    
    // DOM Elements (removed settings-related elements)
    const chatOutput = document.getElementById('chat-output');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const authButton = document.getElementById('auth-button');
    const calendarEvents = document.getElementById('calendar-events');
    const clearChatButton = document.getElementById('clear-chat-button');
    const exportChatButton = document.getElementById('export-chat-button');
    const loadingIndicator = document.getElementById('loading-indicator');
    const refreshCalendarButton = document.getElementById('refresh-calendar');
    const lastSyncElement = document.getElementById('last-sync');

    // Configuration with constants
    const defaultConfig = {
        openRouterApiKey: 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,
        googleClientId: 451401714888-6s1lg87mlfmsgakhemn9l1irv024mga5.apps.googleusercontent.com,
        model: 'deepseek-ai/deepseek-r1',
        temperature: 0.7,
        maxTokens: 2000,
        chatHistory: [],
        theme: 'system',
        googleAccessToken: null
    };

    let config = { ...defaultConfig };

    // Secure Storage Manager (only for chat history now)
    const storageManager = {
        setItem: (key, value) => {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                console.error('Storage error:', e);
            }
        },
        getItem: (key) => {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            } catch (e) {
                console.error('Storage error:', e);
                return null;
            }
        },
        clear: () => {
            localStorage.clear();
        }
    };

    // Initialize app
    function initApp() {
        loadConfig();
        setupEventListeners();
        loadGoogleApi();
        restoreChatHistory();
        checkAuthStatus();
        applyTheme();
        updateLastSyncTime();
    }

    function loadConfig() {
        const savedConfig = storageManager.getItem('aiCalendarConfig') || {};
        // Only load chat history and theme from storage
        config = { 
            ...defaultConfig,
            chatHistory: savedConfig.chatHistory || [],
            theme: savedConfig.theme || 'system',
            googleAccessToken: savedConfig.googleAccessToken || null
        };
    }

    function setupEventListeners() {
        // Chat functionality
        sendButton.addEventListener('click', handleSendMessage);
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });

        // Google Calendar
        authButton.addEventListener('click', handleGoogleAuth);
        refreshCalendarButton.addEventListener('click', refreshCalendar);

        // Chat management
        clearChatButton.addEventListener('click', clearChat);
        exportChatButton.addEventListener('click', exportChat);
    }

    // Theme functionality
    function applyTheme() {
        if (config.theme === 'system') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', config.theme);
        }
    }

    // Enhanced Message Handling
    async function handleSendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        addMessage(message, 'user');
        userInput.value = '';
        config.chatHistory.push({ role: 'user', content: message });

        if (!config.openRouterApiKey) {
            addMessage("Error: API is not properly configured.", 'bot');
            return;
        }

        showLoading(true);

        try {
            const response = await callDeepSeek(message);
            addMessage(response, 'bot');
            config.chatHistory.push({ role: 'assistant', content: response });
            storageManager.setItem('aiCalendarConfig', config);
        } catch (error) {
            console.error('API Error:', error);
            addMessage(`Error: ${error.message || 'Failed to get AI response'}`, 'bot');
        } finally {
            showLoading(false);
        }
    }

    // Enhanced API Call with retries and timeout
    async function callDeepSeek(message, retries = 3) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.openRouterApiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.href,
                    'X-Title': 'AI Calendar Assistant'
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        ...config.chatHistory.slice(-6),
                        { role: 'user', content: message }
                    ],
                    temperature: config.temperature,
                    max_tokens: config.maxTokens
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
            }

            const data = await response.json();
            return data.choices[0]?.message?.content || "I didn't get a response. Please try again.";
        } catch (error) {
            if (retries > 0 && !error.message.includes('aborted')) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
                return callDeepSeek(message, retries - 1);
            }
            throw error;
        }
    }

    // Enhanced Google Auth with token refresh
    async function handleGoogleAuth() {
        if (!config.googleClientId) {
            showNotification('Error: Google Client ID is not configured.', 'error');
            return;
        }

        showLoading(true, 'Connecting to Google...');

        try {
            await authenticateGoogle();
            await refreshCalendar();
            showNotification('Successfully connected to Google Calendar!', 'success');
        } catch (error) {
            console.error("Google Auth failed:", error);
            showNotification(`Failed to connect: ${error.message}`, 'error');
        } finally {
            showLoading(false);
        }
    }

    async function refreshCalendar() {
        if (!config.googleAccessToken) return;
        
        try {
            const events = await getCalendarEvents();
            displayEvents(events);
            updateLastSyncTime();
        } catch (error) {
            console.error("Failed to refresh calendar:", error);
            showNotification("Failed to refresh calendar", 'error');
        }
    }

    function updateLastSyncTime() {
        lastSyncElement.textContent = `Last synced: ${new Date().toLocaleTimeString()}`;
    }

    function authenticateGoogle() {
        return new Promise((resolve, reject) => {
            const client = google.accounts.oauth2.initTokenClient({
                client_id: config.googleClientId,
                scope: 'https://www.googleapis.com/auth/calendar.readonly',
                prompt: 'consent',
                callback: async (response) => {
                    if (response.error) {
                        reject(new Error(response.error));
                        return;
                    }

                    config.googleAccessToken = response.access_token;
                    storageManager.setItem('aiCalendarConfig', config);
                    resolve();
                }
            });
            client.requestAccessToken();
        });
    }

    async function getCalendarEvents() {
        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            headers: {
                'Authorization': `Bearer ${config.googleAccessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch calendar events');
        }

        const data = await response.json();
        return data.items || [];
    }

    // UI Helpers
    function addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${sender}-message`);
        
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const formattedText = text.replace(urlRegex, url => {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
        }).replace(/\n/g, '<br>');
        
        messageDiv.innerHTML = formattedText;
        chatOutput.appendChild(messageDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }

    function displayEvents(events) {
        calendarEvents.innerHTML = '';
        
        if (!events || events.length === 0) {
            calendarEvents.innerHTML = `
                <div class="empty-state">
                    <i class="far fa-calendar-plus"></i>
                    <p>No upcoming events found</p>
                </div>
            `;
            return;
        }

        const now = new Date();
        const upcomingEvents = events
            .filter(event => {
                const start = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date);
                return start >= now;
            })
            .sort((a, b) => {
                const aStart = a.start.dateTime ? new Date(a.start.dateTime) : new Date(a.start.date);
                const bStart = b.start.dateTime ? new Date(b.start.dateTime) : new Date(b.start.date);
                return aStart - bStart;
            })
            .slice(0, 5);

        upcomingEvents.forEach(event => {
            const eventDiv = document.createElement('div');
            eventDiv.classList.add('event-item');
            
            const startTime = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date);
            const endTime = event.end.dateTime ? new Date(event.end.dateTime) : new Date(event.end.date);
            
            const timeString = event.start.dateTime 
                ? `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'All day';
            
            eventDiv.innerHTML = `
                <div class="event-time">${startTime.toLocaleDateString()} • ${timeString}</div>
                <div class="event-title">${event.summary || 'No title'}</div>
                ${event.description ? `<div class="event-description">${event.description}</div>` : ''}
                ${event.location ? `<div class="event-location">📍 ${event.location}</div>` : ''}
            `;
            
            calendarEvents.appendChild(eventDiv);
        });
    }

    function showLoading(show, text = 'Thinking...') {
        if (show) {
            loadingIndicator.innerHTML = `<span>${text}</span>`;
            loadingIndicator.style.display = 'flex';
            sendButton.disabled = true;
        } else {
            loadingIndicator.style.display = 'none';
            sendButton.disabled = false;
        }
    }

    function showNotification(message, type = 'info') {
        const icon = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle'
        }[type];

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    }

    function restoreChatHistory() {
        if (config.chatHistory && config.chatHistory.length > 0) {
            config.chatHistory.forEach(msg => {
                if (msg.role === 'user') {
                    addMessage(msg.content, 'user');
                } else if (msg.role === 'assistant') {
                    addMessage(msg.content, 'bot');
                }
            });
        } else {
            addMessage("Hello! I'm your AI Calendar Assistant. How can I help you today?", 'bot');
        }
    }

    function clearChat() {
        if (chatOutput.children.length <= 1) return;
        
        if (!confirm('Are you sure you want to clear the chat history?')) return;
        
        chatOutput.innerHTML = '';
        config.chatHistory = [];
        storageManager.setItem('aiCalendarConfig', config);
        addMessage("Chat history cleared. How can I help you?", 'bot');
    }

    function exportChat() {
        const chatText = Array.from(chatOutput.children)
            .map(msg => {
                const sender = msg.classList.contains('user-message') ? 'You' : 'AI';
                return `${sender}: ${msg.textContent}`;
            })
            .join('\n\n');
        
        const blob = new Blob([chatText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AI-Calendar-Chat-${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('Chat exported successfully!', 'success');
    }

    function checkAuthStatus() {
        if (config.googleAccessToken) {
            authButton.innerHTML = '<i class="fab fa-google"></i> Refresh Calendar';
            refreshCalendar();
        }
    }

    // Load Google API library
    function loadGoogleApi() {
        if (window.google) return;
        
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
    }

    // Initialize the app
    initApp();
});
