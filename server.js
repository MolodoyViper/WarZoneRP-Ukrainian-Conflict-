const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API ключ Mistral
const MISTRAL_API_KEY = 'c9Ced6auhQAQqUQNO0xf0LrwT95BRTjz';
const API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MODEL = 'mistral-large-latest';

// Подразделения
const UNITS = {
    russia: {
        somali: { name: 'Сомали', emblem: '🦂', commanderName: 'Михалыч', commanderStyle: 'Жёсткий, тактический' },
        pyatnashka: { name: 'Пятнашка', emblem: '1️⃣5️⃣', commanderName: 'Абхаз', commanderStyle: 'Спокойный, кавказский акцент' },
        sparta: { name: 'Спарта', emblem: '⚔️', commanderName: 'Спартанец', commanderStyle: 'Лаконичный, чёткий' },
        wolves: { name: 'Волки', emblem: '🐺', commanderName: 'Вожак', commanderStyle: 'Таинственный, профи' }
    },
    ukraine: {
        azov: { name: 'Азов', emblem: '🔱', commanderName: 'Рейд', commanderStyle: 'Энергичный, агрессивный' },
        aidar: { name: 'Айдар', emblem: '⚔️', commanderName: 'Дiд', commanderStyle: 'Отеческий, бывалый' },
        kraken: { name: 'Кракен', emblem: '🐙', commanderName: 'Ктулху', commanderStyle: 'Дерзкий, загадочный' },
        ghost: { name: 'Призрак', emblem: '💀', commanderName: 'Тень', commanderStyle: 'Молчаливый, смертоносный' }
    }
};

// Состояние игры
let gameState = {
    locations: {
        bakhmut: { name: 'Бахмут', x: 380, y: 260, control: 'contested', rusPower: 45, ukrPower: 55 },
        avdeevka: { name: 'Авдеевка', x: 360, y: 285, control: 'contested', rusPower: 60, ukrPower: 40 },
        kherson: { name: 'Херсон', x: 240, y: 330, control: 'ukraine', rusPower: 8, ukrPower: 92 },
        donetsk: { name: 'Донецк', x: 420, y: 300, control: 'russia', rusPower: 95, ukrPower: 5 },
        lugansk: { name: 'Луганск', x: 480, y: 220, control: 'russia', rusPower: 92, ukrPower: 8 },
        zaporozhye: { name: 'Запорожье', x: 280, y: 280, control: 'contested', rusPower: 40, ukrPower: 60 },
        kharkiv: { name: 'Харьков', x: 420, y: 175, control: 'ukraine', rusPower: 10, ukrPower: 90 },
        mariupol: { name: 'Мариуполь', x: 440, y: 345, control: 'russia', rusPower: 85, ukrPower: 15 },
        soledar: { name: 'Соледар', x: 400, y: 240, control: 'russia', rusPower: 75, ukrPower: 25 },
        ugledar: { name: 'Угледар', x: 400, y: 320, control: 'contested', rusPower: 50, ukrPower: 50 }
    },
    players: {},
    squads: {},
    orders: {}
};

// Запрос к Mistral
async function askMistral(systemPrompt, userPrompt) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${MISTRAL_API_KEY}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.9,
            max_tokens: 300
        })
    });
    
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Mistral API error: ${response.status} - ${err}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
}

// Присоединение игрока
app.post('/api/join', async (req, res) => {
    const { name, faction, unitId, charClass, look } = req.body;
    if (!name || !faction || !unitId) return res.json({ error: 'Заполни все поля' });

    const playerId = 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const startLocation = faction === 'russia' ? 'donetsk' : 'kharkiv';

    const player = {
        id: playerId, name, faction, unit: unitId, class: charClass,
        look: look || 'стандартная форма', hp: 100, kills: 0, deaths: 0,
        location: startLocation, alive: true, rank: 'Рядовой'
    };

    gameState.players[playerId] = player;
    if (!gameState.squads[unitId]) gameState.squads[unitId] = [];
    gameState.squads[unitId].push(playerId);

    const unit = UNITS[faction][unitId];
    let greeting = `${unit.commanderName}: Боец ${name}, прибыл в "${unit.name}". Занять позицию.`;

    try {
        const prompt = `Поприветствуй нового бойца ${name} (${charClass}). Ты командир "${unit.name}" ${unit.emblem}, позывной ${unit.commanderName}. Стиль: ${unit.commanderStyle}. 1 предложение.`;
        greeting = await askMistral('Ты военный командир. Отвечай коротко, по-военному.', prompt);
    } catch (e) {
        console.error('Mistral join error:', e.message);
    }

    res.json({ player, greeting, unit: { name: unit.name, emblem: unit.emblem, commanderName: unit.commanderName } });
});

// Действие игрока
app.post('/api/action', async (req, res) => {
    const { playerId, action } = req.body;
    const player = gameState.players[playerId];
    if (!player || !player.alive) return res.json({ error: 'Игрок не найден или мёртв' });

    const loc = gameState.locations[player.location];

    const systemPrompt = `Ты AI-Мастер военной RPG WarZone. Отвечай СТРОГО JSON без лишнего текста.
Механика: атака меняет контроль на 5-20%, шанс ранения 30% (10-25 урона). При 70%+ контроль переходит фракции.
Формат: {"narrative":"описание боя","rusPower":число,"ukrPower":число,"playerHp":число,"systemMessage":"краткое уведомление"}`;

    const userPrompt = `Игрок: ${player.name} (${player.faction}, ${UNITS[player.faction][player.unit].name}, HP:${player.hp})
Локация: ${loc.name} (РФ:${loc.rusPower}%/ВСУ:${loc.ukrPower}%)
Действие: "${action}"
Опиши результат боя и обнови параметры в JSON.`;

    try {
        const aiText = await askMistral(systemPrompt, userPrompt);
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            player.hp = parsed.playerHp || player.hp;
            loc.rusPower = parsed.rusPower || loc.rusPower;
            loc.ukrPower = parsed.ukrPower || loc.ukrPower;
            
            if (loc.rusPower >= 70) loc.control = 'russia';
            else if (loc.ukrPower >= 70) loc.control = 'ukraine';
            else loc.control = 'contested';
            
            if (player.hp <= 0) player.alive = false;
            
            res.json({
                narrative: parsed.narrative,
                gameUpdate: {
                    playerChanges: { hp: player.hp },
                    locationChanges: { rusPower: loc.rusPower, ukrPower: loc.ukrPower },
                    systemMessage: parsed.systemMessage || ''
                }
            });
        } else {
            res.json({ narrative: aiText, gameUpdate: {} });
        }
    } catch (e) {
        console.error('Mistral action error:', e.message);
        res.json({ narrative: '⚡ Связь потеряна. Попробуй снова.', gameUpdate: {} });
    }
});

// Приказ командира
app.get('/api/commander/:playerId', async (req, res) => {
    const player = gameState.players[req.params.playerId];
    if (!player) return res.json({ order: 'Игрок не найден.' });

    const unit = UNITS[player.faction][player.unit];
    const loc = gameState.locations[player.location];

    try {
        const prompt = `Боец ${player.name} (${player.class}, HP:${player.hp}) в ${loc.name} (РФ:${loc.rusPower}%/ВСУ:${loc.ukrPower}%). Отдай короткий приказ. 1-2 предложения.`;
        const order = await askMistral(
            `Ты командир "${unit.name}" ${unit.emblem}, позывной ${unit.commanderName}. Стиль: ${unit.commanderStyle}. Отвечай коротко.`,
            prompt
        );
        gameState.orders[player.id] = { text: order, from: unit.commanderName, timestamp: Date.now() };
        res.json({ order, commanderName: unit.commanderName, unitEmblem: unit.emblem });
    } catch (e) {
        res.json({ order: 'Держать позицию. Доклад при обнаружении противника.', commanderName: unit.commanderName, unitEmblem: unit.emblem });
    }
});

// Состояние игры
app.get('/api/state', (req, res) => {
    const locationControl = {};
    Object.entries(gameState.locations).forEach(([id, loc]) => {
        locationControl[id] = { russia: loc.rusPower, ukraine: loc.ukrPower, control: loc.control };
    });
    res.json({ locations: gameState.locations, players: gameState.players, locationControl, squads: gameState.squads });
});

// Запуск
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`WarZone running on port ${PORT}`));