const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const MISTRAL_API_KEY = 'c9Ced6auhQAQqUQNO0xf0LrwT95BRTjz';
const API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MODEL = 'mistral-large-latest';

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

const CLASS_BUFFS = {
    rifleman: { name: 'Стрелок', buff: 'survivability', buffValue: 15 },
    sniper: { name: 'Снайпер', buff: 'accuracy', buffValue: 20 },
    medic: { name: 'Медик', buff: 'heal', buffValue: 25 },
    engineer: { name: 'Инженер', buff: 'sabotage', buffValue: 15 },
    commander: { name: 'Командир', buff: 'morale', buffValue: 10 }
};

let gameState = {
    locations: {
        bakhmut: { name: 'Бахмут', control: 'contested', rusPower: 45, ukrPower: 55 },
        avdeevka: { name: 'Авдеевка', control: 'contested', rusPower: 60, ukrPower: 40 },
        kherson: { name: 'Херсон', control: 'ukraine', rusPower: 8, ukrPower: 92 },
        donetsk: { name: 'Донецк', control: 'russia', rusPower: 95, ukrPower: 5 },
        lugansk: { name: 'Луганск', control: 'russia', rusPower: 92, ukrPower: 8 },
        zaporozhye: { name: 'Запорожье', control: 'contested', rusPower: 40, ukrPower: 60 },
        kharkiv: { name: 'Харьков', control: 'ukraine', rusPower: 10, ukrPower: 90 },
        mariupol: { name: 'Мариуполь', control: 'russia', rusPower: 85, ukrPower: 15 },
        soledar: { name: 'Соледар', control: 'russia', rusPower: 75, ukrPower: 25 },
        ugledar: { name: 'Угледар', control: 'contested', rusPower: 50, ukrPower: 50 }
    },
    players: {},
    squads: {},
    orders: {},
    captureProgress: {}
};

async function askMistral(systemPrompt, userPrompt) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.9, max_tokens: 300 })
    });
    if (!response.ok) throw new Error(`Mistral API error: ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content;
}

function countPlayersOnLocation(locationId) {
    let rus = 0, ukr = 0;
    Object.values(gameState.players).forEach(p => {
        if (p.alive && p.location === locationId) {
            if (p.faction === 'russia') rus++; else ukr++;
        }
    });
    return { rus, ukr, total: rus + ukr };
}

// Присоединение
app.post('/api/join', async (req, res) => {
    const { name, faction, unitId, charClass, look } = req.body;
    if (!name || !faction || !unitId) return res.json({ error: 'Заполни все поля' });
    const playerId = 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const startLocation = faction === 'russia' ? 'donetsk' : 'kharkiv';
    const player = {
        id: playerId, name, faction, unit: unitId, class: charClass,
        look: look || 'стандартная форма', hp: 100, kills: 0, deaths: 0,
        location: startLocation, alive: true, rank: 'Рядовой',
        supplies: charClass === 'medic' ? 5 : 0
    };
    gameState.players[playerId] = player;
    if (!gameState.squads[unitId]) gameState.squads[unitId] = [];
    gameState.squads[unitId].push(playerId);
    const unit = UNITS[faction][unitId];
    let greeting = `${unit.commanderName}: Боец ${name}, прибыл в "${unit.name}".`;
    try { greeting = await askMistral('Ты военный командир.', `Приветствие бойцу ${name} (${charClass}). Командир "${unit.name}" ${unit.emblem}. 1 предложение.`); } catch (e) {}
    res.json({ player, greeting, unit: { name: unit.name, emblem: unit.emblem, commanderName: unit.commanderName } });
});

// Действие
app.post('/api/action', async (req, res) => {
    const { playerId, action } = req.body;
    const player = gameState.players[playerId];
    if (!player || !player.alive) return res.json({ error: 'Игрок не найден или мёртв' });
    const loc = gameState.locations[player.location];
    const buff = CLASS_BUFFS[player.class];

    // Лечение
    if ((action.toLowerCase().includes('лечу') || action.toLowerCase().includes('лечить')) && player.class === 'medic') {
        const wounded = Object.values(gameState.players).filter(p => p.alive && p.id !== player.id && p.faction === player.faction && p.location === player.location && p.hp < 80);
        if (wounded.length === 0) return res.json({ narrative: 'Нет раненых союзников.', gameUpdate: {} });
        if (player.supplies <= 0) return res.json({ narrative: '❌ Нет медикаментов! Пополни в тылу.', gameUpdate: {} });
        const target = wounded[Math.floor(Math.random() * wounded.length)];
        const heal = Math.min(25, 100 - target.hp);
        target.hp += heal; player.supplies--;
        return res.json({ narrative: `💉 ${player.name} вылечил ${target.name} (+${heal} HP). Медикаментов: ${player.supplies}`, gameUpdate: { playerChanges: { supplies: player.supplies }, systemMessage: `${target.name} +${heal} HP` } });
    }

    // Пополнение медикаментов
    if ((action.toLowerCase().includes('пополн') || action.toLowerCase().includes('склад')) && player.class === 'medic') {
        const safe = (player.faction === 'russia' && ['donetsk','lugansk'].includes(player.location)) || (player.faction === 'ukraine' && ['kharkiv','kherson'].includes(player.location));
        if (safe) { player.supplies = 5; return res.json({ narrative: '📦 Пополнил медикаменты (5 шт).', gameUpdate: { playerChanges: { supplies: 5 } } }); }
    }

    const systemPrompt = `Ты AI-Мастер WarZone. Отвечай СТРОГО JSON: {"narrative":"...","rusPower":ЧИСЛО,"ukrPower":ЧИСЛО,"playerHp":ЧИСЛО,"systemMessage":"..."}. Атака меняет контроль на 5-20%. Ранение 30% (10-25 урона). При 70% контроль переходит.`;
    const userPrompt = `Игрок: ${player.name} (${player.faction}, ${UNITS[player.faction][player.unit].name}, ${buff.name}, HP:${player.hp}). Локация: ${loc.name} (РФ:${loc.rusPower}%/ВСУ:${loc.ukrPower}%). Действие: "${action}"`;

    try {
        const aiText = await askMistral(systemPrompt, userPrompt);
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const p = JSON.parse(jsonMatch[0]);
            let hp = p.playerHp || player.hp;
            if (buff.buff === 'survivability' && hp < player.hp) hp = player.hp - Math.floor((player.hp - hp) * 0.85);
            player.hp = hp;
            if (p.rusPower) loc.rusPower = Math.max(0, Math.min(100, p.rusPower));
            if (p.ukrPower) loc.ukrPower = Math.max(0, Math.min(100, p.ukrPower));
            if (loc.rusPower >= 70) loc.control = 'russia';
            else if (loc.ukrPower >= 70) loc.control = 'ukraine';
            else loc.control = 'contested';
            if (player.hp <= 0) player.alive = false;
            res.json({ narrative: p.narrative, gameUpdate: { playerChanges: { hp: player.hp, supplies: player.supplies }, locationChanges: { rusPower: loc.rusPower, ukrPower: loc.ukrPower }, systemMessage: p.systemMessage || '' } });
        } else {
            res.json({ narrative: aiText, gameUpdate: {} });
        }
    } catch (e) {
        res.json({ narrative: '⚡ Связь потеряна.', gameUpdate: {} });
    }
});

// Перемещение
app.post('/api/move', (req, res) => {
    const { playerId, location } = req.body;
    const player = gameState.players[playerId];
    if (!player || !player.alive) return res.json({ success: false, error: 'Нельзя переместиться' });
    if (!gameState.locations[location]) return res.json({ success: false, error: 'Точка не найдена' });

    const newLoc = gameState.locations[location];
    const enemyPower = player.faction === 'russia' ? newLoc.ukrPower : newLoc.rusPower;

    // Враг >70% = нельзя
    if (enemyPower > 70) {
        return res.json({ success: false, error: `Враг контролирует ${newLoc.name} на ${enemyPower}%. Сначала ослабьте оборону.` });
    }

    // Риск обстрела
    let damage = 0;
    if (enemyPower >= 50) damage = Math.random() < 0.4 ? Math.floor(Math.random() * 20) + 10 : 0;
    else if (enemyPower >= 30) damage = Math.random() < 0.2 ? Math.floor(Math.random() * 15) + 5 : 0;

    const oldLoc = gameState.locations[player.location];
    player.location = location;
    if (damage > 0) player.hp = Math.max(0, player.hp - damage);

    res.json({ success: true, player, message: `${player.name} переместился из ${oldLoc.name} в ${newLoc.name}${damage > 0 ? ` (обстрел! -${damage} HP)` : ''}`, damage });
});

// Приказ
app.get('/api/commander/:playerId', async (req, res) => {
    const player = gameState.players[req.params.playerId];
    if (!player) return res.json({ order: 'Игрок не найден.' });
    const unit = UNITS[player.faction][player.unit];
    const loc = gameState.locations[player.location];
    try {
        const order = await askMistral(`Ты командир "${unit.name}" ${unit.emblem}, позывной ${unit.commanderName}.`, `Боец ${player.name} (${player.class}, HP:${player.hp}) в ${loc.name}. Отдай приказ.`);
        gameState.orders[player.id] = { text: order, from: unit.commanderName, timestamp: Date.now() };
        res.json({ order, commanderName: unit.commanderName, unitEmblem: unit.emblem });
    } catch (e) {
        res.json({ order: 'Держать позицию.', commanderName: unit.commanderName, unitEmblem: unit.emblem });
    }
});

// Состояние
app.get('/api/state', (req, res) => {
    const lc = {};
    Object.entries(gameState.locations).forEach(([id, loc]) => { lc[id] = { russia: loc.rusPower, ukraine: loc.ukrPower, control: loc.control }; });
    res.json({ locations: gameState.locations, players: gameState.players, locationControl: lc, squads: gameState.squads, captureProgress: gameState.captureProgress });
});

app.get('/api/player/:playerId', (req, res) => {
    const p = gameState.players[req.params.playerId];
    if (p && p.alive) res.json({ player: p }); else res.json({ error: 'Не найден' });
});

// ========== ПАССИВНОЕ ПАДЕНИЕ КОНТРОЛЯ ==========
setInterval(() => {
    Object.entries(gameState.locations).forEach(([locId, loc]) => {
        const counts = countPlayersOnLocation(locId);
        if (counts.rus === 0) loc.rusPower = Math.max(0, loc.rusPower - 3);
        if (counts.ukr === 0) loc.ukrPower = Math.max(0, loc.ukrPower - 3);
        if (loc.rusPower >= 70) loc.control = 'russia';
        else if (loc.ukrPower >= 70) loc.control = 'ukraine';
        else loc.control = 'contested';
        if (counts.total === 0 && (loc.rusPower > 0 || loc.ukrPower > 0)) console.log(`📍 ${loc.name}: пассивное падение. РФ:${loc.rusPower}% ВСУ:${loc.ukrPower}%`);
    });
}, 900000); // 15 минут

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`WarZone running on port ${PORT}`));