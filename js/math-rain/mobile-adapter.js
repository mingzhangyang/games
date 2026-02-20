/**
 * Mobile Adapter for Math Rain Game
 * Handles mobile-specific functionality and optimizations
 */

class MobileAdapter {
    constructor() {
        this.isMobile = this.detectMobile();
        this.isTouch = 'ontouchstart' in window;
        this.orientation = this.getOrientation();
        this.viewportHeight = window.innerHeight;
        this.isInitialized = false;
        
        // Performance tracking
        this.performanceMode = this.detectPerformanceMode();
        this.viewportChangeDebounceMs = this.performanceMode.low ? 120 : 0;
        
        // Gesture handling
        this.gestureStartX = 0;
        this.gestureStartY = 0;
        this.gestureStartTime = 0;
        
        this.initialize();
    }

    /**
     * Detect if device is mobile
     */
    detectMobile() {
        const userAgent = navigator.userAgent.toLowerCase();
        const mobileKeywords = ['mobile', 'android', 'iphone', 'ipad', 'tablet', 'blackberry', 'opera mini'];
        return mobileKeywords.some(keyword => userAgent.includes(keyword)) || 
               window.matchMedia('(max-width: 768px)').matches;
    }

    /**
     * Detect device performance capabilities
     */
    detectPerformanceMode() {
        // Check for low-end devices
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const memoryInfo = navigator.deviceMemory || 4; // Default to 4GB if not available
        const hardwareConcurrency = navigator.hardwareConcurrency || 4;
        
        // Low performance indicators
        const isLowEnd = 
            memoryInfo < 2 ||
            hardwareConcurrency < 4 ||
            (connection && connection.effectiveType && ['slow-2g', '2g', '3g'].includes(connection.effectiveType));
            
        return {
            low: isLowEnd,
            medium: !isLowEnd && memoryInfo < 6,
            high: memoryInfo >= 6 && hardwareConcurrency >= 8
        };
    }

    /**
     * Get device orientation
     */
    getOrientation() {
        return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    }

    /**
     * Initialize mobile adapter
     */
    initialize() {
        if (this.isInitialized || !this.isMobile) return;

        this.setupViewportHandling();
        this.setupTouchHandling();
        this.setupPerformanceOptimizations();
        this.setupOrientationHandling();
        this.setupGestureHandling();
        
        this.isInitialized = true;
        console.log('🔧 Mobile Adapter initialized', {
            isMobile: this.isMobile,
            isTouch: this.isTouch,
            orientation: this.orientation,
            performance: this.performanceMode
        });
    }

    /**
     * Setup viewport handling for mobile devices
     */
    setupViewportHandling() {
        const updateViewportState = () => {
            const newHeight = window.innerHeight;
            const heightDiff = Math.abs(newHeight - this.viewportHeight);
            
            // Significant height change likely means keyboard appeared/disappeared
            if (heightDiff > 150) {
                this.handleKeyboardToggle(newHeight < this.viewportHeight);
                this.viewportHeight = newHeight;
            }
            
            // Update orientation
            const newOrientation = this.getOrientation();
            if (newOrientation !== this.orientation) {
                this.orientation = newOrientation;
                this.handleOrientationChange(newOrientation);
            }
        };

        const handleViewportChange = this.viewportChangeDebounceMs > 0
            ? this.debounce(updateViewportState, this.viewportChangeDebounceMs)
            : updateViewportState;

        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('orientationchange', () => {
            setTimeout(updateViewportState, 100); // Delay to ensure viewport has updated
        });

        // Prevent zoom on double tap
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (event) => {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    }

    /**
     * Setup touch handling optimizations
     */
    setupTouchHandling() {
        // Improve touch responsiveness
        document.addEventListener('touchstart', (e) => {
            // Add active class for immediate visual feedback
            const target = e.target.closest('.difficulty-btn, .control-btn, .menu-btn, .start-btn, .tool-btn, .buy-btn');
            if (target) {
                target.classList.add('mobile-active');
                setTimeout(() => target.classList.remove('mobile-active'), 150);
            }
        }, { passive: true });

        // Prevent context menu on long press for game elements
        const gameElements = '#game-canvas, .control-btn, .tool-btn, .difficulty-btn';
        document.addEventListener('contextmenu', (e) => {
            if (e.target.matches(gameElements) || e.target.closest(gameElements)) {
                e.preventDefault();
            }
        });

        // Prevent text selection in game area
        document.addEventListener('selectstart', (e) => {
            if (e.target.closest('#game-container')) {
                e.preventDefault();
            }
        });
    }

    /**
     * Setup performance optimizations based on device capabilities
     */
    setupPerformanceOptimizations() {
        if (this.performanceMode.low) {
            console.log('🔥 Applying low-end device optimizations');
            
            // Disable complex animations
            document.documentElement.style.setProperty('--animation-duration', '0.1s');
            document.documentElement.style.setProperty('--transition-duration', '0.1s');
            
            // Reduce particle effects
            this.applyLowEndSettings();
        } else if (this.performanceMode.medium) {
            console.log('⚡ Applying medium performance optimizations');
            document.documentElement.style.setProperty('--animation-duration', '0.2s');
            document.documentElement.style.setProperty('--transition-duration', '0.2s');
        }
    }

    /**
     * Apply settings for low-end devices
     */
    applyLowEndSettings() {
        // Disable animations for better performance
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 768px) {
                * {
                    animation-duration: 0.1s !important;
                    animation-iteration-count: 1 !important;
                    transition-duration: 0.1s !important;
                }
                
                .screen-content {
                    backdrop-filter: none !important;
                }
                
                #game-header {
                    backdrop-filter: none !important;
                }
                
                .tool-bar {
                    backdrop-filter: none !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Debounce utility to avoid running expensive handlers too frequently
     */
    debounce(callback, delay) {
        let timeoutId = null;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => callback(...args), delay);
        };
    }

    /**
     * Handle orientation changes
     */
    setupOrientationHandling() {
        this.handleOrientationChange(this.orientation);
    }

    /**
     * Handle orientation change
     */
    handleOrientationChange(newOrientation) {
        console.log(`📱 Orientation changed to: ${newOrientation}`);
        
        // Update CSS classes
        document.body.classList.remove('orientation-portrait', 'orientation-landscape');
        document.body.classList.add(`orientation-${newOrientation}`);
        
        // Adjust UI for orientation
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) {
            if (newOrientation === 'landscape' && window.innerHeight < 500) {
                gameContainer.classList.add('landscape-compact');
            } else {
                gameContainer.classList.remove('landscape-compact');
            }
        }

        // Emit orientation change event
        if (typeof window !== 'undefined' && window.mathRainGame && window.mathRainGame.eventSystem) {
            window.mathRainGame.eventSystem.emit('mobile:orientation:changed', {
                orientation: newOrientation,
                width: window.innerWidth,
                height: window.innerHeight
            });
        }
    }

    /**
     * Handle virtual keyboard appearance/disappearance
     */
    handleKeyboardToggle(keyboardVisible) {
        console.log(`⌨️ Virtual keyboard ${keyboardVisible ? 'shown' : 'hidden'}`);
        
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) {
            if (keyboardVisible) {
                gameContainer.classList.add('keyboard-visible');
            } else {
                gameContainer.classList.remove('keyboard-visible');
            }
        }
    }

    /**
     * Setup gesture handling
     */
    setupGestureHandling() {
        const gameCanvas = document.getElementById('game-canvas');
        if (!gameCanvas) return;

        // Touch start
        gameCanvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                this.gestureStartX = touch.clientX;
                this.gestureStartY = touch.clientY;
                this.gestureStartTime = Date.now();
            }
        }, { passive: true });

        // Touch end - detect swipes and taps
        gameCanvas.addEventListener('touchend', (e) => {
            if (e.changedTouches.length === 1) {
                const touch = e.changedTouches[0];
                const deltaX = touch.clientX - this.gestureStartX;
                const deltaY = touch.clientY - this.gestureStartY;
                const deltaTime = Date.now() - this.gestureStartTime;
                const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                // Detect swipe gestures
                if (distance > 50 && deltaTime < 300) {
                    const swipeDirection = this.getSwipeDirection(deltaX, deltaY);
                    this.handleSwipe(swipeDirection, touch.clientX, touch.clientY);
                }
            }
        }, { passive: true });
    }

    /**
     * Get swipe direction
     */
    getSwipeDirection(deltaX, deltaY) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        
        if (absX > absY) {
            return deltaX > 0 ? 'right' : 'left';
        } else {
            return deltaY > 0 ? 'down' : 'up';
        }
    }

    /**
     * Handle swipe gestures
     */
    handleSwipe(direction, x, y) {
        console.log(`👆 Swipe detected: ${direction} at (${x}, ${y})`);

        // Emit swipe event
        if (typeof window !== 'undefined' && window.mathRainGame && window.mathRainGame.eventSystem) {
            window.mathRainGame.eventSystem.emit('mobile:swipe', {
                direction,
                x,
                y
            });
        }

        // Handle specific swipe actions
        switch (direction) {
            case 'up':
                // Could trigger special action or show shop
                break;
            case 'down':
                // Could pause game or show menu
                break;
            case 'left':
            case 'right':
                // Could switch between tools
                break;
        }
    }

    /**
     * Add mobile-specific styles
     */
    addMobileStyles() {
        if (!this.isMobile) return;

        const style = document.createElement('style');
        style.textContent = `
            .mobile-active {
                transform: scale(0.95) !important;
                opacity: 0.8 !important;
                transition: transform 0.1s ease, opacity 0.1s ease !important;
            }
            
            .orientation-landscape.landscape-compact #game-header {
                padding: 4px 8px !important;
                min-height: 40px !important;
            }
            
            .orientation-landscape.landscape-compact .score-display span:last-child,
            .orientation-landscape.landscape-compact .combo-display span:last-child,
            .orientation-landscape.landscape-compact .level-display span:last-child,
            .orientation-landscape.landscape-compact .time-display span:last-child,
            .orientation-landscape.landscape-compact .lives-display span:last-child {
                font-size: 14px !important;
            }
            
            .keyboard-visible #target-area {
                padding: 10px 15px !important;
            }
            
            .keyboard-visible #target-number {
                font-size: 32px !important;
            }
            
            /* High contrast mode for outdoor visibility */
            @media (prefers-contrast: high) {
                .control-btn, .menu-btn, .start-btn {
                    border-width: 3px !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Get current device info
     */
    getDeviceInfo() {
        return {
            isMobile: this.isMobile,
            isTouch: this.isTouch,
            orientation: this.orientation,
            viewportSize: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            performance: this.performanceMode,
            pixelRatio: window.devicePixelRatio || 1,
            connection: navigator.connection ? {
                effectiveType: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink
            } : null
        };
    }

    /**
     * Destroy mobile adapter
     */
    destroy() {
        this.isInitialized = false;
        console.log('🔧 Mobile Adapter destroyed');
    }
}

// Export for ES modules
export default MobileAdapter;

// Auto-initialize if in browser environment
if (typeof window !== 'undefined') {
    window.MobileAdapter = MobileAdapter;
    
    // Auto-initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (!window.mobileAdapter) {
                window.mobileAdapter = new MobileAdapter();
                window.mobileAdapter.addMobileStyles();
            }
        });
    } else {
        if (!window.mobileAdapter) {
            window.mobileAdapter = new MobileAdapter();
            window.mobileAdapter.addMobileStyles();
        }
    }
}
