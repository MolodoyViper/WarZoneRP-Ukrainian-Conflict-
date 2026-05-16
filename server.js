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

// Баффы классов
const CLASS_BUFFS = {
    rifleman: { name: 'Стрелок', buff: 'survivability', buffValue: 15, desc: '+15% к выживаемости (меньше шанс ранения)' },
    sniper: { name: 'Снайпер', buff: 'accuracy', buffValue: 20, desc: '+20% к точности (больше урона врагу)' },
    medic: { name: 'Медик', buff: 'heal', buffValue: 25, desc: 'Может лечить союзников (+25 HP). Медикаменты: ' },
    engineer: { name: 'Инженер', buff: 'sabotage', buffValue: 15, desc: '+15% к эффективности укреплений и подрывов' },
    commander: { name: 'Командир', buff: 'morale', buffValue: 10, desc: '+10% к эффективности всех союзников на точке' }
};

// Состояние игры
let gameState = {
    locations: {
        bakhmut: { name: 'Бахмут', x: 390, y: 255, control: 'contested', rusPower: 45, ukrPower: 55, captureStage: null, defenders: 0 },
        avdeevka: { name: 'Авдеевка', x: 365, y: 280, control: 'contested', rusPower: 60, ukrPower: 40, captureStage: null, defenders: 0 },
        kherson: { name: 'Херсон', x: 240, y: 335, control: 'ukraine', rusPower: 8, ukrPower: 92, captureStage: null, defenders: 0 },
        donetsk: { name: 'Донецк', x: 430, y: 305, control: 'russia', rusPower: 95, ukrPower: 5, captureStage: null, defenders: 0 },
        lugansk: { name: 'Луганск', x: 490, y: 215, control: 'russia', rusPower: 92, ukrPower: 8, captureStage: null, defenders: 0 },
        zaporozhye: { name: 'Запорожье', x: 285, y: 285, control: 'contested', rusPower: 40, ukrPower: 60, captureStage: null, defenders: 0 },
        kharkiv: { name: 'Харьков', x: 435, y: 170, control: 'ukraine', rusPower: 10, ukrPower: 90, captureStage: null, defenders: 0 },
        mariupol: { name: 'Мариуполь', x: 445, y: 350, control: 'russia', rusPower: 85, ukrPower: 15, captureStage: null, defenders: 0 },
        soledar: { name: 'Соледар', x: 410, y: 235, control: 'russia', rusPower: 75, ukrPower: 25, captureStage: null, defenders: 0 },
        ugledar: { name: 'Угледар', x: 405, y: 320, control: 'contested', rusPower: 50, ukrPower: 50, captureStage: null, defenders: 0 }
    },
    players: {},
    squads: {},
    orders: {},
    captureProgress: {} // Прогресс захвата по точкам
};

// Запрос к Mistral
async function askMistral(systemPrompt, userPrompt) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.9, max_tokens: 300
        })
    });
    if (!response.ok) throw new Error(`Mistral API error: ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content;
}

// Подсчёт игроков на точке
function countPlayersOnLocation(locationId) {
    let rus = 0, ukr = 0;
    const players = [];
    Object.values(gameState.players).forEach(p => {
        if (p.alive && p.location === locationId) {
            if (p.faction === 'russia') rus++;
            else ukr++;
            players.push(p);
        }
    });
    return { rus, ukr, total: rus + ukr, players };
}

// Проверка условий захвата
function canCapture(locationId, faction) {
    const loc = gameState.locations[locationId];
    const counts = countPlayersOnLocation(locationId);
    const enemyControl = faction === 'russia' ? loc.ukrPower : loc.rusPower;
    
    // Условия захвата вражеской точки:
    // 1. Вражеский контроль > 70%
    // 2. Минимум 2 игрока атакующей фракции
    // 3. Нет активной стадии захвата или прошло > 5 минут
    if (enemyControl < 70) return { can: false, reason: 'Недостаточный вражеский контроль' };
    
    const attackers = faction === 'russia' ? counts.rus : counts.ukr;
    if (attackers < 2) return { can: false, reason: 'Нужно минимум 2 бойца для захвата' };
    
    if (gameState.captureProgress[locationId]) {
        const cp = gameState.captureProgress[locationId];
        if (cp.faction === faction && Date.now() - cp.startTime < 300000) {
            return { can: true, stage: cp.stage, progress: cp };
        }
    }
    
    return { can: true, stage: 'recon' };
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
        supplies: charClass === 'medic' ? 5 : 0 // Медикаменты для медика
    };

    gameState.players[playerId] = player;
    if (!gameState.squads[unitId]) gameState.squads[unitId] = [];
    gameState.squads[unitId].push(playerId);

    const unit = UNITS[faction][unitId];
    let greeting = `${unit.commanderName}: Боец ${name}, прибыл в "${unit.name}". Занять позицию.`;
    try {
        greeting = await askMistral('Ты военный командир. Отвечай коротко, по-военному.',
            `Поприветствуй бойца ${name} (${charClass}). Командир "${unit.name}" ${unit.emblem}, стиль: ${unit.commanderStyle}. 1 предложение.`);
    } catch (e) {}

    res.json({ player, greeting, unit: { name: unit.name, emblem: unit.emblem, commanderName: unit.commanderName } });
});

// Действие
app.post('/api/action', async (req, res) => {
    const { playerId, action } = req.body;
    const player = gameState.players[playerId];
    if (!player || !player.alive) return res.json({ error: 'Игрок не найден или мёртв' });

    const loc = gameState.locations[player.location];
    const counts = countPlayersOnLocation(player.location);
    const buff = CLASS_BUFFS[player.class];

    // Проверка: это лечение?
    const isHeal = action.toLowerCase().includes('лечу') || action.toLowerCase().includes('лечить') || action.toLowerCase().includes('медик');

    if (isHeal && player.class === 'medic') {
        // Поиск раненого союзника на точке
        const wounded = Object.values(gameState.players).filter(p =>
            p.alive && p.id !== player.id && p.faction === player.faction && p.location === player.location && p.hp < 80
        );
        
        if (wounded.length === 0) {
            return res.json({ narrative: 'Нет раненых союзников поблизости.', gameUpdate: {} });
        }
        
        if (player.supplies <= 0) {
            return res.json({ narrative: '❌ Нет медикаментов! Отойди в тыловую точку для пополнения.', gameUpdate: {} });
        }

        const target = wounded[Math.floor(Math.random() * wounded.length)];
        const healAmount = Math.min(25, 100 - target.hp);
        target.hp += healAmount;
        player.supplies--;
        
        return res.json({
            narrative: `💉 ${player.name} перевязал раны бойцу ${target.name} (+${healAmount} HP). Осталось медикаментов: ${player.supplies}`,
            gameUpdate: {
                playerChanges: { supplies: player.supplies },
                systemMessage: `${target.name} вылечен на ${healAmount} HP`
            }
        });
    }

    // Пополнение медикаментов в тыловой точке
    const isResupply = action.toLowerCase().includes('пополн') || action.toLowerCase().includes('склад');
    if (isResupply && player.class === 'medic') {
        const isSafeZone = (player.faction === 'russia' && ['donetsk','lugansk'].includes(player.location)) ||
                           (player.faction === 'ukraine' && ['kharkiv','kherson'].includes(player.location));
        if (isSafeZone) {
            player.supplies = 5;
            return res.json({
                narrative: '📦 Пополнил медикаменты на складе (5 шт).',
                gameUpdate: { playerChanges: { supplies: 5 } }
            });
        }
    }

    // Проверка на захват вражеской точки
    const isCapture = action.toLowerCase().includes('захват') || action.toLowerCase().includes('штурм');
    let captureInfo = '';
    if (isCapture) {
        const captureCheck = canCapture(player.location, player.faction);
        if (captureCheck.can) {
            if (!gameState.captureProgress[player.location]) {
                gameState.captureProgress[player.location] = {
                    faction: player.faction,
                    stage: 'recon',
                    startTime: Date.now(),
                    reconDone: false,
                    suppressDone: false
                };
            }
            const cp = gameState.captureProgress[player.location];
            
            if (cp.stage === 'recon' && !cp.reconDone) {
                cp.reconDone = true;
                cp.stage = 'suppress';
                captureInfo = '🔭 Разведка завершена! Следующий этап: подавление (нужен снайпер или стрелок).';
            } else if (cp.stage === 'suppress' && (player.class === 'sniper' || player.class === 'rifleman')) {
                cp.suppressDone = true;
                cp.stage = 'assault';
                captureInfo = '🎯 Подавление успешно! Финальный этап: штурм всеми силами!';
            } else if (cp.stage === 'assault') {
                // Штурм: быстрое изменение контроля
                const change = 15 + (counts.rus + counts.ukr) * 3;
                if (player.faction === 'russia') {
                    loc.rusPower = Math.min(95, loc.rusPower + change);
                    loc.ukrPower = Math.max(5, loc.ukrPower - change);
                } else {
                    loc.ukrPower = Math.min(95, loc.ukrPower + change);
                    loc.rusPower = Math.max(5, loc.rusPower - change);
                }
                if (loc.rusPower >= 70) loc.control = 'russia';
                else if (loc.ukrPower >= 70) loc.control = 'ukraine';
                
                delete gameState.captureProgress[player.location];
                captureInfo = `🏴 ${loc.name} захвачен! Контроль перешёл к ${player.faction === 'russia' ? 'ВС РФ' : 'ВСУ'}!`;
            }
        } else {
            captureInfo = `❌ ${captureCheck.reason}`;
        }
    }

    // Бафф от класса
    let buffEffect = '';
    const buffBonus = buff.buffValue;
    if (buff.buff === 'survivability') buffEffect = ' (повышенная выживаемость)';
    else if (buff.buff === 'accuracy') buffEffect = ' (повышенная точность)';
    else if (buff.buff === 'morale') buffEffect = ' (мораль подразделения повышена)';
    else if (buff.buff === 'sabotage') buffEffect = ' (инженерная подготовка)';

    const systemPrompt = `Ты AI-Мастер WarZone. Отвечай СТРОГО JSON без лишнего текста.
Механика: атака меняет контроль на 5-20%. Шанс ранения 30% (10-25 урона), но класс ${buff.name} даёт ${buffEffect}.
При 70%+ контроль переходит фракции.
Формат: {"narrative":"описание","rusPower":число,"ukrPower":число,"playerHp":число,"systemMessage":"..."}`;

    const userPrompt = `Игрок: ${player.name} (${player.faction}, ${UNITS[player.faction][player.unit].name}, ${buff.name}, HP:${player.hp})
Локация: ${loc.name} (РФ:${loc.rusPower}%/ВСУ:${loc.ukrPower}%)
Союзников: ${player.faction==='russia'?counts.rus:counts.ukr}, Врагов: ${player.faction==='russia'?counts.ukr:counts.rus}
Действие: "${action}" ${captureInfo}
Опиши результат. ${buff.buff==='survivability'?'Шанс ранения снижен на 15%.':''} ${buff.buff==='accuracy'?'Урон по врагу увеличен на 20%.':''}`;

    try {
        const aiText = await askMistral(systemPrompt, userPrompt);
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Применяем бафф выживаемости
            let newHp = parsed.playerHp || player.hp;
            if (buff.buff === 'survivability' && newHp < player.hp) {
                newHp = player.hp - Math.floor((player.hp - newHp) * 0.85);
            }
            player.hp = newHp;
            
            if (parsed.rusPower) loc.rusPower = parsed.rusPower;
            if (parsed.ukrPower) loc.ukrPower = parsed.ukrPower;
            
            if (loc.rusPower >= 70) loc.control = 'russia';
            else if (loc.ukrPower >= 70) loc.control = 'ukraine';
            else loc.control = 'contested';
            
            if (player.hp <= 0) player.alive = false;
            
            let sysMsg = parsed.systemMessage || '';
            if (captureInfo) sysMsg += ' ' + captureInfo;
            
            res.json({
                narrative: parsed.narrative,
                gameUpdate: {
                    playerChanges: { hp: player.hp, supplies: player.supplies },
                    locationChanges: { rusPower: loc.rusPower, ukrPower: loc.ukrPower },
                    systemMessage: sysMsg
                }
            });
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

    const oldLoc = gameState.locations[player.location];
    player.location = location;
    res.json({ success: true, player, message: `${player.name} переместился из ${oldLoc.name} в ${gameState.locations[location].name}` });
});

// Приказ командира
app.get('/api/commander/:playerId', async (req, res) => {
    const player = gameState.players[req.params.playerId];
    if (!player) return res.json({ order: 'Игрок не найден.' });
    const unit = UNITS[player.faction][player.unit];
    const loc = gameState.locations[player.location];
    try {
        const order = await askMistral(`Ты командир "${unit.name}" ${unit.emblem}, позывной ${unit.commanderName}. Стиль: ${unit.commanderStyle}. Отвечай коротко.`,
            `Боец ${player.name} (${player.class}, HP:${player.hp}) в ${loc.name} (РФ:${loc.rusPower}%/ВСУ:${loc.ukrPower}%). Отдай приказ.`);
        gameState.orders[player.id] = { text: order, from: unit.commanderName, timestamp: Date.now() };
        res.json({ order, commanderName: unit.commanderName, unitEmblem: unit.emblem });
    } catch (e) {
        res.json({ order: 'Держать позицию.', commanderName: unit.commanderName, unitEmblem: unit.emblem });
    }
});

// Состояние
app.get('/api/state', (req, res) => {
    const locationControl = {};
    Object.entries(gameState.locations).forEach(([id, loc]) => {
        locationControl[id] = { russia: loc.rusPower, ukraine: loc.ukrPower, control: loc.control };
    });
    res.json({ locations: gameState.locations, players: gameState.players, locationControl, squads: gameState.squads, captureProgress: gameState.captureProgress });
});

// Восстановление игрока по ID
app.get('/api/player/:playerId', (req, res) => {
    const player = gameState.players[req.params.playerId];
    if (player && player.alive) res.json({ player });
    else res.json({ error: 'Игрок не найден или мёртв' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`WarZone running on port ${PORT}`));