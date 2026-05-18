const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const MISTRAL_API_KEY = 'c9Ced6auhQAQqUQNO0xf0LrwT95BRTjz';
const API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MODEL = 'mistral-large-latest';
const SAVE_FILE = './warzone_save.json';

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

const BUILDINGS = {
    base: { name: 'База', emoji: '🏰', bonus: 'respawn', hp: 500 },
    checkpoint: { name: 'КПП', emoji: '🛂', bonus: 'defense', hp: 200 },
    warehouse: { name: 'Склад', emoji: '📦', bonus: 'supplies', hp: 300 },
    hospital: { name: 'Госпиталь', emoji: '🏥', bonus: 'heal', hp: 250 },
    barrack: { name: 'Казарма', emoji: '🛏️', bonus: 'morale', hp: 300 }
};

// Предметы инвентаря
const ITEMS = {
    // Шлемы
    steel_helmet: { name: 'Стальной шлем', emoji: '🪖', slot: 'helmet', buff: { defense: 5 }, rarity: 'common' },
    tactical_helmet: { name: 'Тактический шлем', emoji: '⛑️', slot: 'helmet', buff: { defense: 8, accuracy: 2 }, rarity: 'uncommon' },
    night_vision: { name: 'ПНВ', emoji: '👁️', slot: 'helmet', buff: { accuracy: 8, defense: 2 }, rarity: 'rare' },
    // Броня
    light_vest: { name: 'Лёгкий броник', emoji: '🦺', slot: 'armor', buff: { defense: 8 }, rarity: 'common' },
    heavy_vest: { name: 'Тяжёлый броник', emoji: '🛡️', slot: 'armor', buff: { defense: 15, speed: -3 }, rarity: 'uncommon' },
    plate_carrier: { name: 'Плитник', emoji: '🗿', slot: 'armor', buff: { defense: 20, speed: -5 }, rarity: 'rare' },
    // Оружие
    ak74: { name: 'АК-74', emoji: '🔫', slot: 'weapon', buff: { damage: 5 }, rarity: 'common' },
    m4a1: { name: 'M4A1', emoji: '🎯', slot: 'weapon', buff: { damage: 8, accuracy: 3 }, rarity: 'uncommon' },
    svd: { name: 'СВД', emoji: '🔭', slot: 'weapon', buff: { damage: 15, accuracy: 8 }, rarity: 'rare' },
    // Обувь
    boots_standard: { name: 'Берцы', emoji: '👢', slot: 'boots', buff: { speed: 5 }, rarity: 'common' },
    boots_tactical: { name: 'Тактические ботинки', emoji: '🥾', slot: 'boots', buff: { speed: 10, defense: 2 }, rarity: 'uncommon' },
    boots_elite: { name: 'Элитные берцы', emoji: '👟', slot: 'boots', buff: { speed: 15, defense: 3 }, rarity: 'rare' },
    // Расходники
    grenade: { name: 'Граната', emoji: '💣', slot: null, buff: { damage: 10 }, rarity: 'common' },
    medkit: { name: 'Аптечка', emoji: '🩹', slot: null, buff: { heal: 20 }, rarity: 'common' },
    crate: { name: 'Ящик с припасами', emoji: '📦', slot: null, buff: {}, rarity: 'crate' }
};

let gameState = {
    locations: {
        donetsk: { name: 'Донецк', control: 'russia', rusPower: 95, ukrPower: 5, buildings: ['base', 'hospital', 'warehouse'] },
        lugansk: { name: 'Луганск', control: 'russia', rusPower: 92, ukrPower: 8, buildings: ['barrack', 'checkpoint'] },
        mariupol: { name: 'Мариуполь', control: 'russia', rusPower: 85, ukrPower: 15, buildings: ['checkpoint', 'warehouse'] },
        kharkiv: { name: 'Харьков', control: 'ukraine', rusPower: 10, ukrPower: 90, buildings: ['base', 'hospital', 'warehouse'] },
        kherson: { name: 'Херсон', control: 'ukraine', rusPower: 8, ukrPower: 92, buildings: ['barrack', 'checkpoint'] },
        bakhmut: { name: 'Бахмут', control: 'contested', rusPower: 45, ukrPower: 55, buildings: ['checkpoint'] },
        avdeevka: { name: 'Авдеевка', control: 'contested', rusPower: 60, ukrPower: 40, buildings: ['checkpoint'] },
        soledar: { name: 'Соледар', control: 'russia', rusPower: 75, ukrPower: 25, buildings: ['checkpoint'] },
        ugledar: { name: 'Угледар', control: 'contested', rusPower: 50, ukrPower: 50, buildings: ['barrack'] },
        zaporozhye: { name: 'Запорожье', control: 'contested', rusPower: 40, ukrPower: 60, buildings: ['checkpoint', 'warehouse'] },
        kramatorsk: { name: 'Краматорск', control: 'ukraine', rusPower: 15, ukrPower: 85, buildings: ['barrack'] },
        gorlovka: { name: 'Горловка', control: 'russia', rusPower: 80, ukrPower: 20, buildings: ['checkpoint'] },
        izyum: { name: 'Изюм', control: 'contested', rusPower: 35, ukrPower: 65, buildings: [] },
        tokmak: { name: 'Токмак', control: 'contested', rusPower: 55, ukrPower: 45, buildings: ['warehouse'] },
        kupiansk: { name: 'Купянск', control: 'contested', rusPower: 30, ukrPower: 70, buildings: ['checkpoint'] }
    },
    players: {},
    squads: {},
    orders: {},
    captureProgress: {},
    factionChat: { russia: [], ukraine: [] }
};

// ========== СОХРАНЕНИЕ ==========
function saveGame() {
    try {
        const saveData = {
            locations: gameState.locations,
            players: gameState.players,
            squads: gameState.squads,
            orders: gameState.orders,
            factionChat: gameState.factionChat
        };
        fs.writeFileSync(SAVE_FILE, JSON.stringify(saveData, null, 2));
    } catch (e) {
        console.error('Ошибка сохранения:', e.message);
    }
}

function loadGame() {
    try {
        if (fs.existsSync(SAVE_FILE)) {
            const data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
            if (data.locations) gameState.locations = { ...gameState.locations, ...data.locations };
            if (data.players) gameState.players = data.players;
            if (data.squads) gameState.squads = data.squads;
            if (data.orders) gameState.orders = data.orders;
            if (data.factionChat) gameState.factionChat = data.factionChat;
            console.log('✅ Сохранение загружено. Игроков:', Object.keys(gameState.players).length);
        }
    } catch (e) {
        console.log('⚠️ Не удалось загрузить сохранение:', e.message);
    }
}

// Автосохранение каждые 5 минут
setInterval(saveGame, 300000);

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
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

function getLocationBonus(locationId) {
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

function calculateMaxHP(player) {
    const killsBonus = Math.floor((player.kills || 0) / 5) * 10;
    const rankBonus = { 'Рядовой': 0, 'Ефрейтор': 10, 'Сержант': 20, 'Лейтенант': 35, 'Капитан': 50 };
    return 100 + killsBonus + (rankBonus[player.rank] || 0);
}

function updateRank(player) {
    const kills = player.kills || 0;
    if (kills >= 20) player.rank = 'Капитан';
    else if (kills >= 12) player.rank = 'Лейтенант';
    else if (kills >= 7) player.rank = 'Сержант';
    else if (kills >= 3) player.rank = 'Ефрейтор';
    else player.rank = 'Рядовой';
}

function getEquipBonuses(player) {
    const inv = player.inventory;
    if (!inv || !inv.equipment) return { defense: 0, damage: 0, accuracy: 0, speed: 0, heal: 0 };
    const bonuses = { defense: 0, damage: 0, accuracy: 0, speed: 0, heal: 0 };
    Object.values(inv.equipment).forEach(itemId => {
        if (itemId && ITEMS[itemId]) {
            const buff = ITEMS[itemId].buff;
            if (buff.defense) bonuses.defense += buff.defense;
            if (buff.damage) bonuses.damage += buff.damage;
            if (buff.accuracy) bonuses.accuracy += buff.accuracy;
            if (buff.speed) bonuses.speed += buff.speed;
            if (buff.heal) bonuses.heal += buff.heal;
        }
    });
    return bonuses;
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
        supplies: charClass === 'medic' ? 5 : 0,
        inventory: { items: Array(16).fill(null), equipment: { helmet: null, weapon: null, armor: null, boots: null } }
    };
    
    gameState.players[playerId] = player;
    if (!gameState.squads[unitId]) gameState.squads[unitId] = [];
    gameState.squads[unitId].push(playerId);
    
    const unit = UNITS[faction][unitId];
    let greeting = `${unit.commanderName}: Боец ${name}, прибыл в "${unit.name}".`;
    try { greeting = await askMistral('Ты военный командир.', `Приветствие бойцу ${name}. 1 предложение.`); } catch (e) {}
    
    saveGame();
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
        supplies: charClass === 'medic' ? 5 : 0,
        inventory: { items: Array(16).fill(null), equipment: { helmet: null, weapon: null, armor: null, boots: null } }
    };
    
    gameState.players[newPlayerId] = player;
    saveGame();
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
    const bonuses = getLocationBonus(player.location);
    const equipBonuses = getEquipBonuses(player);
    const counts = countPlayersOnLocation(player.location);
    
    // Пассивное лечение от госпиталя
    if (bonuses.heal > 0 && player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + bonuses.heal);
    }
    
    // Лечение медика
    if ((action.toLowerCase().includes('лечу') || action.toLowerCase().includes('лечить')) && player.class === 'medic') {
        const healBonus = equipBonuses.heal;
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
        const heal = Math.min(25 + healBonus, target.maxHp - target.hp);
        target.hp += heal;
        player.supplies--;
        saveGame();
        return res.json({ 
            narrative: `💉 ${player.name} вылечил ${target.name} (+${heal} HP).`,
            gameUpdate: { playerChanges: { supplies: player.supplies }, systemMessage: `${target.name} +${heal} HP` }
        });
    }
    
    // Пополнение на складе
    if ((action.toLowerCase().includes('пополн') || action.toLowerCase().includes('склад')) && bonuses.supplies) {
        player.supplies = 5;
        saveGame();
        return res.json({ narrative: '📦 Пополнил припасы на складе.', gameUpdate: { playerChanges: { supplies: 5 } } });
    }
    
    const totalDefense = bonuses.defense + equipBonuses.defense;
    const totalAccuracy = equipBonuses.accuracy;
    const totalDamage = equipBonuses.damage;
    
    const systemPrompt = `Ты AI-Мастер WarZone. Отвечай СТРОГО JSON: {"narrative":"...","rusPower":ЧИСЛО,"ukrPower":ЧИСЛО,"playerHp":ЧИСЛО,"enemyHp":ЧИСЛО,"systemMessage":"..."}. Атака меняет контроль на 5-20%. При 70% контроль переходит.`;
    const userPrompt = `Игрок: ${player.name} (${player.faction}, HP:${player.hp}/${player.maxHp}, Ранг:${player.rank}). Локация: ${loc.name} (РФ:${loc.rusPower}%/ВСУ:${loc.ukrPower}%). Экипировка: защита+${totalDefense}, урон+${totalDamage}, точность+${totalAccuracy}. Действие: "${action}"`;
    
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
            // Защита от экипировки и КПП
            if (totalDefense > 0 && hp < player.hp) {
                hp = player.hp - Math.floor((player.hp - hp) * Math.max(0.5, 1 - totalDefense * 0.01));
            }
            
            player.hp = Math.max(0, Math.min(player.maxHp, hp));
            
            // Убийство врага
            if (p.enemyHp && p.enemyHp <= 0) {
                player.kills = (player.kills || 0) + 1;
                player.xp = (player.xp || 0) + 10 + totalDamage;
                updateRank(player);
                player.maxHp = calculateMaxHP(player);
            }
            
            // Сохраняем старый контроль для проверки захвата
            const oldControl = loc.control;
            
            if (p.rusPower != null) loc.rusPower = Math.max(0, Math.min(100, p.rusPower));
            if (p.ukrPower != null) loc.ukrPower = Math.max(0, Math.min(100, p.ukrPower));
            
            if (loc.rusPower >= 70) loc.control = 'russia';
            else if (loc.ukrPower >= 70) loc.control = 'ukraine';
            else loc.control = 'contested';
            
            // Ящик за захват точки
            let crateAwarded = false;
            if (oldControl !== loc.control && loc.control === player.faction && player.faction === 'russia' && oldControl !== 'russia') {
                crateAwarded = true;
            }
            if (oldControl !== loc.control && loc.control === player.faction && player.faction === 'ukraine' && oldControl !== 'ukraine') {
                crateAwarded = true;
            }
            
            // СМЕРТЬ
            if (player.hp <= 0) {
                player.alive = false;
                player.deaths = (player.deaths || 0) + 1;
                player.location = null;
                saveGame();
                return res.json({
                    narrative: `💀 ${player.name} пал в бою! Убийств: ${player.kills}, Ранг: ${player.rank}.`,
                    gameUpdate: { 
                        playerChanges: { hp: 0, alive: false },
                        systemMessage: `${player.name} погиб.`
                    }
                });
            }
            
            saveGame();
            res.json({
                narrative: p.narrative,
                gameUpdate: {
                    playerChanges: { hp: player.hp, kills: player.kills, rank: player.rank, maxHp: player.maxHp, xp: player.xp, supplies: player.supplies },
                    locationChanges: { rusPower: loc.rusPower, ukrPower: loc.ukrPower },
                    systemMessage: (p.systemMessage || '') + (crateAwarded ? ' 📦 Получен ящик за захват точки!' : ''),
                    crateAwarded
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

// Открыть ящик
app.post('/api/open-crate', (req, res) => {
    const { playerId } = req.body;
    const player = gameState.players[playerId];
    if (!player || !player.alive) return res.json({ error: 'Игрок не найден' });
    
    const inv = player.inventory;
    const crateIndex = inv.items.findIndex(i => i === 'crate');
    if (crateIndex === -1) return res.json({ error: 'Нет ящиков в инвентаре' });
    
    // Список возможных предметов (кроме ящиков)
    const lootPool = Object.keys(ITEMS).filter(k => ITEMS[k].rarity !== 'crate');
    const randomKey = lootPool[Math.floor(Math.random() * lootPool.length)];
    const item = ITEMS[randomKey];
    
    // Убираем ящик, добавляем предмет
    inv.items[crateIndex] = randomKey;
    
    saveGame();
    res.json({ 
        success: true, 
        item: { id: randomKey, ...item },
        message: `📦 Открыт ящик! Получено: ${item.emoji} ${item.name} (${item.rarity})`
    });
});

// Продать предмет
app.post('/api/sell-item', (req, res) => {
    const { playerId, itemIndex } = req.body;
    const player = gameState.players[playerId];
    if (!player || !player.alive) return res.json({ error: 'Игрок не найден' });
    
    const inv = player.inventory;
    const itemId = inv.items[itemIndex];
    if (!itemId || !ITEMS[itemId]) return res.json({ error: 'Предмет не найден' });
    
    const item = ITEMS[itemId];
    let xpGain = 5;
    if (item.rarity === 'uncommon') xpGain = 15;
    else if (item.rarity === 'rare') xpGain = 35;
    else if (item.rarity === 'crate') xpGain = 2;
    
    inv.items[itemIndex] = null;
    player.xp = (player.xp || 0) + xpGain;
    
    saveGame();
    res.json({ 
        success: true, 
        xpGain,
        message: `💰 Продан ${item.emoji} ${item.name} за ${xpGain} XP. Всего XP: ${player.xp}`
    });
});

// Экипировать предмет
app.post('/api/equip-item', (req, res) => {
    const { playerId, itemIndex } = req.body;
    const player = gameState.players[playerId];
    if (!player || !player.alive) return res.json({ error: 'Игрок не найден' });
    
    const inv = player.inventory;
    const itemId = inv.items[itemIndex];
    if (!itemId || !ITEMS[itemId]) return res.json({ error: 'Предмет не найден' });
    if (ITEMS[itemId].rarity === 'crate') return res.json({ error: 'Ящик надо открыть сначала!' });
    
    const slot = ITEMS[itemId].slot;
    if (!slot) return res.json({ error: 'Этот предмет нельзя экипировать (расходник). Используй в бою.' });
    
    const oldItem = inv.equipment[slot];
    inv.equipment[slot] = itemId;
    inv.items[itemIndex] = oldItem;
    
    saveGame();
    res.json({ 
        success: true, 
        equipped: { slot, item: { id: itemId, ...ITEMS[itemId] } },
        message: `✅ ${ITEMS[itemId].emoji} ${ITEMS[itemId].name} экипирован в слот ${slot}`
    });
});

// Снять предмет
app.post('/api/unequip-item', (req, res) => {
    const { playerId, slot } = req.body;
    const player = gameState.players[playerId];
    if (!player || !player.alive) return res.json({ error: 'Игрок не найден' });
    
    const inv = player.inventory;
    const itemId = inv.equipment[slot];
    if (!itemId) return res.json({ error: 'Слот пуст' });
    
    const freeIndex = inv.items.findIndex(i => i === null);
    if (freeIndex === -1) return res.json({ error: 'Нет места в инвентаре' });
    
    inv.items[freeIndex] = itemId;
    inv.equipment[slot] = null;
    
    saveGame();
    res.json({ success: true, message: `Снято: ${ITEMS[itemId].emoji} ${ITEMS[itemId].name}` });
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
        return res.json({ success: false, error: `Враг контролирует ${newLoc.name} на ${enemyPower}%.` });
    }
    
    const equipBonuses = getEquipBonuses(player);
    let damage = 0;
    if (enemyPower >= 50) damage = Math.random() < 0.4 ? Math.floor(Math.random() * 20) + 10 : 0;
    else if (enemyPower >= 30) damage = Math.random() < 0.2 ? Math.floor(Math.random() * 15) + 5 : 0;
    
    // Бонус скорости уменьшает урон от обстрела
    if (equipBonuses.speed > 0 && damage > 0) {
        damage = Math.max(0, damage - Math.floor(equipBonuses.speed * 0.5));
    }
    
    const oldLoc = gameState.locations[player.location];
    player.location = location;
    if (damage > 0) player.hp = Math.max(0, player.hp - damage);
    
    if (player.hp <= 0) {
        player.alive = false;
        player.location = null;
        player.deaths = (player.deaths || 0) + 1;
        saveGame();
        return res.json({ success: false, error: `💀 ${player.name} погиб при обстреле!`, player });
    }
    
    saveGame();
    res.json({ 
        success: true, player, 
        message: `${player.name} → ${newLoc.name}${damage > 0 ? ` (обстрел! -${damage} HP)` : ''}`,
        damage 
    });
});

// Чат фракции
app.post('/api/faction-chat', (req, res) => {
    const { playerId, message } = req.body;
    const player = gameState.players[playerId];
    if (!player || !player.alive) return res.json({ error: 'Нельзя отправить' });
    
    gameState.factionChat[player.faction].push({
        id: Date.now(),
        playerName: player.name,
        unit: UNITS[player.faction][player.unit]?.emblem || '',
        message: message.substring(0, 200),
        timestamp: Date.now()
    });
    if (gameState.factionChat[player.faction].length > 50) gameState.factionChat[player.faction].shift();
    saveGame();
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
        const order = await askMistral(`Ты командир "${unit.name}" ${unit.emblem}.`, `Боец ${player.name} (${player.class}, HP:${player.hp}/${player.maxHp}) в ${loc?.name}. Отдай приказ.`);
        gameState.orders[player.id] = { text: order, from: unit.commanderName, timestamp: Date.now() };
        res.json({ order, commanderName: unit.commanderName, unitEmblem: unit.emblem });
    } catch (e) {
        res.json({ order: 'Держать позицию.', commanderName: unit.commanderName, unitEmblem: unit.emblem });
    }
});

// Состояние
app.get('/api/state', (req, res) => {
    const lc = {};
    Object.entries(gameState.locations).forEach(([id, loc]) => {
        lc[id] = { russia: loc.rusPower, ukraine: loc.ukrPower, control: loc.control, buildings: loc.buildings };
    });
    res.json({ locations: gameState.locations, players: gameState.players, locationControl: lc, squads: gameState.squads });
});

app.get('/api/player/:playerId', (req, res) => {
    const p = gameState.players[req.params.playerId];
    if (p && p.alive) res.json({ player: p }); 
    else res.json({ error: 'Не найден или мёртв' });
});

// ========== ПАССИВНОЕ ПАДЕНИЕ ==========
setInterval(() => {
    Object.entries(gameState.locations).forEach(([locId, loc]) => {
        const counts = countPlayersOnLocation(locId);
        if (counts.rus === 0) loc.rusPower = Math.max(0, loc.rusPower - 3);
        if (counts.ukr === 0) loc.ukrPower = Math.max(0, loc.ukrPower - 3);
        if (loc.rusPower >= 70) loc.control = 'russia';
        else if (loc.ukrPower >= 70) loc.control = 'ukraine';
        else loc.control = 'contested';
    });
    saveGame();
}, 900000);

// Очистка мёртвых игроков (каждый час)
setInterval(() => {
    let changed = false;
    Object.entries(gameState.players).forEach(([id, player]) => {
        if (!player.alive && Date.now() - (player.lastAction || 0) > 3600000) {
            delete gameState.players[id];
            changed = true;
        }
    });
    if (changed) saveGame();
}, 3600000);

// ========== ЗАПУСК ==========
loadGame();
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`WarZone 3.0 на порту ${PORT}`));
