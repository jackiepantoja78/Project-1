(() => {
    const DATA_URL = './data.json';

    // Utilities
    function sanitizeJSONText(text) {
        return (text || '')
            .replace(/\/\*[\s\S]*?\*\//g, '') 
            .replace(/\/\/.*$/gm, ''); 
    }

    function normalize(text) {
        return (text || '').toLowerCase().replace(/[^\w\s]/g, ' ').trim();
    }

    // Run after DOM ready to avoid null elements
    document.addEventListener('DOMContentLoaded', async () => {
        const chatMessages = document.getElementById('chat-messages');
        const userInput = document.getElementById('user-input');
        const sendBtn = document.getElementById('send-btn');
        const typingRow = document.getElementById('typing-row');

        if (!chatMessages || !userInput || !sendBtn || !typingRow) {
            console.error('app.js: Missing expected DOM elements. Check ids in index.html');
            return;
        }

        let dataset = [];

       async function loadData() {
        try {
            const res = await fetch(DATA_URL, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const raw = await res.text();
            const clean = sanitizeJSONText(raw);

            // First attempt: parse cleaned text
            try {
                dataset = JSON.parse(clean);
                console.info(`Loaded ${dataset.length} Q&A items`);
                return;
            } catch (parseErr) {
                console.warn('JSON.parse failed on cleaned text, attempting recovery...', parseErr);
            }

            // Recovery attempt: extract the first JSON array block [ ... ] and parse it
            const arrMatch = clean.match(/\[\s*[\s\S]*\s*\]/);
            if (arrMatch) {
                try {
                    dataset = JSON.parse(arrMatch[0]);
                    console.info(`Recovered and loaded ${dataset.length} Q&A items from array block`);
                    return;
                } catch (recoverErr) {
                    console.error('Recovery parse failed', recoverErr);
                }
            }

            throw new Error('Unable to parse dataset JSON');
        } catch (err) {
            console.error('Failed to load dataset from', DATA_URL, err);
            console.info('If you opened index.html via file://, fetch may be blocked. Run a local server:');
            console.info('  python3 -m http.server 8000');
            dataset = []; 
        }
    }

        function appendMessage(role, text) {
            const wrapper = document.createElement('div');
            wrapper.className = 'message-row';
            const avatar = document.createElement('div');
            avatar.className = role === 'user' ? 'message-avatar user' : 'message-avatar';
            const bubble = document.createElement('div');
            bubble.className = `bubble ${role === 'user' ? 'user' : 'bot'}`;
            bubble.textContent = text;

            wrapper.appendChild(avatar);
            wrapper.appendChild(bubble);
            chatMessages.appendChild(wrapper);
            wrapper.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }

        function showTyping(show = true) {
            typingRow.style.display = show ? 'flex' : 'none';
            if (show) typingRow.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }

        function findBestMatch(query) {
            const q = normalize(query);
            if (!q) return { item: null, score: 0 };

            const qTokens = q.split(/\s+/).filter(Boolean);
            let best = null;
            let bestScore = 0;

            for (const item of dataset) {
                let score = 0;
                const question = normalize(item.question || '');
                const keywords = (item.keywords || []).map(k => normalize(k));
                for (const k of keywords) {
                    for (const t of qTokens) {
                        if (k === t) score += 3;
                        else if (k.includes(t) || t.includes(k)) score += 1;
                    }
                }
                for (const t of qTokens) {
                    if (question.includes(t)) score += 2;
                }
                if (question.includes(q) || keywords.some(k => k.includes(q))) score += 4;
                if (score > bestScore) {
                    best = item;
                    bestScore = score;
                }
            }

            return { item: best, score: bestScore };
        }

        async function handleQuery(rawQuery) {
            const query = (rawQuery || '').trim();
            if (!query) return;

            appendMessage('user', query);
            userInput.value = '';
            userInput.focus();

            showTyping(true);
            const thinkTime = Math.min(1200, 300 + Math.max(0, query.length * 40));
            await new Promise(r => setTimeout(r, thinkTime));

            const { item, score } = findBestMatch(query);

            showTyping(false);

            if (!item || score < 3) {
                const fallback = "I couldn't find a direct answer. Try rephrasing or ask about CSU/UC deadlines, TAG, IGETC, or GPA requirements.";
                appendMessage('bot', fallback);
            } else {
                appendMessage('bot', item.answer);
                showFollowups(item);
            }
        }

        function showFollowups(item) {
            if (!item || !item.category) return;
            const related = dataset
                .filter(d => d !== item && d.category === item.category)
                .slice(0, 3)
                .map(d => d.question);

            if (related.length === 0) return;

            const row = document.createElement('div');
            row.className = 'suggestion-tags';
            related.forEach(q => {
                const btn = document.createElement('button');
                btn.className = 'tag';
                btn.type = 'button';
                btn.textContent = q;
                btn.addEventListener('click', () => handleQuery(q));
                row.appendChild(btn);
            });
            chatMessages.appendChild(row);
            row.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }

        function wireUI() {
            sendBtn.addEventListener('click', (e) => {
                e.preventDefault();
                handleQuery(userInput.value);
            });

            userInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleQuery(userInput.value);
                }
            });

            document.querySelectorAll('.tag, .chip').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    handleQuery(e.currentTarget.textContent);
                });
            });
        }

        // global error handler to help debugging
        window.addEventListener('error', (ev) => {
            console.error('Uncaught error:', ev.error || ev.message, ev);
        });

        await loadData();
        wireUI();
        showTyping(false);
    });
})();
