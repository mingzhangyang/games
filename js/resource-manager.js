// 资源管理器
class ResourceManager {
    constructor() {
        this.resources = new Map();
        this.loadingPromises = new Map();
        this.loadedCount = 0;
        this.totalCount = 0;
        this.onProgress = null;
        this.onComplete = null;
        
        // 资源类型处理器
        this.handlers = {
            image: this.loadImage.bind(this),
            audio: this.loadAudio.bind(this),
            json: this.loadJSON.bind(this),
            text: this.loadText.bind(this)
        };
        
        // 预加载队列
        this.preloadQueue = [];
        this.isPreloading = false;
    }

    // 添加资源到预加载队列
    addToPreload(resources) {
        if (Array.isArray(resources)) {
            this.preloadQueue.push(...resources);
        } else {
            this.preloadQueue.push(resources);
        }
        this.totalCount = this.preloadQueue.length;
    }

    // 开始预加载
    async preloadAll(onProgress = null, onComplete = null) {
        if (this.isPreloading) {
            console.warn('资源正在预加载中...');
            return;
        }
        
        this.isPreloading = true;
        this.onProgress = onProgress;
        this.onComplete = onComplete;
        this.loadedCount = 0;
        
        console.log(`开始预加载 ${this.totalCount} 个资源...`);
        
        try {
            const promises = this.preloadQueue.map(resource => this.load(resource.id, resource.url, resource.type));
            await Promise.all(promises);
            
            console.log('所有资源预加载完成');
            if (this.onComplete) {
                this.onComplete();
            }
        } catch (error) {
            console.error('资源预加载失败:', error);
            throw error;
        } finally {
            this.isPreloading = false;
        }
    }

    // 加载单个资源
    async load(id, url, type = 'image') {
        // 如果资源已存在，直接返回
        if (this.resources.has(id)) {
            return this.resources.get(id);
        }
        
        // 如果正在加载，返回现有的Promise
        if (this.loadingPromises.has(id)) {
            return this.loadingPromises.get(id);
        }
        
        // 检查处理器是否存在
        if (!this.handlers[type]) {
            throw new Error(`不支持的资源类型: ${type}`);
        }
        
        // 创建加载Promise
        const loadPromise = this.handlers[type](url)
            .then(resource => {
                this.resources.set(id, resource);
                this.loadingPromises.delete(id);
                
                this.loadedCount++;
                if (this.onProgress) {
                    this.onProgress(this.loadedCount, this.totalCount, id);
                }
                
                console.log(`资源加载完成: ${id}`);
                return resource;
            })
            .catch(error => {
                this.loadingPromises.delete(id);
                console.error(`资源加载失败: ${id}`, error);
                throw error;
            });
        
        this.loadingPromises.set(id, loadPromise);
        return loadPromise;
    }

    // 加载图片
    loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
                // 创建离屏canvas进行预处理
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                
                // 应用像素化效果
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, 0, 0);
                
                resolve({
                    element: img,
                    canvas: canvas,
                    width: img.width,
                    height: img.height,
                    loaded: true
                });
            };
            
            img.onerror = () => {
                reject(new Error(`图片加载失败: ${url}`));
            };
            
            img.src = url;
        });
    }

    // 加载音频
    loadAudio(url) {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            
            const onCanPlayThrough = () => {
                audio.removeEventListener('canplaythrough', onCanPlayThrough);
                audio.removeEventListener('error', onError);
                
                resolve({
                    element: audio,
                    duration: audio.duration,
                    loaded: true
                });
            };
            
            const onError = () => {
                audio.removeEventListener('canplaythrough', onCanPlayThrough);
                audio.removeEventListener('error', onError);
                reject(new Error(`音频加载失败: ${url}`));
            };
            
            audio.addEventListener('canplaythrough', onCanPlayThrough);
            audio.addEventListener('error', onError);
            
            audio.preload = 'auto';
            audio.src = url;
        });
    }

    // 加载JSON
    async loadJSON(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            return {
                data: data,
                loaded: true
            };
        } catch (error) {
            throw new Error(`JSON加载失败: ${url} - ${error.message}`);
        }
    }

    // 加载文本
    async loadText(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const text = await response.text();
            return {
                data: text,
                loaded: true
            };
        } catch (error) {
            throw new Error(`文本加载失败: ${url} - ${error.message}`);
        }
    }

    // 获取资源
    get(id) {
        const resource = this.resources.get(id);
        if (!resource) {
            console.warn(`资源不存在: ${id}`);
            return null;
        }
        return resource;
    }

    // 检查资源是否存在
    has(id) {
        return this.resources.has(id);
    }

    // 释放资源
    release(id) {
        const resource = this.resources.get(id);
        if (resource) {
            // 清理资源
            if (resource.element) {
                if (resource.element.tagName === 'IMG') {
                    resource.element.src = '';
                } else if (resource.element.tagName === 'AUDIO') {
                    resource.element.pause();
                    resource.element.src = '';
                }
            }
            
            if (resource.canvas) {
                const ctx = resource.canvas.getContext('2d');
                ctx.clearRect(0, 0, resource.canvas.width, resource.canvas.height);
            }
            
            this.resources.delete(id);
            console.log(`资源已释放: ${id}`);
            return true;
        }
        return false;
    }

    // 释放所有资源
    releaseAll() {
        const ids = Array.from(this.resources.keys());
        ids.forEach(id => this.release(id));
        console.log(`已释放 ${ids.length} 个资源`);
    }

    // 获取加载进度
    getProgress() {
        return {
            loaded: this.loadedCount,
            total: this.totalCount,
            percentage: this.totalCount > 0 ? (this.loadedCount / this.totalCount) * 100 : 0,
            isLoading: this.isPreloading
        };
    }

    // 获取内存使用情况
    getMemoryUsage() {
        let totalSize = 0;
        const breakdown = {
            images: 0,
            audio: 0,
            json: 0,
            text: 0,
            other: 0
        };
        
        this.resources.forEach((resource, id) => {
            let size = 0;
            
            if (resource.element) {
                if (resource.element.tagName === 'IMG') {
                    // 估算图片内存使用 (width * height * 4 bytes per pixel)
                    size = resource.width * resource.height * 4;
                    breakdown.images += size;
                } else if (resource.element.tagName === 'AUDIO') {
                    // 估算音频内存使用 (duration * sample rate * channels * bytes per sample)
                    size = (resource.duration || 0) * 44100 * 2 * 2;
                    breakdown.audio += size;
                }
            } else if (resource.data) {
                // 估算数据大小
                size = JSON.stringify(resource.data).length * 2; // UTF-16
                if (typeof resource.data === 'string') {
                    breakdown.text += size;
                } else {
                    breakdown.json += size;
                }
            } else {
                breakdown.other += 1024; // 默认1KB
            }
            
            totalSize += size;
        });
        
        return {
            total: totalSize,
            breakdown: breakdown,
            count: this.resources.size,
            formatted: this.formatBytes(totalSize)
        };
    }

    // 格式化字节数
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // 创建精灵表
    createSpriteSheet(imageId, spriteData) {
        const image = this.get(imageId);
        if (!image) {
            console.error(`精灵表图片不存在: ${imageId}`);
            return null;
        }
        
        const sprites = {};
        
        for (const [spriteName, data] of Object.entries(spriteData)) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = data.width;
            canvas.height = data.height;
            ctx.imageSmoothingEnabled = false;
            
            ctx.drawImage(
                image.element,
                data.x, data.y, data.width, data.height,
                0, 0, data.width, data.height
            );
            
            sprites[spriteName] = {
                canvas: canvas,
                width: data.width,
                height: data.height,
                loaded: true
            };
        }
        
        return sprites;
    }

    // 预生成常用资源
    generateCommonResources() {
        // 生成像素化字体
        this.generatePixelFont();
        
        // 生成基础形状
        this.generateBasicShapes();
        
        // 生成渐变背景
        this.generateGradients();
    }

    generatePixelFont() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 64;
        
        ctx.imageSmoothingEnabled = false;
        ctx.font = '16px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';
        
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
        let x = 0;
        
        for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], x, 0);
            x += 16;
            if (x >= canvas.width) {
                x = 0;
            }
        }
        
        this.resources.set('pixel-font', {
            canvas: canvas,
            width: canvas.width,
            height: canvas.height,
            loaded: true
        });
    }

    generateBasicShapes() {
        const shapes = ['circle', 'square', 'triangle'];
        
        shapes.forEach(shape => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 32;
            canvas.height = 32;
            
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = '#ffffff';
            
            switch (shape) {
                case 'circle':
                    ctx.beginPath();
                    ctx.arc(16, 16, 12, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                case 'square':
                    ctx.fillRect(4, 4, 24, 24);
                    break;
                case 'triangle':
                    ctx.beginPath();
                    ctx.moveTo(16, 4);
                    ctx.lineTo(28, 28);
                    ctx.lineTo(4, 28);
                    ctx.closePath();
                    ctx.fill();
                    break;
            }
            
            this.resources.set(`shape-${shape}`, {
                canvas: canvas,
                width: canvas.width,
                height: canvas.height,
                loaded: true
            });
        });
    }

    generateGradients() {
        const gradients = [
            { name: 'sky', colors: ['#87CEEB', '#4169E1'] },
            { name: 'sunset', colors: ['#FF6B6B', '#4ECDC4'] },
            { name: 'fire', colors: ['#FF4500', '#FFD700'] }
        ];
        
        gradients.forEach(({ name, colors }) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 256;
            canvas.height = 256;
            
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, colors[0]);
            gradient.addColorStop(1, colors[1]);
            
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            this.resources.set(`gradient-${name}`, {
                canvas: canvas,
                width: canvas.width,
                height: canvas.height,
                loaded: true
            });
        });
    }
}

// 全局资源管理器实例
window.resourceManager = new ResourceManager();