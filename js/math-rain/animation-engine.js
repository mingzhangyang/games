/**
 * 动画引擎 - 处理游戏中的动画效果
 * Animation Engine for Math Rain Game
 */

class AnimationEngine {
    constructor() {
        this.animations = new Map(); // 存储所有活动的动画
        this.animationId = 0; // 动画ID计数器
        this.isRunning = false;
        this.lastTime = 0;
        this.callbacks = new Map(); // 动画完成回调
        
        // 动画帧请求ID
        this.rafId = null;
        
        // 绑定动画循环
        this.animate = this.animate.bind(this);
    }

    /**
     * 启动动画引擎
     */
    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.lastTime = performance.now();
            this.rafId = requestAnimationFrame(this.animate);
        }
    }

    /**
     * 停止动画引擎
     */
    stop() {
        this.isRunning = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /**
     * 暂停所有动画
     */
    pause() {
        this.isRunning = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /**
     * 恢复所有动画
     */
    resume() {
        if (!this.isRunning) {
            this.start();
        }
    }

    /**
     * 主动画循环
     */
    animate(currentTime) {
        if (!this.isRunning) return;

        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // 更新所有动画
        const completedAnimations = [];
        
        for (const [id, animation] of this.animations) {
            const isComplete = this.updateAnimation(animation, deltaTime);
            if (isComplete) {
                completedAnimations.push(id);
            }
        }

        // 清理完成的动画
        completedAnimations.forEach(id => {
            const animation = this.animations.get(id);
            this.animations.delete(id);
            
            // 执行完成回调
            if (this.callbacks.has(id)) {
                const callback = this.callbacks.get(id);
                this.callbacks.delete(id);
                callback(animation);
            }
        });

        // 继续下一帧
        this.rafId = requestAnimationFrame(this.animate);
    }

    /**
     * 更新单个动画
     * @param {Object} animation - 动画对象
     * @param {number} deltaTime - 时间差
     * @returns {boolean} 是否完成
     */
    updateAnimation(animation, deltaTime) {
        animation.elapsed += deltaTime;
        
        // 计算进度 (0-1)
        const progress = Math.min(animation.elapsed / animation.duration, 1);
        
        // 应用缓动函数
        const easedProgress = animation.easing(progress);
        
        // 根据动画类型更新属性
        switch (animation.type) {
            case 'fall':
                this.updateFallAnimation(animation, easedProgress);
                break;
            case 'fade':
                this.updateFadeAnimation(animation, easedProgress);
                break;
            case 'scale':
                this.updateScaleAnimation(animation, easedProgress);
                break;
            case 'shake':
                this.updateShakeAnimation(animation, easedProgress);
                break;
            case 'bounce':
                this.updateBounceAnimation(animation, easedProgress);
                break;
            case 'rotate':
                this.updateRotateAnimation(animation, easedProgress);
                break;
            case 'slide':
                this.updateSlideAnimation(animation, easedProgress);
                break;
        }

        return progress >= 1;
    }

    /**
     * 创建下落动画
     * @param {HTMLElement} element - 要动画的元素
     * @param {Object} options - 动画选项
     * @returns {number} 动画ID
     */
    createFallAnimation(element, options = {}) {
        const animation = {
            id: ++this.animationId,
            type: 'fall',
            element: element,
            elapsed: 0,
            duration: options.duration || 5000,
            easing: options.easing || this.easings.linear,
            
            // 下落动画特定属性
            startY: options.startY || -100,
            endY: options.endY || window.innerHeight + 100,
            startX: options.startX || element.offsetLeft,
            sway: options.sway || 0, // 摆动幅度
            swaySpeed: options.swaySpeed || 1, // 摆动速度
            
            // 初始位置
            initialX: options.startX || element.offsetLeft,
            initialY: options.startY || -100
        };

        // 设置初始位置
        element.style.position = 'absolute';
        element.style.left = animation.startX + 'px';
        element.style.top = animation.startY + 'px';
        element.style.zIndex = '10';

        this.animations.set(animation.id, animation);
        
        if (options.onComplete) {
            this.callbacks.set(animation.id, options.onComplete);
        }

        return animation.id;
    }

    /**
     * 更新下落动画
     */
    updateFallAnimation(animation, progress) {
        const currentY = animation.startY + (animation.endY - animation.startY) * progress;
        
        // 添加摆动效果
        let currentX = animation.startX;
        if (animation.sway > 0) {
            const swayOffset = Math.sin(animation.elapsed * animation.swaySpeed * 0.001) * animation.sway;
            currentX = animation.startX + swayOffset;
        }

        animation.element.style.top = currentY + 'px';
        animation.element.style.left = currentX + 'px';
    }

    /**
     * 创建淡出动画
     */
    createFadeAnimation(element, options = {}) {
        const animation = {
            id: ++this.animationId,
            type: 'fade',
            element: element,
            elapsed: 0,
            duration: options.duration || 500,
            easing: options.easing || this.easings.easeOut,
            
            startOpacity: options.from || 1,
            endOpacity: options.to || 0
        };

        element.style.opacity = animation.startOpacity;
        this.animations.set(animation.id, animation);
        
        if (options.onComplete) {
            this.callbacks.set(animation.id, options.onComplete);
        }

        return animation.id;
    }

    /**
     * 更新淡出动画
     */
    updateFadeAnimation(animation, progress) {
        const currentOpacity = animation.startOpacity + 
            (animation.endOpacity - animation.startOpacity) * progress;
        animation.element.style.opacity = currentOpacity;
    }

    /**
     * 创建缩放动画
     */
    createScaleAnimation(element, options = {}) {
        const animation = {
            id: ++this.animationId,
            type: 'scale',
            element: element,
            elapsed: 0,
            duration: options.duration || 300,
            easing: options.easing || this.easings.easeOutBack,
            
            startScale: options.from || 1,
            endScale: options.to || 1.2
        };

        this.animations.set(animation.id, animation);
        
        if (options.onComplete) {
            this.callbacks.set(animation.id, options.onComplete);
        }

        return animation.id;
    }

    /**
     * 更新缩放动画
     */
    updateScaleAnimation(animation, progress) {
        const currentScale = animation.startScale + 
            (animation.endScale - animation.startScale) * progress;
        animation.element.style.transform = `scale(${currentScale})`;
    }

    /**
     * 创建震动动画
     */
    createShakeAnimation(element, options = {}) {
        const animation = {
            id: ++this.animationId,
            type: 'shake',
            element: element,
            elapsed: 0,
            duration: options.duration || 400,
            easing: options.easing || this.easings.linear,
            
            intensity: options.intensity || 5,
            frequency: options.frequency || 20,
            originalTransform: element.style.transform || ''
        };

        this.animations.set(animation.id, animation);
        
        if (options.onComplete) {
            this.callbacks.set(animation.id, options.onComplete);
        }

        return animation.id;
    }

    /**
     * 更新震动动画
     */
    updateShakeAnimation(animation, progress) {
        const intensity = animation.intensity * (1 - progress); // 逐渐减弱
        const offsetX = (Math.random() - 0.5) * intensity * 2;
        const offsetY = (Math.random() - 0.5) * intensity * 2;
        
        animation.element.style.transform = 
            `${animation.originalTransform} translate(${offsetX}px, ${offsetY}px)`;
    }

    /**
     * 创建弹跳动画
     */
    createBounceAnimation(element, options = {}) {
        const animation = {
            id: ++this.animationId,
            type: 'bounce',
            element: element,
            elapsed: 0,
            duration: options.duration || 600,
            easing: options.easing || this.easings.bounce,
            
            startY: element.offsetTop,
            bounceHeight: options.height || 20
        };

        this.animations.set(animation.id, animation);
        
        if (options.onComplete) {
            this.callbacks.set(animation.id, options.onComplete);
        }

        return animation.id;
    }

    /**
     * 更新弹跳动画
     */
    updateBounceAnimation(animation, progress) {
        const bounceProgress = this.easings.bounce(progress);
        const currentY = animation.startY - animation.bounceHeight * bounceProgress;
        animation.element.style.top = currentY + 'px';
    }

    /**
     * 创建旋转动画
     */
    createRotateAnimation(element, options = {}) {
        const animation = {
            id: ++this.animationId,
            type: 'rotate',
            element: element,
            elapsed: 0,
            duration: options.duration || 1000,
            easing: options.easing || this.easings.linear,
            
            startRotation: options.from || 0,
            endRotation: options.to || 360,
            originalTransform: element.style.transform || ''
        };

        this.animations.set(animation.id, animation);
        
        if (options.onComplete) {
            this.callbacks.set(animation.id, options.onComplete);
        }

        return animation.id;
    }

    /**
     * 更新旋转动画
     */
    updateRotateAnimation(animation, progress) {
        const currentRotation = animation.startRotation + 
            (animation.endRotation - animation.startRotation) * progress;
        animation.element.style.transform = 
            `${animation.originalTransform} rotate(${currentRotation}deg)`;
    }

    /**
     * 创建滑动动画
     */
    createSlideAnimation(element, options = {}) {
        const animation = {
            id: ++this.animationId,
            type: 'slide',
            element: element,
            elapsed: 0,
            duration: options.duration || 500,
            easing: options.easing || this.easings.easeOut,
            
            startX: options.fromX || element.offsetLeft,
            startY: options.fromY || element.offsetTop,
            endX: options.toX || element.offsetLeft,
            endY: options.toY || element.offsetTop
        };

        this.animations.set(animation.id, animation);
        
        if (options.onComplete) {
            this.callbacks.set(animation.id, options.onComplete);
        }

        return animation.id;
    }

    /**
     * 更新滑动动画
     */
    updateSlideAnimation(animation, progress) {
        const currentX = animation.startX + (animation.endX - animation.startX) * progress;
        const currentY = animation.startY + (animation.endY - animation.startY) * progress;
        
        animation.element.style.left = currentX + 'px';
        animation.element.style.top = currentY + 'px';
    }

    /**
     * 取消指定的动画
     * @param {number} animationId - 动画ID
     */
    cancelAnimation(animationId) {
        if (this.animations.has(animationId)) {
            this.animations.delete(animationId);
            this.callbacks.delete(animationId);
        }
    }

    /**
     * 取消元素的所有动画
     * @param {HTMLElement} element - 目标元素
     */
    cancelElementAnimations(element) {
        const toCancel = [];
        for (const [id, animation] of this.animations) {
            if (animation.element === element) {
                toCancel.push(id);
            }
        }
        toCancel.forEach(id => this.cancelAnimation(id));
    }

    /**
     * 清理所有动画
     */
    clear() {
        this.animations.clear();
        this.callbacks.clear();
    }

    /**
     * 获取动画数量
     */
    getAnimationCount() {
        return this.animations.size;
    }

    /**
     * 缓动函数集合
     */
    easings = {
        linear: t => t,
        
        easeIn: t => t * t,
        easeOut: t => t * (2 - t),
        easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
        
        easeInCubic: t => t * t * t,
        easeOutCubic: t => (--t) * t * t + 1,
        easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
        
        easeInQuart: t => t * t * t * t,
        easeOutQuart: t => 1 - (--t) * t * t * t,
        easeInOutQuart: t => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
        
        easeOutBack: t => {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        },
        
        bounce: t => {
            if (t < 1 / 2.75) {
                return 7.5625 * t * t;
            } else if (t < 2 / 2.75) {
                return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
            } else if (t < 2.5 / 2.75) {
                return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
            } else {
                return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
            }
        }
    };
}

// ES模块导出
export default AnimationEngine;

// 兼容性导出（用于非模块环境）
if (typeof window !== 'undefined') {
    window.AnimationEngine = AnimationEngine;
}