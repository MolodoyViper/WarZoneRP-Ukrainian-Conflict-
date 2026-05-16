const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DEEPSEEK_API_KEY = 'sk-3204536d154640498d8cfbd38a8fd5f3'; // ЗАМЕНИ!

// ========== ПОДРАЗДЕЛЕНИЯ ==========
const UNITS = {
    russia: {
        somali: {
            name: 'Сомали',
            emblem: '🦂',
            color: '#cc2222',
            description: 'Штурмовая пехота. Девиз: "Вперёд, за Донбасс!"',
            commanderName: 'Михалыч',
            commanderStyle: 'Жёсткий, тактический, с матом'
        },
        pyatnashka: {
            name: 'Пятнашка',
            emblem: '1️⃣5️⃣',
            color: '#dd4444',
            description: 'Интернациональная бригада. Девиз: "Свобода или смерть!"',
            commanderName: 'Абхаз',
            commanderStyle: 'Спокойный, расчётливый, кавказский акцент'
        },
        sparta: {
            name: 'Спарта',
            emblem: '⚔️',
            color: '#aa3333',
            description: 'Разведбат. Девиз: "Со щитом или на щите!"',
            commanderName: 'Спартанец',
            commanderStyle: 'Лаконичный, по-военному чётко'
        },
        wolves: {
            name: 'Волки',
            emblem: '🐺',
            color: '#883333',
            description: 'Спецназ ГРУ. Девиз: "Ночью мы — тень"',
            commanderName: 'Вожак',
            commanderStyle: 'Таинственный, профессионал'
        }
    },
    ukraine: {
        azov: {
            name: 'Азов',
            emblem: '🔱',
            color: '#2244cc',
            description: 'Штурмовая бригада. Девиз: "Сталь і воля!"',
            commanderName: 'Рэйд',
            commanderStyle: 'Энергичный, агрессивный, тактик'
        },
        aidar: {
            name: 'Айдар',
            emblem: '⚔️',
            color: '#3355dd',
            description: 'Добровольческий батальон. Девиз: "За волю!"',
            commanderName: 'Дiд',
            commanderStyle: 'Отеческий, с юмором, бывалый'
        },
        kraken: {
            name: 'Кракен',
            emblem: '🐙',
            color: '#4466ee',
            description: 'Разведывательно-диверсионное. Девиз: "З глибини!"',
            commanderName: 'Ктулху',
            commanderStyle: 'Загадочный, дерзкий'
        },
        ghost: {
            name: 'Призрак',
            emblem: '💀',
            color: '#5577ff',
            description: 'Снайперская группа. Девиз: "Один выстрел — один..."',
            commanderName: 'Тень',
            commanderStyle: 'Молчаливый, смертоносный'
        }
    }
};

// ========== МАТРЁШКА ЛОКАЦИЙ ==========
const LOCATIONS = {
    bakhmut: {
        name: 'Бахмут (Артёмовск)',
        x: 420, y: 280,
        districts: {
            north: {
                name: 'Северный район',
                positions: {
                    trench_mole: {
                        name: 'Окоп "Крот"',
                        slots: ['pos_1', 'pos_2', 'pos_3', 'pos_4'],
                        control: { russia: 50, ukraine: 50 }
                    },
                    factory_azom: {
                        name: 'Завод АЗОМ',
                        slots: ['цех_1', 'цех_2', 'цех_3'],
                        control: { russia: 60, ukraine: 40 }
                    }
                }
            },
            center: {
                name: 'Центр',
                positions: {
                    highrise_candle: {
                        name: 'Многоэтажка "Свiчка"',
                        slots: ['этаж_1', 'этаж_2', 'этаж_3', 'этаж_4', 'этаж_5'],
                        control: { russia: 40, ukraine: 60 }
                    },
                    basement_catacombs: {
                        name: 'Подвал "Катакомбы"',
                        slots: ['туннель_А', 'туннель_Б', 'бункер'],
                        control: { russia: 55, ukraine: 45 }
                    }
                }
            },
            south: {
                name: 'Южный район',
                positions: {
                    railway: {
                        name: 'Ж/Д станция',
                        slots: ['платформа_1', 'платформа_2'],
                        control: { russia: 45, ukraine: 55 }
                    },
                    private_sector: {
                        name: 'Частный сектор',
                        slots: ['дом_1', 'дом_2', 'дом_3'],
                        control: { russia: 30, ukraine: 70 }
                    }
                }
            }
        }
    }
    // ... остальные локации аналогично
};

// ========== ИГРОВОЕ СОСТОЯНИЕ ==========
let gameState = {
    locations: LOCATIONS,
    players: {},
    squads: {},  // группы по подразделениям
    orders: {},  // активные приказы
    battleLog: []
};

// ========== AI-КОМАНДИР (отдаёт приказы) ==========
async function getCommanderOrder(unitId, faction, situation) {
    const unit = UNITS[faction][unitId];
    
    const prompt = `Ты — командир подразделения "${unit.name}" (${unit.description}).
Твой позывной: ${unit.commanderName}.
Твой стиль: ${unit.commanderStyle}.

ТЕКУЩАЯ СИТУАЦИЯ:
${situation}

ТВОИ БОЙЦЫ:
${Object.values(gameState.players)
    .filter(p => p.unit === unitId && p.alive)
    .map(p => `- ${p.name} [${p.class}] на позиции: ${p.currentSlot || 'не назначен'}, HP:${p.hp}`)
    .join('\n')}

ОТДАЙ ПРИКАЗ (кратко, по-военному):
1. Кому куда выдвинуться
2. Кому атаковать/оборонять
3. Общая тактика

Формат: Короткое сообщение в стиле твоего персонажа.`;

    // Запрос к DeepSeek...
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.9,
            max_tokens: 300
        })
    });
    
    const data = await response.json();
    return data.choices[0].message.content;
}

// ========== ЭНДПОИНТЫ ==========

// Выбор подразделения
app.post('/api/join', (req, res) => {
    const { name, faction, unitId, charClass, look } = req.body;
    const playerId = 'p_' + Date.now();
    
    const startLocation = faction === 'russia' ? 'donetsk' : 'kharkiv';
    const startSlot = faction === 'russia' ? 'pos_1' : 'этаж_5';
    
    const player = {
        id: playerId,
        name,
        faction,
        unit: unitId,
        class: charClass,
        look,
        hp: 100,
        kills: 0,
        location: startLocation,
        district: 'center',
        position: faction === 'russia' ? 'trench_mole' : 'highrise_candle',
        currentSlot: startSlot,
        alive: true,
        rank: 'Рядовой',
        followingOrder: null
    };
    
    gameState.players[playerId] = player;
    
    // Добавляем в отряд
    if (!gameState.squads[unitId]) gameState.squads[unitId] = [];
    gameState.squads[unitId].push(playerId);
    
    // AI-командир приветствует
    const unit = UNITS[faction][unitId];
    const greeting = `Боец ${name}, это командир ${unit.commanderName}. Добро пожаловать в "${unit.name}". Занять позицию ${getPositionFullName(player)}, жди приказов.`;
    
    res.json({ player, greeting, unit: unit });
});

// Получить приказ от командира
app.get('/api/commander/:playerId', async (req, res) => {
    const player = gameState.players[req.params.playerId];
    if (!player) return res.json({ error: 'Игрок не найден' });
    
    const situation = `
Обстановка в ${gameState.locations[player.location].name}:
Район: ${gameState.locations[player.location].districts[player.district].name}
Позиция: ${gameState.locations[player.location].districts[player.district].positions[player.position].name}
Слот: ${player.currentSlot}
Контроль: РФ ${gameState.locations[player.location].districts[player.district].positions[player.position].control.russia}% / ВСУ ${gameState.locations[player.location].districts[player.district].positions[player.position].control.ukraine}%`;

    const order = await getCommanderOrder(player.unit, player.faction, situation);
    
    // Сохраняем приказ
    gameState.orders[player.id] = {
        text: order,
        timestamp: Date.now(),
        from: UNITS[player.faction][player.unit].commanderName
    };
    
    res.json({ order, commanderName: UNITS[player.faction][player.unit].commanderName });
});

// Выполнить действие на позиции
app.post('/api/action', async (req, res) => {
    // ... логика боёв на конкретных слотах позиций
});

// Получить полное имя позиции
function getPositionFullName(player) {
    const loc = gameState.locations[player.location];
    const district = loc.districts[player.district];
    const position = district.positions[player.position];
    return `${loc.name} → ${district.name} → ${position.name} → Слот ${player.currentSlot}`;
}

const PORT = 3000;
app.listen(PORT, () => console.log(`⚔️ WarZone 2.0 на порту ${PORT}`));
// ... (предыдущая часть с юнитами и локациями)

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

// Получить полный путь позиции
function getPositionFullName(player) {
    const loc = gameState.locations[player.location];
    if (!loc) return 'Неизвестно';
    const district = loc.districts[player.district];
    if (!district) return loc.name;
    const position = district.positions[player.position];
    if (!position) return `${loc.name} → ${district.name}`;
    return `${loc.name} → ${district.name} → ${position.name} → Слот ${player.currentSlot}`;
}

// Подсчёт контроля локации
function recalculateControl(locationId, districtId, positionId) {
    const position = gameState.locations[locationId].districts[districtId].positions[positionId];
    const totalSlots = position.slots.length;
    let rusSlots = 0;
    let ukrSlots = 0;
    
    Object.values(gameState.players).forEach(p => {
        if (p.alive && p.location === locationId && 
            p.district === districtId && 
            p.position === positionId) {
            if (p.faction === 'russia') rusSlots++;
            else ukrSlots++;
        }
    });
    
    position.control.russia = Math.round((rusSlots / totalSlots) * 100);
    position.control.ukraine = Math.round((ukrSlots / totalSlots) * 100);
    
    return position.control;
}

// Получить общий контроль по локации
function getLocationControl(locationId) {
    const loc = gameState.locations[locationId];
    let totalRus = 0, totalUkr = 0, count = 0;
    
    Object.values(loc.districts).forEach(district => {
        Object.values(district.positions).forEach(position => {
            totalRus += position.control.russia;
            totalUkr += position.control.ukraine;
            count++;
        });
    });
    
    return {
        russia: Math.round(totalRus / count),
        ukraine: Math.round(totalUkr / count)
    };
}

// ========== ЭНДПОИНТ: Присоединение к игре ==========
app.post('/api/join', async (req, res) => {
    const { name, faction, unitId, charClass, look } = req.body;
    
    if (!name || !faction || !unitId) {
        return res.json({ error: 'Заполни все поля' });
    }
    
    const playerId = 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    
    // Стартовые позиции
    let startLocation, startDistrict, startPosition, startSlot;
    
    if (faction === 'russia') {
        startLocation = 'donetsk';
        startDistrict = 'center';
        startPosition = 'government_building';
        startSlot = 'office_1';
    } else {
        startLocation = 'kharkiv';
        startDistrict = 'center';
        startPosition = 'admin_building';
        startSlot = 'office_3';
    }
    
    const player = {
        id: playerId,
        name,
        faction,
        unit: unitId,
        class: charClass,
        look: look || 'стандартная форма',
        hp: 100,
        kills: 0,
        deaths: 0,
        location: startLocation,
        district: startDistrict,
        position: startPosition,
        currentSlot: startSlot,
        alive: true,
        rank: 'Рядовой',
        followingOrder: null,
        joinedAt: new Date().toISOString()
    };
    
    gameState.players[playerId] = player;
    
    // Добавляем в отряд
    if (!gameState.squads[unitId]) gameState.squads[unitId] = [];
    gameState.squads[unitId].push(playerId);
    
    // Обновляем контроль
    recalculateControl(startLocation, startDistrict, startPosition);
    
    const unit = UNITS[faction][unitId];
    
    // AI-командир приветствует
    let greeting;
    try {
        const prompt = `Ты — командир "${unit.name}" (${unit.description}). Позывной: ${unit.commanderName}. Стиль: ${unit.commanderStyle}.
Новый боец ${name} (${charClass}) прибыл в расположение. Поприветствуй его коротко, по-военному, в своём стиле. 1-2 предложения.`;
        
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.9,
                max_tokens: 150
            })
        });
        
        const data = await response.json();
        greeting = data.choices[0].message.content;
    } catch (e) {
        greeting = `${unit.commanderName}: Боец ${name}, прибыл? Хорошо. Занять позицию, жди приказов.`;
    }
    
    res.json({
        player,
        greeting,
        unit: {
            name: unit.name,
            emblem: unit.emblem,
            commanderName: unit.commanderName
        }
    });
});

// ========== ЭНДПОИНТ: Действие игрока ==========
app.post('/api/action', async (req, res) => {
    const { playerId, action } = req.body;
    const player = gameState.players[playerId];
    
    if (!player || !player.alive) {
        return res.json({ error: 'Игрок не найден или мёртв' });
    }
    
    const loc = gameState.locations[player.location];
    const district = loc.districts[player.district];
    const position = district.positions[player.position];
    
    // Системный промпт для AI
    const systemPrompt = `Ты — AI-Мастер военной RPG "WarZone". Реалистичный, мрачный стиль.

ИГРОК: ${player.name}
ФРАКЦИЯ: ${player.faction === 'russia' ? 'ВС РФ' : 'ВСУ'}
ПОДРАЗДЕЛЕНИЕ: ${UNITS[player.faction][player.unit].name}
КЛАСС: ${player.class}
HP: ${player.hp}
МЕСТОПОЛОЖЕНИЕ: ${getPositionFullName(player)}

ТЕКУЩАЯ ПОЗИЦИЯ:
- Локация: ${loc.name}
- Район: ${district.name}
- Позиция: ${position.name}
- Слот: ${player.currentSlot}
- Контроль: РФ ${position.control.russia}% / ВСУ ${position.control.ukraine}%

СОЮЗНИКИ РЯДОМ:
${Object.values(gameState.players)
    .filter(p => p.alive && p.id !== playerId && p.location === player.location && p.district === player.district)
    .map(p => `- ${p.name} [${p.faction}][${p.unit}] на ${p.position}/${p.currentSlot}`)
    .join('\n') || 'Никого'}

ВРАГИ В ЗОНЕ ВИДИМОСТИ:
${Object.values(gameState.players)
    .filter(p => p.alive && p.faction !== player.faction && p.location === player.location && p.district === player.district)
    .map(p => `- ${p.name} [${p.faction}] на ${p.position}/${p.currentSlot}`)
    .join('\n') || 'Не обнаружены'}

МЕХАНИКА:
- Атака по врагу на том же слоте: шанс попадания 60%, урон 10-30 HP
- Атака по врагу на соседнем слоте: шанс 40%, урон 5-20 HP
- Перемещение между слотами: свободно
- Перемещение между позициями: риск обстрела 20%
- Укрепление: +10% к контролю на слоте
- Разведка: информация о соседних позициях

ОТВЕТ — СТРОГО JSON:
{
    "narrative": "Описание того, что произошло (2-4 предложения, атмосферно, реалистично)",
    "gameUpdate": {
        "playerChanges": {"hp": 85},
        "positionChanges": {"russia": 60, "ukraine": 40},
        "systemMessage": "Серёга ранен, но позиция удержана",
        "enemyHit": {"targetName": "Враг", "damage": 15}
    }
}`;

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: action }
                ],
                temperature: 0.85,
                max_tokens: 500
            })
        });
        
        const data = await response.json();
        const aiText = data.choices[0].message.content;
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Применяем изменения игрока
            if (parsed.gameUpdate?.playerChanges) {
                Object.assign(player, parsed.gameUpdate.playerChanges);
                if (player.hp <= 0) {
                    player.alive = false;
                    player.deaths++;
                    parsed.gameUpdate.systemMessage = 
                        `💀 ${player.name} (${UNITS[player.faction][player.unit].emblem} ${UNITS[player.faction][player.unit].name}) погиб на позиции ${position.name}.`;
                }
            }
            
            // Применяем изменения позиции
            if (parsed.gameUpdate?.positionChanges) {
                position.control.russia = parsed.gameUpdate.positionChanges.russia || position.control.russia;
                position.control.ukraine = parsed.gameUpdate.positionChanges.ukraine || position.control.ukraine;
            }
            
            // Попадание по врагу
            if (parsed.gameUpdate?.enemyHit) {
                const enemy = Object.values(gameState.players).find(
                    p => p.alive && p.name === parsed.gameUpdate.enemyHit.targetName
                );
                if (enemy) {
                    enemy.hp -= parsed.gameUpdate.enemyHit.damage;
                    if (enemy.hp <= 0) {
                        enemy.alive = false;
                        enemy.deaths++;
                        player.kills++;
                    }
                }
            }
            
            res.json(parsed);
        } else {
            res.json({ narrative: aiText, gameUpdate: {} });
        }
        
    } catch (error) {
        console.error('AI Error:', error);
        res.json({
            narrative: '⚡ Радиосвязь прервана. Попробуй снова.',
            gameUpdate: {}
        });
    }
});

// ========== ЭНДПОИНТ: Перемещение ==========
app.post('/api/move', (req, res) => {
    const { playerId, location, district, position, slot } = req.body;
    const player = gameState.players[playerId];
    
    if (!player || !player.alive) {
        return res.json({ error: 'Нельзя переместиться' });
    }
    
    const oldPosition = getPositionFullName(player);
    
    // Обновляем позицию
    if (location) player.location = location;
    if (district) player.district = district;
    if (position) player.position = position;
    if (slot) player.currentSlot = slot;
    
    const newPosition = getPositionFullName(player);
    
    // Пересчёт контроля
    recalculateControl(player.location, player.district, player.position);
    
    res.json({
        success: true,
        message: `🚶 ${player.name} переместился: ${oldPosition} → ${newPosition}`,
        player
    });
});

// ========== ЭНДПОИНТ: Приказ от командира ==========
app.get('/api/commander/:playerId', async (req, res) => {
    const player = gameState.players[req.params.playerId];
    if (!player) return res.json({ error: 'Игрок не найден' });
    
    const unit = UNITS[player.faction][player.unit];
    
    // Сбор информации
    const loc = gameState.locations[player.location];
    const position = loc.districts[player.district].positions[player.position];
    
    const situation = `
Местоположение: ${getPositionFullName(player)}
Контроль позиции: РФ ${position.control.russia}% / ВСУ ${position.control.ukraine}%
Твои бойцы на этой позиции: ${Object.values(gameState.players).filter(p => p.alive && p.unit === player.unit && p.position === player.position).map(p => p.name).join(', ') || 'только ты'}
Противник на позиции: ${Object.values(gameState.players).filter(p => p.alive && p.faction !== player.faction && p.position === player.position).map(p => p.name).join(', ') || 'нет данных'}
HP бойца: ${player.hp}`;

    try {
        const prompt = `Ты — командир "${unit.name}" ${unit.emblem}. Позывной: ${unit.commanderName}. Стиль: ${unit.commanderStyle}.

СИТУАЦИЯ:
${situation}

Отдай короткий боевой приказ бойцу ${player.name}. Учти его класс (${player.class}) и обстановку. 
1-3 предложения в своём стиле. Можно использовать ненормативную лексику если это в стиле персонажа.`;

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.95,
                max_tokens: 200
            })
        });
        
        const data = await response.json();
        const order = data.choices[0].message.content;
        
        gameState.orders[player.id] = {
            text: order,
            from: unit.commanderName,
            unit: unit.name,
            timestamp: Date.now()
        };
        
        res.json({ order, commanderName: unit.commanderName, unitEmblem: unit.emblem });
        
    } catch (e) {
        res.json({ 
            order: `${unit.commanderName}: Держать позицию. При обнаружении противника — доклад.`,
            commanderName: unit.commanderName,
            unitEmblem: unit.emblem
        });
    }
});

// ========== ЭНДПОИНТ: Состояние игры ==========
app.get('/api/state', (req, res) => {
    // Считаем контроль локаций
    const locationControl = {};
    Object.keys(gameState.locations).forEach(locId => {
        locationControl[locId] = getLocationControl(locId);
    });
    
    res.json({
        locations: gameState.locations,
        players: gameState.players,
        squads: gameState.squads,
        locationControl,
        orders: gameState.orders,
        serverTime: Date.now()
    });
});

// ========== ЗАПУСК ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚔️  WarZone RP 2.0 запущен на порту ${PORT}`);
    console.log(`📍 Локаций: ${Object.keys(LOCATIONS).length}`);
    console.log(`🪖 Подразделений РФ: ${Object.keys(UNITS.russia).length}`);
    console.log(`🪖 Подразделений ВСУ: ${Object.keys(UNITS.ukraine).length}`);
    console.log(`🔑 DeepSeek API: подключён`);
});