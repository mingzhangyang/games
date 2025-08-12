/**
 * Centralized Error Handler for Math Rain Game
 * Manages all error handling, logging, and user notifications
 */

class ErrorHandler {
    constructor(eventSystem) {
        this.eventSystem = eventSystem;
        this.errors = [];
        this.maxErrorHistory = 50;
        this.isInitialized = false;
        
        // Error severity levels
        this.SEVERITY = {
            LOW: 'low',
            MEDIUM: 'medium',
            HIGH: 'high',
            CRITICAL: 'critical'
        };
        
        // Error categories
        this.CATEGORY = {
            INITIALIZATION: 'initialization',
            RUNTIME: 'runtime',
            NETWORK: 'network',
            USER_INPUT: 'user_input',
            PERFORMANCE: 'performance',
            RENDERING: 'rendering'
        };
        
        this.initialize();
    }

    /**
     * Initialize error handler
     */
    initialize() {
        if (this.isInitialized) {
            return;
        }

        // Setup global error listeners
        this.setupGlobalErrorHandling();
        
        // Setup promise rejection handling
        this.setupPromiseRejectionHandling();
        
        this.isInitialized = true;
    }

    /**
     * Setup global error handling
     */
    setupGlobalErrorHandling() {
        window.addEventListener('error', (event) => {
            this.handleGlobalError(event);
        });
    }

    /**
     * Setup unhandled promise rejection handling
     */
    setupPromiseRejectionHandling() {
        window.addEventListener('unhandledrejection', (event) => {
            this.handlePromiseRejection(event);
        });
    }

    /**
     * Handle global JavaScript errors
     * @param {ErrorEvent} event - Error event
     */
    handleGlobalError(event) {
        const errorInfo = {
            message: event.message || 'Unknown error',
            filename: event.filename || 'Unknown file',
            lineno: event.lineno || 'Unknown line',
            colno: event.colno || 'Unknown column',
            error: event.error,
            stack: event.error ? event.error.stack : null,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        this.logError(
            errorInfo.message,
            this.CATEGORY.RUNTIME,
            this.SEVERITY.HIGH,
            errorInfo
        );

        // Show user-friendly error message
        this.showUserErrorMessage(this.getText('gameError'));

        // Emit error event
        this.eventSystem.emit('error:global', errorInfo);
    }

    /**
     * Handle unhandled promise rejections
     * @param {PromiseRejectionEvent} event - Promise rejection event
     */
    handlePromiseRejection(event) {
        const errorInfo = {
            reason: event.reason,
            message: event.reason ? event.reason.message || event.reason : 'Promise rejected',
            stack: event.reason ? event.reason.stack : null,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        this.logError(
            `Unhandled Promise Rejection: ${errorInfo.message}`,
            this.CATEGORY.RUNTIME,
            this.SEVERITY.MEDIUM,
            errorInfo
        );

        // Prevent the default handling
        event.preventDefault();

        // Emit error event
        this.eventSystem.emit('error:promise:rejection', errorInfo);
    }

    /**
     * Log an error
     * @param {string} message - Error message
     * @param {string} category - Error category
     * @param {string} severity - Error severity
     * @param {Object} details - Additional error details
     */
    logError(message, category = this.CATEGORY.RUNTIME, severity = this.SEVERITY.MEDIUM, details = {}) {
        const errorRecord = {
            id: this.generateErrorId(),
            message,
            category,
            severity,
            details,
            timestamp: new Date().toISOString(),
            resolved: false
        };

        // Add to error history
        this.errors.push(errorRecord);

        // Maintain error history limit
        if (this.errors.length > this.maxErrorHistory) {
            this.errors.shift();
        }

        // Log to console based on severity
        this.logToConsole(errorRecord);

        // Emit error logged event
        this.eventSystem.emit('error:logged', errorRecord);

        return errorRecord.id;
    }

    /**
     * Log error to console with appropriate method
     * @param {Object} errorRecord - Error record
     */
    logToConsole(errorRecord) {
        const logMessage = `[${errorRecord.severity.toUpperCase()}] [${errorRecord.category}] ${errorRecord.message}`;
        
        switch (errorRecord.severity) {
            case this.SEVERITY.CRITICAL:
                console.error(logMessage, errorRecord.details);
                break;
            case this.SEVERITY.HIGH:
                console.error(logMessage, errorRecord.details);
                break;
            case this.SEVERITY.MEDIUM:
                console.warn(logMessage, errorRecord.details);
                break;
            case this.SEVERITY.LOW:
                console.info(logMessage, errorRecord.details);
                break;
            default:
                console.log(logMessage, errorRecord.details);
        }
    }

    /**
     * Handle initialization errors
     * @param {string} component - Component name
     * @param {Error} error - Error object
     */
    handleInitializationError(component, error) {
        const message = `Failed to initialize ${component}: ${error.message}`;
        
        this.logError(
            message,
            this.CATEGORY.INITIALIZATION,
            this.SEVERITY.CRITICAL,
            {
                component,
                error: error.message,
                stack: error.stack
            }
        );

        // Show critical error message to user
        this.showUserErrorMessage(
            `${this.getText('componentInitError')}: ${component}`
        );
    }

    /**
     * Handle network errors
     * @param {string} url - Failed URL
     * @param {Error} error - Error object
     * @param {Object} options - Additional options
     */
    handleNetworkError(url, error, options = {}) {
        const message = `Network error loading ${url}: ${error.message}`;
        
        this.logError(
            message,
            this.CATEGORY.NETWORK,
            this.SEVERITY.HIGH,
            {
                url,
                error: error.message,
                status: options.status,
                statusText: options.statusText
            }
        );

        // Emit network error event for potential retry logic
        this.eventSystem.emit('error:network', {
            url,
            error,
            options
        });
    }

    /**
     * Handle performance errors
     * @param {string} operation - Operation that failed
     * @param {Object} metrics - Performance metrics
     */
    handlePerformanceError(operation, metrics = {}) {
        const message = `Performance issue in ${operation}`;
        
        this.logError(
            message,
            this.CATEGORY.PERFORMANCE,
            this.SEVERITY.MEDIUM,
            {
                operation,
                metrics
            }
        );
    }

    /**
     * Handle rendering errors
     * @param {string} component - Rendering component
     * @param {Error} error - Error object
     */
    handleRenderingError(component, error) {
        const message = `Rendering error in ${component}: ${error.message}`;
        
        this.logError(
            message,
            this.CATEGORY.RENDERING,
            this.SEVERITY.HIGH,
            {
                component,
                error: error.message,
                stack: error.stack
            }
        );
    }

    /**
     * Show user-friendly error message
     * @param {string} message - Message to show
     * @param {Object} options - Display options
     */
    showUserErrorMessage(message, options = {}) {
        const {
            duration = 5000,
            allowDismiss = true,
            severity = 'error'
        } = options;

        // Create error notification
        const errorDiv = document.createElement('div');
        errorDiv.className = `error-notification ${severity}`;
        errorDiv.innerHTML = `
            <div class="error-content">
                <div class="error-icon">⚠️</div>
                <div class="error-text">${message}</div>
                ${allowDismiss ? `<button class="error-dismiss" onclick="this.parentElement.parentElement.remove()">${this.getText('confirmButton')}</button>` : ''}
            </div>
        `;

        // Add styles
        this.addErrorStyles(errorDiv);

        // Add to DOM
        document.body.appendChild(errorDiv);

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                if (errorDiv.parentElement) {
                    errorDiv.remove();
                }
            }, duration);
        }

        // Emit notification shown event
        this.eventSystem.emit('error:notification:shown', {
            message,
            duration,
            severity
        });
    }

    /**
     * Add styles to error notification
     * @param {HTMLElement} element - Error element
     */
    addErrorStyles(element) {
        element.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #e53e3e;
            color: white;
            padding: 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 400px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            animation: slideInRight 0.3s ease-out;
        `;

        // Add animation styles
        if (!document.getElementById('error-notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'error-notification-styles';
            styles.textContent = `
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                .error-content {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .error-icon {
                    font-size: 20px;
                }
                .error-text {
                    flex: 1;
                    font-size: 14px;
                    line-height: 1.4;
                }
                .error-dismiss {
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .error-dismiss:hover {
                    background: rgba(255,255,255,0.3);
                }
            `;
            document.head.appendChild(styles);
        }
    }

    /**
     * Get localized text
     * @param {string} key - Text key
     * @returns {string} Localized text
     */
    getText(key) {
        try {
            // Try to get from global LANGUAGES object
            if (typeof window !== 'undefined' && window.LANGUAGES && window.currentLanguage) {
                const texts = window.LANGUAGES[window.currentLanguage];
                if (texts && texts[key]) {
                    return texts[key];
                }
            }
            
            // Default texts
            const defaultTexts = {
                gameError: '游戏出现错误，已自动暂停。',
                gameLoadError: '游戏加载失败，请刷新页面重试',
                componentInitError: '组件初始化失败',
                canvasNotFound: '找不到game-canvas元素',
                questionBankLoadError: '题库加载失败',
                questionBankFallback: '回退到实时生成模式',
                gameInitError: '游戏初始化失败',
                confirmButton: '确定',
                networkError: '网络连接错误',
                performanceWarning: '性能警告',
                renderingError: '渲染错误'
            };
            
            return defaultTexts[key] || key;
        } catch (error) {
            return key;
        }
    }

    /**
     * Generate unique error ID
     * @returns {string} Error ID
     */
    generateErrorId() {
        return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Mark error as resolved
     * @param {string} errorId - Error ID
     */
    resolveError(errorId) {
        const error = this.errors.find(e => e.id === errorId);
        if (error) {
            error.resolved = true;
            error.resolvedAt = new Date().toISOString();
            
            this.eventSystem.emit('error:resolved', error);
        }
    }

    /**
     * Get error history
     * @param {Object} filters - Filters to apply
     * @returns {Array} Filtered error history
     */
    getErrorHistory(filters = {}) {
        let filteredErrors = [...this.errors];

        if (filters.category) {
            filteredErrors = filteredErrors.filter(e => e.category === filters.category);
        }

        if (filters.severity) {
            filteredErrors = filteredErrors.filter(e => e.severity === filters.severity);
        }

        if (filters.resolved !== undefined) {
            filteredErrors = filteredErrors.filter(e => e.resolved === filters.resolved);
        }

        if (filters.limit) {
            filteredErrors = filteredErrors.slice(-filters.limit);
        }

        return filteredErrors;
    }

    /**
     * Clear error history
     * @param {Object} filters - Filters for which errors to clear
     */
    clearErrorHistory(filters = {}) {
        if (Object.keys(filters).length === 0) {
            // Clear all
            this.errors = [];
        } else {
            // Clear filtered errors
            this.errors = this.errors.filter(error => {
                if (filters.category && error.category === filters.category) return false;
                if (filters.severity && error.severity === filters.severity) return false;
                if (filters.resolved !== undefined && error.resolved === filters.resolved) return false;
                return true;
            });
        }

        this.eventSystem.emit('error:history:cleared', filters);
    }

    /**
     * Get error statistics
     * @returns {Object} Error statistics
     */
    getErrorStatistics() {
        const stats = {
            total: this.errors.length,
            byCategory: {},
            bySeverity: {},
            resolved: this.errors.filter(e => e.resolved).length,
            unresolved: this.errors.filter(e => !e.resolved).length
        };

        // Count by category
        for (const category of Object.values(this.CATEGORY)) {
            stats.byCategory[category] = this.errors.filter(e => e.category === category).length;
        }

        // Count by severity
        for (const severity of Object.values(this.SEVERITY)) {
            stats.bySeverity[severity] = this.errors.filter(e => e.severity === severity).length;
        }

        return stats;
    }

    /**
     * Destroy the error handler
     */
    destroy() {
        // Remove event listeners
        window.removeEventListener('error', this.handleGlobalError);
        window.removeEventListener('unhandledrejection', this.handlePromiseRejection);
        
        // Clear error history
        this.errors = [];
        
        // Clear event system reference
        this.eventSystem = null;
        
        this.isInitialized = false;
    }
}

// ES Module export
export default ErrorHandler;

// CommonJS compatibility
if (typeof window !== 'undefined') {
    window.ErrorHandler = ErrorHandler;
}