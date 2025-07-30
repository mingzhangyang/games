/**
 * 存档管理器 - 处理游戏存档和读取
 */
class SaveManager {
    constructor(game) {
        this.game = game;
        this.storageKey = 'contra_save';
        this.settingsKey = 'contra_settings';
        this.maxSaveSlots = 3;
        this.autoSaveInterval = 30000; // 30秒自动保存
        this.enableAutoSave = true;
        
        this.init();
    }
    
    init() {
        this.startAutoSave();
        this.cleanupOldSaves();
    }
    
    /**
     * 检查本地存储是否可用
     */
    isStorageAvailable() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * 保存游戏进度
     */
    saveGame(slot = 0, data = null) {
        if (!this.isStorageAvailable()) {
            console.warn('本地存储不可用，无法保存游戏');
            return false;
        }
        
        try {
            const saveData = data || this.createSaveData();
            const saves = this.loadAllSaves();
            
            saves[slot] = {
                ...saveData,
                timestamp: Date.now(),
                version: '1.0.0'
            };
            
            localStorage.setItem(this.storageKey, JSON.stringify(saves));
            console.log(`游戏已保存到存档槽 ${slot}`);
            return true;
        } catch (error) {
            console.error('保存游戏失败:', error);
            return false;
        }
    }
    
    /**
     * 加载游戏进度
     */
    loadGame(slot = 0) {
        try {
            const saves = this.loadAllSaves();
            const saveData = saves[slot];
            
            if (!saveData) {
                console.warn(`存档槽 ${slot} 为空`);
                return null;
            }
            
            return saveData;
        } catch (error) {
            console.error('加载游戏失败:', error);
            return null;
        }
    }
    
    /**
     * 加载所有存档
     */
    loadAllSaves() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('读取存档失败:', error);
            return {};
        }
    }
    
    /**
     * 创建保存数据
     */
    createSaveData() {
        const game = this.game;
        
        return {
            gameState: {
                score: game.score || 0,
                lives: game.lives || 3,
                level: game.level || 1,
                gameSpeedMultiplier: game.gameSpeedMultiplier || 1.0
            },
            player: {
                x: game.player ? game.player.x : 0,
                y: game.player ? game.player.y : 0,
                health: game.player ? game.player.health : 100,
                weaponType: game.player ? game.player.weaponType : 'normal'
            },
            enemies: game.objectManager ? game.objectManager.enemies.map(e => ({
                type: e.type,
                x: e.x,
                y: e.y,
                health: e.health
            })) : [],
            powerUps: game.objectManager ? game.objectManager.powerUps.map(p => ({
                type: p.type,
                x: p.x,
                y: p.y
            })) : []
        };
    }
    
    /**
     * 恢复游戏状态
     */
    restoreGameState(saveData) {
        if (!saveData) return false;
        
        try {
            const game = this.game;
            
            // 恢复游戏状态
            if (saveData.gameState) {
                game.score = saveData.gameState.score || 0;
                game.lives = saveData.gameState.lives || 3;
                game.level = saveData.gameState.level || 1;
                game.gameSpeedMultiplier = saveData.gameState.gameSpeedMultiplier || 1.0;
            }
            
            // 恢复玩家状态
            if (saveData.player && game.player) {
                game.player.x = saveData.player.x || 0;
                game.player.y = saveData.player.y || 0;
                game.player.health = saveData.player.health || 100;
                game.player.weaponType = saveData.player.weaponType || 'normal';
            }
            
            // 恢复敌人和道具需要更复杂的逻辑
            // 这里简化处理，实际游戏可能需要重新生成关卡
            
            return true;
        } catch (error) {
            console.error('恢复游戏状态失败:', error);
            return false;
        }
    }
    
    /**
     * 保存游戏设置
     */
    saveSettings(settings) {
        if (!this.isStorageAvailable()) return false;
        
        try {
            const defaultSettings = {
                gameSpeedMultiplier: 1.0,
                soundEnabled: true,
                musicEnabled: true,
                difficulty: 'normal',
                controls: {
                    jump: 'Space',
                    shoot: 'KeyX',
                    left: 'ArrowLeft',
                    right: 'ArrowRight'
                }
            };
            
            const mergedSettings = { ...defaultSettings, ...settings };
            localStorage.setItem(this.settingsKey, JSON.stringify(mergedSettings));
            return true;
        } catch (error) {
            console.error('保存设置失败:', error);
            return false;
        }
    }
    
    /**
     * 加载游戏设置
     */
    loadSettings() {
        try {
            const data = localStorage.getItem(this.settingsKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('加载设置失败:', error);
            return null;
        }
    }
    
    /**
     * 保存最高分
     */
    saveHighScore(score) {
        if (!this.isStorageAvailable()) return false;
        
        try {
            const highScores = this.loadHighScores();
            highScores.push({
                score: score,
                date: new Date().toISOString(),
                level: this.game.level || 1
            });
            
            // 保持最多10个最高分
            highScores.sort((a, b) => b.score - a.score);
            highScores.splice(10);
            
            localStorage.setItem('contra_highscores', JSON.stringify(highScores));
            return true;
        } catch (error) {
            console.error('保存最高分失败:', error);
            return false;
        }
    }
    
    /**
     * 加载最高分
     */
    loadHighScores() {
        try {
            const data = localStorage.getItem('contra_highscores');
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('加载最高分失败:', error);
            return [];
        }
    }
    
    /**
     * 获取最高分
     */
    getHighestScore() {
        const highScores = this.loadHighScores();
        return highScores.length > 0 ? highScores[0].score : 0;
    }
    
    /**
     * 删除存档
     */
    deleteSave(slot = 0) {
        try {
            const saves = this.loadAllSaves();
            delete saves[slot];
            localStorage.setItem(this.storageKey, JSON.stringify(saves));
            return true;
        } catch (error) {
            console.error('删除存档失败:', error);
            return false;
        }
    }
    
    /**
     * 清除所有数据
     */
    clearAllData() {
        try {
            localStorage.removeItem(this.storageKey);
            localStorage.removeItem(this.settingsKey);
            localStorage.removeItem('contra_highscores');
            console.log('所有存档数据已清除');
            return true;
        } catch (error) {
            console.error('清除数据失败:', error);
            return false;
        }
    }
    
    /**
     * 开始自动保存
     */
    startAutoSave() {
        if (this.autoSaveIntervalId) {
            clearInterval(this.autoSaveIntervalId);
        }
        
        if (this.enableAutoSave) {
            this.autoSaveIntervalId = setInterval(() => {
                if (this.game.gameState === 'playing') {
                    this.saveGame(0); // 使用快速存档槽
                    console.log('自动保存完成');
                }
            }, this.autoSaveInterval);
        }
    }
    
    /**
     * 停止自动保存
     */
    stopAutoSave() {
        if (this.autoSaveIntervalId) {
            clearInterval(this.autoSaveIntervalId);
            this.autoSaveIntervalId = null;
        }
    }
    
    /**
     * 清理旧存档
     */
    cleanupOldSaves() {
        try {
            const saves = this.loadAllSaves();
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            
            let cleaned = false;
            Object.keys(saves).forEach(slot => {
                if (saves[slot].timestamp && saves[slot].timestamp < thirtyDaysAgo) {
                    delete saves[slot];
                    cleaned = true;
                }
            });
            
            if (cleaned) {
                localStorage.setItem(this.storageKey, JSON.stringify(saves));
                console.log('已清理旧存档');
            }
        } catch (error) {
            console.error('清理旧存档失败:', error);
        }
    }
    
    /**
     * 导出存档数据
     */
    exportSaveData() {
        try {
            const data = {
                saves: this.loadAllSaves(),
                settings: this.loadSettings(),
                highScores: this.loadHighScores(),
                exportDate: new Date().toISOString()
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { 
                type: 'application/json' 
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `contra-save-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            return true;
        } catch (error) {
            console.error('导出存档失败:', error);
            return false;
        }
    }
    
    /**
     * 导入存档数据
     */
    importSaveData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    if (data.saves) {
                        localStorage.setItem(this.storageKey, JSON.stringify(data.saves));
                    }
                    if (data.settings) {
                        localStorage.setItem(this.settingsKey, JSON.stringify(data.settings));
                    }
                    if (data.highScores) {
                        localStorage.setItem('contra_highscores', JSON.stringify(data.highScores));
                    }
                    
                    console.log('存档导入成功');
                    resolve(true);
                } catch (error) {
                    console.error('导入存档失败:', error);
                    reject(error);
                }
            };
            reader.readAsText(file);
        });
    }
}