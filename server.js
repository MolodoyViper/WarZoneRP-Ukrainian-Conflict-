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

// Постройки на локациях
const BUILDINGS = {
    base: { name: 'База', emoji: '🏰', bonus: 'respawn', desc: 'Точка возрождения', hp: 500 },
    checkpoint: { name: 'КПП', emoji: '🛂', bonus: 'defense', desc: '+20% к защите', hp: 200 },
    warehouse: { name: 'Склад', emoji: '📦', bonus: 'supplies', desc: 'Пополнение медикаментов и снаряжения', hp: 300 },
    hospital: { name: 'Госпиталь', emoji: '🏥', bonus: 'heal', desc: '+5 HP за действие на точке', hp: 250 },
    barrack: { name: 'Казарма', emoji: '🛏️', bonus: 'morale', desc: '+15% к эффективности', hp: 300 }
};

let gameState = {
    locations: {
        // Тыловые точки РФ
        donetsk: { name: 'Донецк', control: 'russia', rusPower: 95, ukrPower: 5, buildings: ['base', 'hospital', 'warehouse'], x: 430, y: 305 },
        lugansk: { name: 'Луганск', control: 'russia', rusPower: 92, ukrPower: 8, buildings: ['barrack', 'checkpoint'], x: 490, y: 215 },
        mariupol: { name: 'Мариуполь', control: 'russia', rusPower: 85, ukrPower: 15, buildings: ['checkpoint', 'warehouse'], x: 445, y: 350 },
        
        // Тыловые точки ВСУ
        kharkiv: { name: 'Харьков', control: 'ukraine', rusPower: 10, ukrPower: 90, buildings: ['base', 'hospital', 'warehouse'], x: 435, y: 170 },
        kherson: { name: 'Херсон', control: 'ukraine', rusPower: 8, ukrPower: 92, buildings: ['barrack', 'checkpoint'], x: 240, y: 335 },
        
        // Фронтовые точки
        bakhmut: { name: 'Бахмут', control: 'contested', rusPower: 45, ukrPower: 55, buildings: ['checkpoint'], x: 390, y: 255 },
        avdeevka: { name: 'Авдеевка', control: 'contested', rusPower: 60, ukrPower: 40, buildings: ['checkpoint'], x: 365, y: 280 },
        soledar: { name: 'Соледар', control: 'russia', rusPower: 75, ukrPower: 25, buildings: ['checkpoint'], x: 410, y: 235 },
        ugledar: { name: 'Угледар', control: 'contested', rusPower: 50, ukrPower: 50, buildings: ['barrack'], x: 405, y: 320 },
        zaporozhye: { name: 'Запорожье', control: 'contested', rusPower: 40, ukrPower: 60, buildings: ['checkpoint', 'warehouse'], x: 285, y: 285 },
        
        // Новые точки
        kramatorsk: { name: 'Краматорск', control: 'ukraine', rusPower: 15, ukrPower: 85, buildings: ['barrack'], x: 380, y: 210 },
        gorlovka: { name: 'Горловка', control: 'russia', rusPower: 80, ukrPower: 20, buildings: ['checkpoint'], x: 440, y: 275 },
        izyum: { name: 'Изюм', control: 'contested', rusPower: 35, ukrPower: 65, buildings: [], x: 400, y: 185 },
        tokmak: { name: 'Токмак', control: 'contested', rusPower: 55, ukrPower: 45, buildings: ['warehouse'], x: 350, y: 340 },
        kupiansk: { name: 'Купянск', control: 'contested', rusPower: 30, ukrPower: 70, buildings: ['checkpoint'], x: 460, y: 190 }
    },
    players: {},
    squads: {},
    orders: {},
    captureProgress: {},
    factionChat: { russia: [], ukraine: [] }
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
    const players = [];
    Object.values(gameState.players).forEach(p => {
        if (p.alive && p.location === locationId) {
            if (p.faction === 'russia') rus++; else ukr++;
            players.push(p);
        }
    });
    return { rus, ukr, total: rus + ukr, players };
}

function getLocationBonus(locationId, player) {
    const loc = gameState.locations[locationId];
    if (!loc || !loc.buildings) return { heal: 0, defense: 0, supplies: false, respawn: false, morale: 0 };
    
    const bonuses = { heal: 0, defense: 0, supplies: false, respawn: false, morale: 0 };
    
    loc.buildings.forEach(buildingId => {
        const building = BUILDINGS[buildingId];
        if (!building) return;
        switch (building.bonus) {
            case 'respawn': bonuses.respawn = true; break;
            case 'defense': bonuses.defense = 20; break;
            case 'supplies': bonuses.supplies = true; break;
            case 'heal': bonuses.heal = 5; break;
            case 'morale': bonuses.morale = 15; break;
        }
    });
    
    return bonuses;
}

// Прокачка EHP
function calculateMaxHP(player) {
    const baseHP = 100;
    const killsBonus = Math.floor((player.kills || 0) / 5) * 10; // +10 HP за каждые 5 убийств
    const rankBonus = { 'Рядовой': 0, 'Ефрейтор': 10, 'Сержант': 20, 'Лейтенант': 35, 'Капитан': 50 };
    return baseHP + killsBonus + (rankBonus[player.rank] || 0);
}

function updateRank(player) {
    const kills = player.kills || 0;
    if (kills >= 20) player.rank = 'Капитан';
    else if (kills >= 12) player.rank = 'Лейтенант';
    else if (kills >= 7) player.rank = 'Сержант';
    else if (kills >= 3) player.rank = 'Ефрейтор';
    else player.rank = 'Рядовой';
}

// ========== ЭНДПОИНТЫ ==========

// Присоединение
app.post('/api/join', async (req, res) => {
    const { name, faction, unitId, charClass, look } = req.body;
    if (!name || !faction || !unitId) return res.json({ error: 'Заполни все поля' });
    
    const playerId = 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const startLocation = faction === 'russia' ? 'donetsk' : 'kharkiv';
    
    const player = {
        id: playerId, name, faction, unit: unitId, class: charClass,
        look: look || 'стандартная форма', hp: 100, maxHp: 100, kills: 0, deaths: 0,
        location: startLocation, alive: true, rank: 'Рядовой', xp: 0,
        supplies: charClass === 'medic' ? 5 : 0
    };
    
    gameState.players[playerId] = player;
    if (!gameState.squads[unitId]) gameState.squads[unitId] = [];
    gameState.squads[unitId].push(playerId);
    
    const unit = UNITS[faction][unitId];
    let greeting = `${unit.commanderName}: Боец ${name}, прибыл в "${unit.name}".`;
    try { greeting = await askMistral('Ты военный командир.', `Приветствие бойцу ${name}. 1 предложение.`); } catch (e) {}
    
    res.json({ player, greeting, unit: { name: unit.name, emblem: unit.emblem, commanderName: unit.commanderName } });
});

// Возрождение
app.post('/api/respawn', (req, res) => {
    const { playerId, name, faction, unitId, charClass, look } = req.body;
    
    if (playerId && gameState.players[playerId]) {
        gameState.players[playerId].alive = false;
        gameState.players[playerId].location = null;
    }
    
    const newPlayerId = 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const startLocation = faction === 'russia' ? 'donetsk' : 'kharkiv';
    
    const player = {
        id: newPlayerId, name, faction, unit: unitId, class: charClass,
        look: look || 'стандартная форма', hp: 100, maxHp: 100, kills: 0, deaths: 0,
        location: startLocation, alive: true, rank: 'Рядовой', xp: 0,
        supplies: charClass === 'medic' ? 5 : 0
    };
    
    gameState.players[newPlayerId] = player;
    res.json({ player, message: '🔄 Новый боец прибыл на фронт!' });
});

// Действие
app.post('/api/action', async (req, res) => {
    const { playerId, action } = req.body;
    const player = gameState.players[playerId];
    
    if (!player || !player.alive) {
        return res.json({ 
            narrative: '💀 Ты погиб. Используй кнопку "Новый боец" для возрождения.', 
            gameUpdate: { systemMessage: 'Ты мёртв.' } 
        });
    }
    
    const loc = gameState.locations[player.location];
    if (!loc) return res.json({ narrative: 'Ты вне карты.', gameUpdate: {} });
    
    const buff = CLASS_BUFFS[player.class];
    const bonuses = getLocationBonus(player.location, player);
    const counts = countPlayersOnLocation(player.location);
    
    // Пассивное лечение от госпиталя
    if (bonuses.heal > 0 && player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + bonuses.heal);
    }
    
    // Лечение медика
    if ((action.toLowerCase().includes('лечу') || action.toLowerCase().includes('лечить')) && player.class === 'medic') {
        const wounded = Object.values(gameState.players).filter(p => 
            p.alive && p.id !== player.id && p.faction === player.faction && 
            p.location === player.location && p.hp < p.maxHp
        );
        if (wounded.length === 0) return res.json({ narrative: 'Нет раненых союзников.', gameUpdate: {} });
        if (player.supplies <= 0) {
            if (bonuses.supplies) { player.supplies = 5; }
            else return res.json({ narrative: '❌ Нет медикаментов! Отойди на точку со складом.', gameUpdate: {} });
        }
        const target = wounded[Math.floor(Math.random() * wounded.length)];
        const heal = Math.min(25, target.maxHp - target.hp);
        target.hp += heal;
        player.supplies--;
        return res.json({ 
            narrative: `💉 ${player.name} вылечил ${target.name} (+${heal} HP). Медикаментов: ${player.supplies}`,
            gameUpdate: { playerChanges: { supplies: player.supplies }, systemMessage: `${target.name} +${heal} HP` }
        });
    }
    
    // Пополнение на складе
    if ((action.toLowerCase().includes('пополн') || action.toLowerCase().includes('склад')) && bonuses.supplies) {
        player.supplies = 5;
        return res.json({ narrative: '📦 Пополнил припасы на складе.', gameUpdate: { playerChanges: { supplies: 5 } } });
    }
    
    const systemPrompt = `Ты AI-Мастер WarZone. Отвечай СТРОГО JSON: {"narrative":"...","rusPower":ЧИСЛО,"ukrPower":ЧИСЛО,"playerHp":ЧИСЛО,"enemyHp":ЧИСЛО,"systemMessage":"..."}. Атака меняет контроль на 5-20%. Ранение 30% (10-25 урона). При 70% контроль переходит.`;
    const userPrompt = `Игрок: ${player.name} (${player.faction}, ${UNITS[player.faction][player.unit].name}, ${buff.name}, HP:${player.hp}/${player.maxHp}, Ранг:${player.rank}). Локация: ${loc.name} (РФ:${loc.rusPower}%/ВСУ:${loc.ukrPower}%, здания: ${loc.buildings?.join(',') || 'нет'}). Союзников: ${player.faction==='russia'?counts.rus:counts.ukr}, Врагов: ${player.faction==='russia'?counts.ukr:counts.rus}. Действие: "${action}"`;
    
    try {
        const aiText = await askMistral(systemPrompt, userPrompt);
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            const p = JSON.parse(jsonMatch[0]);
            let hp = p.playerHp || player.hp;
            
            // Бафф выживаемости
            if (buff.buff === 'survivability' && hp < player.hp) {
                hp = player.hp - Math.floor((player.hp - hp) * 0.85);
            }
            
            // Бафф защиты от КПП
            if (bonuses.defense > 0 && hp < player.hp) {
                hp = player.hp - Math.floor((player.hp - hp) * 0.8);
            }
            
            player.hp = Math.max(0, Math.min(player.maxHp, hp));
            
            // Убийство врага
            if (p.enemyHp && p.enemyHp <= 0) {
                player.kills = (player.kills || 0) + 1;
                player.xp = (player.xp || 0) + 10;
                updateRank(player);
                player.maxHp = calculateMaxHP(player);
            }
            
            if (p.rusPower != null) loc.rusPower = Math.max(0, Math.min(100, p.rusPower));
            if (p.ukrPower != null) loc.ukrPower = Math.max(0, Math.min(100, p.ukrPower));
            
            if (loc.rusPower >= 70) loc.control = 'russia';
            else if (loc.ukrPower >= 70) loc.control = 'ukraine';
            else loc.control = 'contested';
            
            // СМЕРТЬ
            if (player.hp <= 0) {
                player.alive = false;
                player.deaths = (player.deaths || 0) + 1;
                player.location = null;
                return res.json({
                    narrative: `💀 ${player.name} пал в бою! Убийств: ${player.kills}, Ранг: ${player.rank}.`,
                    gameUpdate: { 
                        playerChanges: { hp: 0, alive: false },
                        systemMessage: `${player.name} погиб. Создай нового бойца кнопкой "Новый боец".`
                    }
                });
            }
            
            res.json({
                narrative: p.narrative,
                gameUpdate: {
                    playerChanges: { hp: player.hp, kills: player.kills, rank: player.rank, maxHp: player.maxHp, xp: player.xp, supplies: player.supplies },
                    locationChanges: { rusPower: loc.rusPower, ukrPower: loc.ukrPower },
                    systemMessage: p.systemMessage || ''
                }
            });
        } else {
            res.json({ narrative: aiText, gameUpdate: {} });
        }
    } catch (e) {
        console.error('Action error:', e);
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
    
    if (enemyPower > 70) {
        return res.json({ success: false, error: `Враг контролирует ${newLoc.name} на ${enemyPower}%. Ослабьте оборону.` });
    }
    
    let damage = 0;
    if (enemyPower >= 50) damage = Math.random() < 0.4 ? Math.floor(Math.random() * 20) + 10 : 0;
    else if (enemyPower >= 30) damage = Math.random() < 0.2 ? Math.floor(Math.random() * 15) + 5 : 0;
    
    const oldLoc = gameState.locations[player.location];
    player.location = location;
    if (damage > 0) player.hp = Math.max(0, player.hp - damage);
    
    if (player.hp <= 0) {
        player.alive = false;
        player.location = null;
        player.deaths = (player.deaths || 0) + 1;
        return res.json({ success: false, error: `💀 ${player.name} погиб при обстреле во время перемещения!`, player });
    }
    
    res.json({ 
        success: true, player, 
        message: `${player.name} переместился из ${oldLoc.name} в ${newLoc.name}${damage > 0 ? ` (обстрел! -${damage} HP)` : ''}`,
        damage 
    });
});

// Чат фракции
app.post('/api/faction-chat', (req, res) => {
    const { playerId, message } = req.body;
    const player = gameState.players[playerId];
    if (!player || !player.alive) return res.json({ error: 'Нельзя отправить сообщение' });
    
    const chatEntry = {
        id: Date.now(),
        playerName: player.name,
        unit: UNITS[player.faction][player.unit]?.emblem || '',
        message: message.substring(0, 200),
        timestamp: Date.now()
    };
    
    gameState.factionChat[player.faction].push(chatEntry);
    
    // Храним последние 50 сообщений
    if (gameState.factionChat[player.faction].length > 50) {
        gameState.factionChat[player.faction].shift();
    }
    
    res.json({ success: true, chat: gameState.factionChat[player.faction] });
});

app.get('/api/faction-chat/:faction', (req, res) => {
    res.json({ chat: gameState.factionChat[req.params.faction] || [] });
});

// Приказ
app.get('/api/commander/:playerId', async (req, res) => {
    const player = gameState.players[req.params.playerId];
    if (!player) return res.json({ order: 'Игрок не найден.' });
    
    const unit = UNITS[player.faction][player.unit];
    const loc = gameState.locations[player.location];
    
    try {
        const order = await askMistral(
            `Ты командир "${unit.name}" ${unit.emblem}, позывной ${unit.commanderName}.`,
            `Боец ${player.name} (${player.class}, HP:${player.hp}/${player.maxHp}, Ранг:${player.rank}) в ${loc?.name || 'неизвестно'}. Отдай приказ.`
        );
        gameState.orders[player.id] = { text: order, from: unit.commanderName, timestamp: Date.now() };
        res.json({ order, commanderName: unit.commanderName, unitEmblem: unit.emblem });
    } catch (e) {
        res.json({ order: 'Держать позицию. Доклад при обнаружении противника.', commanderName: unit.commanderName, unitEmblem: unit.emblem });
    }
});

// Состояние игры
app.get('/api/state', (req, res) => {
    const lc = {};
    Object.entries(gameState.locations).forEach(([id, loc]) => {
        lc[id] = { russia: loc.rusPower, ukraine: loc.ukrPower, control: loc.control, buildings: loc.buildings };
    });
    res.json({ 
        locations: gameState.locations, 
        players: gameState.players, 
        locationControl: lc, 
        squads: gameState.squads, 
        captureProgress: gameState.captureProgress 
    });
});

app.get('/api/player/:playerId', (req, res) => {
    const p = gameState.players[req.params.playerId];
    if (p && p.alive) res.json({ player: p }); 
    else res.json({ error: 'Не найден или мёртв' });
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
    });
}, 900000);

// Очистка мёртвых игроков (каждый час)
setInterval(() => {
    Object.entries(gameState.players).forEach(([id, player]) => {
        if (!player.alive && Date.now() - (player.lastAction || 0) > 3600000) {
            delete gameState.players[id];
        }
    });
}, 3600000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`WarZone 3.0 running on port ${PORT}`));