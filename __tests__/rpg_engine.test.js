'use strict';
// @jest-environment jsdom

// Stubs for globals referenced by rpg_engine at module parse time
global.usageLiveData = undefined;
global.healthData = undefined;

// Mock DOM methods used by updateBars/logEvent so they don't throw
const mockEl = () => ({
    innerText: '', textContent: '', style: {}, disabled: false,
    prepend: jest.fn(),
    removeChild: jest.fn(),
    appendChild: jest.fn(),
    children: { length: 0 },
    innerHTML: ''
});
document.getElementById = jest.fn(() => mockEl());
document.querySelectorAll = jest.fn(() => []);
document.querySelector = jest.fn(() => null);

// Mock localStorage
const _store = {};
Object.defineProperty(window, 'localStorage', {
    value: {
        getItem: jest.fn((k) => _store[k] ?? null),
        setItem: jest.fn((k, v) => { _store[k] = v; }),
        removeItem: jest.fn((k) => { delete _store[k]; })
    },
    writable: true
});

// Load the module — exports { addXP, restoreQuestState, charData }
const rpg = require('../assets/rpg_engine');

beforeEach(() => {
    jest.clearAllMocks();
    // Reset charData to defaults before each test
    Object.assign(rpg.charData, {
        level: 1, xp: 0, xpMax: 500,
        hp: 1000, hpMax: 1000,
        mp: 1000, mpMax: 1000,
        cp: 50, cpMax: 1000,
        streak: 0
    });
    document.getElementById.mockReturnValue(mockEl());
    document.querySelectorAll.mockReturnValue([]);
});

// ─── addXP ───────────────────────────────────────────────────────────────────

describe('addXP', () => {
    it('increases xp by the given amount', () => {
        rpg.addXP(100);
        expect(rpg.charData.xp).toBe(100);
    });

    it('triggers level-up when xp reaches xpMax', () => {
        rpg.charData.xp = 490;
        rpg.addXP(10);
        expect(rpg.charData.level).toBe(2);
    });

    it('carries over excess XP after level-up', () => {
        rpg.charData.xp = 490;
        rpg.addXP(50);
        expect(rpg.charData.xp).toBe(40);
    });

    it('scales xpMax by floor(* 1.2) on level-up', () => {
        rpg.addXP(500);
        expect(rpg.charData.xpMax).toBe(600);
    });

    it('restores hp and mp to max on level-up', () => {
        rpg.charData.hp = 500;
        rpg.charData.mp = 300;
        rpg.charData.xp = 490;
        rpg.addXP(10);
        expect(rpg.charData.hp).toBe(1000);
        expect(rpg.charData.mp).toBe(1000);
    });

    it('decrements level when xp goes negative above level 1', () => {
        rpg.charData.level = 2;
        rpg.charData.xp = 10;
        rpg.charData.xpMax = 600;
        rpg.addXP(-50);
        expect(rpg.charData.level).toBe(1);
    });

    it('floors xp at 0 and stays at level 1 when xp goes negative at base level', () => {
        rpg.charData.level = 1;
        rpg.charData.xp = 10;
        rpg.addXP(-100);
        expect(rpg.charData.level).toBe(1);
        expect(rpg.charData.xp).toBe(0);
    });
});

// ─── restoreQuestState ───────────────────────────────────────────────────────

describe('restoreQuestState', () => {
    it('does nothing when savedArray is null', () => {
        const quests = [{ id: 'q1', completed: false }];
        expect(() => rpg.restoreQuestState(quests, null)).not.toThrow();
        expect(quests[0].completed).toBe(false);
    });

    it('does nothing when savedArray is undefined', () => {
        const quests = [{ id: 'q1', completed: false }];
        expect(() => rpg.restoreQuestState(quests, undefined)).not.toThrow();
        expect(quests[0].completed).toBe(false);
    });

    it('restores completed state by matching id', () => {
        const quests = [{ id: 'q1', completed: false }, { id: 'q2', completed: false }];
        rpg.restoreQuestState(quests, [{ id: 'q2', completed: true }]);
        expect(quests[0].completed).toBe(false);
        expect(quests[1].completed).toBe(true);
    });

    it('ignores saved entries that have no matching quest id', () => {
        const quests = [{ id: 'q1', completed: false }];
        expect(() => rpg.restoreQuestState(quests, [{ id: 'ghost', completed: true }])).not.toThrow();
        expect(quests[0].completed).toBe(false);
    });

    it('can restore multiple quests in one call', () => {
        const quests = [
            { id: 'q1', completed: false },
            { id: 'q2', completed: false },
            { id: 'q3', completed: false }
        ];
        rpg.restoreQuestState(quests, [
            { id: 'q1', completed: true },
            { id: 'q3', completed: true }
        ]);
        expect(quests[0].completed).toBe(true);
        expect(quests[1].completed).toBe(false);
        expect(quests[2].completed).toBe(true);
    });
});
